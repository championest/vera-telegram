import { anthropic, claudeTools, SONNET } from '../anthropic-client.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
import { loadFactsForPrompt } from '../tools/facts.js';
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
};
export async function handleUserMessage(userId, userText, onProgress, sendUpdate, model = SONNET) {
    await appendMessage(userId, 'user', userText);
    const [history, longTermMemory] = await Promise.all([
        loadHistory(userId),
        loadFactsForPrompt(userId),
    ]);
    const systemPrompt = buildSystemPrompt(new Date(), longTermMemory);
    // Build messages from history (exclude the last user message — we'll pass it separately)
    const historyMessages = history.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
    }));
    // Current user message
    const messages = [
        ...historyMessages,
        { role: 'user', content: userText },
    ];
    const executedTools = [];
    // Agentic loop — cap at 12 rounds
    for (let round = 0; round < 12; round++) {
        const response = await anthropic.messages.create({
            model,
            max_tokens: 8096,
            system: systemPrompt,
            tools: claudeTools,
            messages,
        });
        if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
            const textBlock = response.content.find(b => b.type === 'text');
            const text = textBlock?.type === 'text' ? textBlock.text : '';
            const finalText = text?.trim() ||
                (executedTools.length > 0
                    ? `✅ เสร็จแล้ว\nดำเนินการ: ${executedTools.map(t => TOOL_LABELS[t] ?? t).join(' → ')}`
                    : '✅ ดำเนินการเสร็จแล้ว');
            await appendMessage(userId, 'assistant', finalText);
            return finalText;
        }
        if (response.stop_reason !== 'tool_use') {
            const textBlock = response.content.find(b => b.type === 'text');
            const text = textBlock?.type === 'text' ? textBlock.text : '✅ เสร็จแล้ว';
            await appendMessage(userId, 'assistant', text);
            return text;
        }
        // Tool use round
        const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
        const toolNames = toolUseBlocks.map(b => b.name);
        executedTools.push(...toolNames);
        if (onProgress) {
            const labels = toolNames.map(n => TOOL_LABELS[n] ?? `🔧 ${n}`).join(' · ');
            await onProgress(`⏳ ${labels}...`);
        }
        // Append assistant turn with tool_use blocks
        messages.push({ role: 'assistant', content: response.content });
        // Execute all tool calls in parallel
        const toolResults = await Promise.all(toolUseBlocks.map(async (block) => {
            const output = await executeToolCall(block.name, block.input, userId);
            if (sendUpdate && ['save_research', 'google_drive_save', 'notebooklm_create'].includes(block.name)) {
                try {
                    await sendUpdate(`✅ ${TOOL_LABELS[block.name] ?? block.name} เสร็จ`);
                }
                catch { /* non-fatal */ }
            }
            return {
                type: 'tool_result',
                tool_use_id: block.id,
                content: output,
            };
        }));
        // Append user turn with tool results
        messages.push({ role: 'user', content: toolResults });
    }
    // Exceeded max rounds
    const fallback = '⚠️ ดำเนินการเสร็จแล้ว (ถึง limit การทำงาน)';
    await appendMessage(userId, 'assistant', fallback);
    return fallback;
}
export async function handleMediaMessage(userId, buffer, mimeType, caption) {
    const [longTermMemory] = await Promise.all([loadFactsForPrompt(userId)]);
    const systemPrompt = buildSystemPrompt(new Date(), longTermMemory);
    await appendMessage(userId, 'user', caption || '[ส่งไฟล์มา]');
    const base64 = buffer.toString('base64');
    const mediaType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const response = await anthropic.messages.create({
        model: SONNET,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mediaType, data: base64 },
                    },
                    ...(caption ? [{ type: 'text', text: caption }] : []),
                ],
            }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    const text = textBlock?.type === 'text' ? textBlock.text : '✅ รับไฟล์แล้ว';
    await appendMessage(userId, 'assistant', text);
    return text;
}
