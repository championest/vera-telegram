import { genAI, MODEL_NAME } from '../gemini.js';
import { toolDefinitions } from '../tools/definitions.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
import { loadFactsForPrompt } from '../tools/facts.js';
import type { Content } from '@google/generative-ai';

export async function handleUserMessage(userId: string, userText: string): Promise<string> {
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
