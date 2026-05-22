import { runAgent, type NormalizedFile } from '../llm-router.js';

export async function handleUserMessage(
  userId: string,
  userText: string,
  onProgress?: (text: string) => Promise<void>,
  sendUpdate?: (text: string) => Promise<void>,
  claudeModel?: string,
  files?: NormalizedFile[],
): Promise<string> {
  return runAgent({ userId, userText, onProgress, sendUpdate, files, claudeModel });
}

export async function handleMediaMessage(
  userId: string,
  buffer: Buffer,
  mimeType: string,
  caption: string | null,
  filename?: string,
): Promise<string> {
  const userText = caption ?? '';
  const files: NormalizedFile[] = [{ buffer, mimeType, filename }];
  return runAgent({ userId, userText, files });
}
