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
