import type Anthropic from '@anthropic-ai/sdk';
import { saveIdea } from './save-idea.js';
import { setReminder } from './set-reminder.js';
import { listReminders } from './list-reminders.js';
import { logTeamTask } from './log-team-task.js';
import { searchMemory } from './search-memory.js';

export async function executeToolCall(
  toolUse: Anthropic.ToolUseBlock,
  userId: string
): Promise<string> {
  const input = toolUse.input as Record<string, unknown>;

  switch (toolUse.name) {
    case 'save_idea':      return saveIdea(input);
    case 'set_reminder':   return setReminder(input, userId);
    case 'list_reminders': return listReminders(input, userId);
    case 'log_team_task':  return logTeamTask(input, userId);
    case 'search_memory':  return searchMemory(input, userId);
    default:
      return `Unknown tool: ${toolUse.name}`;
  }
}
