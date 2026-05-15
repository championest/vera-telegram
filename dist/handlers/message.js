import { genAI, MODEL_NAME } from '../gemini.js';
import { toolDefinitions } from '../tools/definitions.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
import { loadFactsForPrompt } from '../tools/facts.js';
export async function handleUserMessage(userId, userText) {
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
    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: buildSystemPrompt(new Date(), longTermMemory),
        tools: [{ functionDeclarations: toolDefinitions }],
    });
    const chat = model.startChat({ history: geminiHistory });
    let result = await chat.sendMessage(userText);
    // Agentic tool loop
    while (true) {
        const parts = result.response.candidates?.[0]?.content.parts ?? [];
        const fnCalls = parts.filter(p => p.functionCall);
        if (fnCalls.length === 0)
            break;
        const fnResponses = await Promise.all(fnCalls.map(async (p) => {
            const fn = p.functionCall;
            const output = await executeToolCall(fn.name, fn.args, userId);
            return {
                functionResponse: {
                    name: fn.name,
                    response: { result: output },
                },
            };
        }));
        result = await chat.sendMessage(fnResponses);
    }
    const text = result.response.text();
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
