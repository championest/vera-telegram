import { genAI, MODEL_NAME } from '../gemini.js';
import { toolDefinitions } from '../tools/definitions.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
import { loadFactsForPrompt } from '../tools/facts.js';
import type { Content } from '@google/generative-ai';

const TOOL_LABELS: Record<string, string> = {
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
};

function toolsToLabel(toolNames: string[]): string {
  const labels = toolNames.map(n => TOOL_LABELS[n] ?? `🔧 ${n}`);
  return labels.join(' · ');
}

export async function handleUserMessage(
  userId: string,
  userText: string,
  onProgress?: (text: string) => Promise<void>,
): Promise<string> {
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
  const geminiHistory: Content[] = firstUserIdx > 0 ? rawHistory.slice(firstUserIdx) : rawHistory;

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    systemInstruction: buildSystemPrompt(new Date(), longTermMemory),
    tools: [{ functionDeclarations: toolDefinitions }],
  });

  const chat = model.startChat({ history: geminiHistory });

  let result = await chat.sendMessage(userText);

  // Agentic tool loop — cap at 12 rounds to prevent runaway loops
  for (let round = 0; round < 12; round++) {
    const parts = result.response.candidates?.[0]?.content.parts ?? [];
    const fnCalls = parts.filter(p => p.functionCall);

    if (fnCalls.length === 0) break;

    const toolNames = fnCalls.map(p => p.functionCall!.name);
    if (onProgress) {
      await onProgress(`⏳ ${toolsToLabel(toolNames)}...`);
    }

    const fnResponses = await Promise.all(
      fnCalls.map(async p => {
        const fn = p.functionCall!;
        const output = await executeToolCall(fn.name, fn.args as Record<string, unknown>, userId);
        return {
          functionResponse: {
            name: fn.name,
            response: { result: output },
          },
        };
      })
    );

    result = await chat.sendMessage(fnResponses);
  }

  // .text() throws if response is blocked or has no text part — handle gracefully
  let text: string;
  try {
    text = result.response.text();
  } catch {
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      text = 'Gemini บล็อก response นี้ค่ะ (safety filter) — ลองถามใหม่ด้วยคำอื่นได้เลย';
    } else {
      text = 'ไม่สามารถรับ response จาก Gemini ได้ค่ะ — กรุณาลองใหม่อีกครั้ง';
    }
  }
  if (!text?.trim()) text = '✅ ดำเนินการเสร็จแล้วค่ะ';

  await appendMessage(userId, 'assistant', text);
  return text;
}

export async function handleMediaMessage(
  userId: string,
  buffer: Buffer,
  mimeType: string,
  caption: string | null
): Promise<string> {
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
    const fnCalls = parts.filter((p: any) => p.functionCall);
    if (fnCalls.length === 0) break;

    const fnResponses = await Promise.all(
      fnCalls.map(async (p: any) => {
        const fn = p.functionCall!;
        const output = await executeToolCall(fn.name, fn.args as Record<string, unknown>, userId);
        return { functionResponse: { name: fn.name, response: { result: output } } };
      })
    );
    result = await (model as any).generateContent([
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
