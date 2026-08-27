import Anthropic from '@anthropic-ai/sdk';
import { anthropic, claudeTools, SONNET } from './anthropic-client.js';
import { executeToolCall } from './tools/handlers.js';
import { loadHistory, appendMessage } from './memory/conversation.js';
import { buildSystemPrompt } from './persona/vera.js';
import { loadFactsForPrompt } from './tools/facts.js';
import { prefetchRecall } from './memory/recall.js';

const TOOL_LABELS: Record<string, string> = {
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

export interface ClaudeLoopOptions {
  userId: string;
  userText: string;
  attachments?: Anthropic.ContentBlockParam[];
  onProgress?: (text: string) => Promise<void>;
  sendUpdate?: (text: string) => Promise<void>;
  skipAppend?: boolean;
  model?: string;
}

export async function runClaudeLoop(opts: ClaudeLoopOptions): Promise<string> {
  const { userId, userText, attachments, onProgress, sendUpdate, skipAppend, model = SONNET } = opts;

  if (!skipAppend) {
    await appendMessage(userId, 'user', userText);
  }

  const [history, longTermMemory, recall] = await Promise.all([
    loadHistory(userId),
    loadFactsForPrompt(userId),
    prefetchRecall(userId, userText),
  ]);

  const systemPrompt = buildSystemPrompt(new Date(), longTermMemory + recall);

  const historyMessages: Anthropic.MessageParam[] = history.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  const firstUserContent: Anthropic.ContentBlockParam[] = [
    ...(attachments ?? []),
    { type: 'text', text: userText || '[ดูไฟล์ที่แนบมา]' },
  ];

  const messages: Anthropic.MessageParam[] = [
    ...historyMessages,
    { role: 'user', content: firstUserContent },
  ];

  const executedTools: string[] = [];

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

    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
    const toolNames = toolUseBlocks.map(b => b.name);
    executedTools.push(...toolNames);

    if (onProgress) {
      const labels = toolNames.map(n => TOOL_LABELS[n] ?? `🔧 ${n}`).join(' · ');
      await onProgress(`⏳ ${labels}...`);
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async block => {
        const output = await executeToolCall(block.name, block.input as Record<string, unknown>, userId);
        if (sendUpdate && ['save_research', 'google_drive_save', 'notebooklm_create'].includes(block.name)) {
          try { await sendUpdate(`✅ ${TOOL_LABELS[block.name] ?? block.name} เสร็จ`); } catch { /* non-fatal */ }
        }
        return {
          type: 'tool_result' as const,
          tool_use_id: block.id,
          content: output,
        };
      })
    );

    messages.push({ role: 'user', content: toolResults });
  }

  const fallback = '⚠️ ดำเนินการเสร็จแล้ว (ถึง limit การทำงาน)';
  await appendMessage(userId, 'assistant', fallback);
  return fallback;
}
