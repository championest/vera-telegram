import { genAI, MODEL_NAME, FALLBACK_MODEL, withRetry } from './gemini.js';
import { toolDefinitions } from './tools/definitions.js';
import { executeToolCall } from './tools/handlers.js';
import { loadHistory, appendMessage } from './memory/conversation.js';
import { buildSystemPrompt } from './persona/vera.js';
import { loadFactsForPrompt } from './tools/facts.js';
const TOOL_LABELS = {
    web_search: '🔍 ค้นข้อมูล',
    fetch_url: '🌐 ดึง URL',
    gmail_list_unread: '📧 ดูอีเมลใหม่',
    gmail_search: '🔍 ค้นอีเมล',
    gmail_read: '📧 อ่านอีเมล',
    gmail_send: '📤 ส่งอีเมล',
    gmail_create_draft: '📝 สร้าง draft',
    calendar_list_events: '📅 ดูตารางนัด',
    calendar_create_event: '📅 สร้างนัดหมาย',
    save_champ_task: '📋 บันทึกงาน',
    log_finance: '💰 บันทึกการเงิน',
    quick_sale: '🛒 บันทึกการขาย',
    add_preorder: '📦 บันทึก pre-order',
    save_vision: '🎯 บันทึกเป้าหมาย',
    save_idea: '💡 บันทึกไอเดีย',
    set_reminder: '⏰ ตั้ง reminder',
    log_team_task: '📋 สั่งงานทีม',
    search_memory: '🧠 ค้นความทรงจำ',
    save_fact: '🧠 บันทึก fact',
    save_research: '📚 บันทึก research',
    google_drive_save: '💾 บันทึก Drive',
    notebooklm_create: '📓 สร้าง NotebookLM',
    read_google_doc: '📄 อ่าน Google Doc',
    read_google_sheet: '📊 อ่าน Google Sheet',
};
export async function runGeminiLoop(opts, modelName) {
    const { userText, userId, onProgress, sendUpdate, attachments, skipAppend } = opts;
    if (!skipAppend) {
        await appendMessage(userId, 'user', userText);
    }
    const [history, longTermMemory] = await Promise.all([
        loadHistory(userId),
        loadFactsForPrompt(userId),
    ]);
    const systemInstruction = buildSystemPrompt(new Date(), longTermMemory);
    const model = genAI.getGenerativeModel({
        model: modelName ?? MODEL_NAME,
        systemInstruction,
        tools: [{ functionDeclarations: toolDefinitions }],
    });
    // Build chat history (exclude last user message — sent below)
    const chatHistory = history.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    }));
    const chat = model.startChat({ history: chatHistory });
    const initialParts = [
        ...(attachments ?? []),
        { text: userText },
    ];
    let result = await withRetry(() => chat.sendMessage(initialParts));
    const executedTools = [];
    for (let round = 0; round < 12; round++) {
        const response = result.response;
        const calls = response.functionCalls?.();
        if (!calls || calls.length === 0) {
            const text = response.text();
            const finalText = text?.trim() ||
                (executedTools.length > 0
                    ? `✅ เสร็จแล้ว\nดำเนินการ: ${executedTools.map(t => TOOL_LABELS[t] ?? t).join(' → ')}`
                    : '✅ ดำเนินการเสร็จแล้ว');
            await appendMessage(userId, 'assistant', finalText);
            return finalText;
        }
        const toolNames = calls.map(c => c.name);
        executedTools.push(...toolNames);
        if (onProgress) {
            const labels = toolNames.map(n => TOOL_LABELS[n] ?? `🔧 ${n}`).join(' · ');
            await onProgress(`⏳ ${labels}...`);
        }
        const functionResponses = await Promise.all(calls.map(async (call) => {
            const output = await executeToolCall(call.name, (call.args ?? {}), userId);
            if (sendUpdate && ['save_research', 'google_drive_save', 'notebooklm_create'].includes(call.name)) {
                try {
                    await sendUpdate(`✅ ${TOOL_LABELS[call.name] ?? call.name} เสร็จ`);
                }
                catch { /* non-fatal */ }
            }
            return {
                functionResponse: {
                    name: call.name,
                    response: { content: output },
                },
            };
        }));
        result = await withRetry(() => chat.sendMessage(functionResponses));
    }
    const fallback = '⚠️ ดำเนินการเสร็จแล้ว (ถึง limit การทำงาน)';
    await appendMessage(userId, 'assistant', fallback);
    return fallback;
}
export { MODEL_NAME as GEMINI_PRIMARY, FALLBACK_MODEL as GEMINI_FALLBACK };
