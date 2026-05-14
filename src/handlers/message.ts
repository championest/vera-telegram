import { anthropic, MODEL } from '../anthropic.js';
import { toolDefinitions } from '../tools/definitions.js';
import { executeToolCall } from '../tools/handlers.js';
import { loadHistory, appendMessage } from '../memory/conversation.js';
import { buildSystemPrompt } from '../persona/vera.js';
import type Anthropic from '@anthropic-ai/sdk';

export async function handleUserMessage(userId: string, userText: string): Promise<string> {
  await appendMessage(userId, 'user', userText);

  const history = await loadHistory(userId);

  const messages: Anthropic.MessageParam[] = history.length > 0
    ? history.slice(0, -1).concat([{ role: 'user', content: userText }])
    : [{ role: 'user', content: userText }];

  const systemPrompt = buildSystemPrompt(new Date());
  let currentMessages = [...messages];

  while (true) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: currentMessages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      await appendMessage(userId, 'assistant', text);
      return text;
    }

    if (response.stop_reason === 'tool_use') {
      currentMessages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeToolCall(block, userId);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }
      currentMessages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  return 'ขออภัยค่ะ ไม่สามารถประมวลผลได้ในขณะนี้';
}
