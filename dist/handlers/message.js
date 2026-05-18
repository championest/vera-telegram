import { genAI, MODEL_NAME, withRetry, withFallback } from '../gemini.js';
import { toolDefinitions } from '../tools/definitions.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
import { loadFactsForPrompt } from '../tools/facts.js';
const TOOL_LABELS = {
    web_search: '🔍 ค้นข้อมูลจากเว็บ',
    fetch_url: '🌐 ดึงข้อมูลจาก URL',
    gmail_list_unread: '📧 ดูอีเมลใหม่',
    gmail_search: '🔍 ค้นอีเมล',
    gmail_read: '📧 อ่านอีเมล',
    gmail_send: '📤 ส่งอีเมล',
    gmail_create_draft: '📝 สร้าง draft',
    gmail_list_drafts: '📝 ดู drafts',
    gmail_mark_read: '📧 mark อ่านแล้ว',
    gmail_trash: '🗑️ ลบอีเมล',
    calendar_list_events: '📅 ดูตารางนัด',
    calendar_create_event: '📅 สร้างนัดหมาย',
    calendar_update_event: '📅 แก้นัดหมาย',
    calendar_delete_event: '📅 ลบนัดหมาย',
    save_idea: '💡 บันทึกไอเดีย',
    set_reminder: '⏰ ตั้ง reminder',
    list_reminders: '⏰ ดู reminders',
    cancel_reminder: '⏰ ยกเลิก reminder',
    snooze_reminder: '⏰ เลื่อน reminder',
    log_team_task: '📋 สั่งงานทีม',
    search_memory: '🧠 ค้นความทรงจำ',
    save_fact: '🧠 บันทึก fact',
    recall_facts: '🧠 ดู facts',
    get_session_context: '💼 ดูสถานะทีม',
    write_note_to_claude: '📝 ฝากโน้ตให้ Ace',
    read_ace_notes: '📝 อ่านโน้ตจาก Ace',
    save_research: '📚 บันทึก research',
    list_research: '📚 ดูรายการ research',
    get_research: '📚 ดู research',
    google_drive_save: '💾 บันทึก Google Drive',
    notebooklm_create: '📓 สร้าง NotebookLM',
};
/** Tools that warrant a sendUpdate notification after completion */
const MAJOR_TOOLS = new Set(['web_search', 'save_research', 'google_drive_save', 'notebooklm_create']);
function buildUpdateMessage(toolName, result) {
    switch (toolName) {
        case 'web_search':
            return '✅ ค้นเสร็จ — พบข้อมูล';
        case 'save_research': {
            // Try to extract ID from result string like "ID: abc123"
            const idMatch = result.match(/ID:\s*(\S+)/);
            return idMatch ? `✅ บันทึก Firestore · ID: ${idMatch[1]}` : '✅ บันทึก Firestore';
        }
        case 'google_drive_save': {
            // Try to extract link from result
            const linkMatch = result.match(/ลิงก์:\s*(https?:\/\/\S+)/);
            return linkMatch ? `✅ Drive บันทึกแล้ว · ${linkMatch[1]}` : '✅ Drive บันทึกแล้ว';
        }
        case 'notebooklm_create': {
            const linkMatch = result.match(/ลิงก์:\s*(https?:\/\/\S+)/);
            return linkMatch ? `✅ NotebookLM พร้อม · ${linkMatch[1]}` : '✅ NotebookLM พร้อม';
        }
        default:
            return null;
    }
}
function toolsToLabel(toolNames) {
    const labels = toolNames.map(n => TOOL_LABELS[n] ?? `🔧 ${n}`);
    return labels.join(' · ');
}
export async function handleUserMessage(userId, userText, onProgress, sendUpdate) {
    await appendMessage(userId, 'user', userText);
    const [history, longTermMemory] = await Promise.all([
        loadHistory(userId),
        loadFactsForPrompt(userId),
    ]);
    // Convert history to Gemini Content format (exclude the last user message — sent via sendMessage)
    // Gemini requires history to start with 'user' role — drop leading model messages if history is corrupted
    const rawHistory = history.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    }));
    const firstUserIdx = rawHistory.findIndex(m => m.role === 'user');
    const geminiHistory = firstUserIdx > 0 ? rawHistory.slice(firstUserIdx) : rawHistory;
    let chat;
    let result = await withFallback(async (modelName) => {
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: buildSystemPrompt(new Date(), longTermMemory),
            tools: [{ functionDeclarations: toolDefinitions }],
        });
        chat = model.startChat({ history: geminiHistory });
        return chat.sendMessage(userText);
    });
    const executedTools = [];
    // Agentic tool loop — cap at 12 rounds to prevent runaway loops
    for (let round = 0; round < 12; round++) {
        const parts = result.response.candidates?.[0]?.content.parts ?? [];
        const fnCalls = parts.filter(p => p.functionCall);
        if (fnCalls.length === 0)
            break;
        const toolNames = fnCalls.map(p => p.functionCall.name);
        executedTools.push(...toolNames);
        if (onProgress) {
            await onProgress(`⏳ ${toolsToLabel(toolNames)}...`);
        }
        const fnResponses = await Promise.all(fnCalls.map(async (p) => {
            const fn = p.functionCall;
            const output = await executeToolCall(fn.name, fn.args, userId);
            // Send a NEW message for major tool completions
            if (sendUpdate && MAJOR_TOOLS.has(fn.name)) {
                const updateMsg = buildUpdateMessage(fn.name, output);
                if (updateMsg) {
                    try {
                        await sendUpdate(updateMsg);
                    }
                    catch { /* non-fatal */ }
                }
            }
            return {
                functionResponse: {
                    name: fn.name,
                    response: { result: output },
                },
            };
        }));
        result = await withRetry(() => chat.sendMessage(fnResponses));
    }
    // .text() throws if response is blocked or has no text part — handle gracefully
    let text;
    try {
        text = result.response.text();
    }
    catch {
        const finishReason = result.response.candidates?.[0]?.finishReason;
        if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
            text = 'Gemini บล็อก response นี้ค่ะ (safety filter) — ลองถามใหม่ด้วยคำอื่นได้เลย';
        }
        else {
            text = 'ไม่สามารถรับ response จาก Gemini ได้ค่ะ — กรุณาลองใหม่อีกครั้ง';
        }
    }
    if (!text?.trim()) {
        if (executedTools.length > 0) {
            const summary = executedTools.map(t => TOOL_LABELS[t] ?? t).join(' → ');
            text = `✅ เสร็จแล้วค่ะ\nดำเนินการ: ${summary}`;
        }
        else {
            text = '✅ ดำเนินการเสร็จแล้วค่ะ';
        }
    }
    await appendMessage(userId, 'assistant', text);
    return text;
}
export async function handleMediaMessage(userId, buffer, mimeType, caption) {
    const [longTermMemory] = await Promise.all([loadFactsForPrompt(userId)]);
    const isAudio = mimeType.startsWith('audio/');
    const contextHint = isAudio
        ? 'คุณ Champ ส่ง voice message มา — transcribe แล้วตอบสนองตามที่ขอ'
        : `คุณ Champ ส่งรูปมา${caption ? ` พร้อม caption: "${caption}"` : ''} — วิเคราะห์และช่วยเหลือตามที่เห็น`;
    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: buildSystemPrompt(new Date(), longTermMemory),
        tools: [{ functionDeclarations: toolDefinitions }],
    });
    let result = await model.generateContent([
        { inlineData: { data: buffer.toString('base64'), mimeType } },
        { text: contextHint },
    ]);
    // Allow tool calls from media messages too
    while (true) {
        const parts = result.response.candidates?.[0]?.content.parts ?? [];
        const fnCalls = parts.filter((p) => p.functionCall);
        if (fnCalls.length === 0)
            break;
        const fnResponses = await Promise.all(fnCalls.map(async (p) => {
            const fn = p.functionCall;
            const output = await executeToolCall(fn.name, fn.args, userId);
            return { functionResponse: { name: fn.name, response: { result: output } } };
        }));
        result = await model.generateContent([
            { inlineData: { data: buffer.toString('base64'), mimeType } },
            { text: contextHint },
            ...fnResponses,
        ]);
        break; // single tool pass for media
    }
    const text = result.response.text();
    const memLabel = isAudio ? '[Voice message]' : `[Photo${caption ? `: ${caption}` : ''}]`;
    await appendMessage(userId, 'user', memLabel);
    await appendMessage(userId, 'assistant', text);
    return text;
}
