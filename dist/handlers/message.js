import { genAI, MODEL_NAME } from '../gemini.js';
import { toolDefinitions } from '../tools/definitions.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
export async function handleUserMessage(userId, userText) {
    await appendMessage(userId, 'user', userText);
    const history = await loadHistory(userId);
    // Convert history to Gemini Content format (exclude the last user message — sent via sendMessage)
    const geminiHistory = history.slice(0, -1).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    }));
    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: buildSystemPrompt(new Date()),
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
