import { runAgent } from '../llm-router.js';
export async function handleUserMessage(userId, userText, onProgress, sendUpdate, claudeModel, files) {
    return runAgent({ userId, userText, onProgress, sendUpdate, files, claudeModel });
}
export async function handleMediaMessage(userId, buffer, mimeType, caption, filename) {
    const userText = caption ?? '';
    const files = [{ buffer, mimeType, filename }];
    return runAgent({ userId, userText, files });
}
