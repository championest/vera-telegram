import { saveIdea } from './save-idea.js';
import { setReminder } from './set-reminder.js';
import { listReminders } from './list-reminders.js';
import { logTeamTask } from './log-team-task.js';
import { searchMemory } from './search-memory.js';

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<string> {
  switch (name) {
    case 'save_idea':      return saveIdea(args);
    case 'set_reminder':   return setReminder(args, userId);
    case 'list_reminders': return listReminders(args, userId);
    case 'log_team_task':  return logTeamTask(args, userId);
    case 'search_memory':  return searchMemory(args, userId);
    default:
      return `Unknown tool: ${name}`;
  }
}
