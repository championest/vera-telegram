import { saveIdea } from './save-idea.js';
import { setReminder } from './set-reminder.js';
import { listReminders } from './list-reminders.js';
import { logTeamTask } from './log-team-task.js';
import { searchMemory } from './search-memory.js';
import { gmailListUnread, gmailSearch, gmailRead } from './gmail-read.js';
import { gmailSend } from './gmail-send.js';
import { calendarListEvents } from './calendar-list.js';
import { calendarCreateEvent } from './calendar-create.js';
import { getSessionContext, writeNoteToClaude } from './session-bridge.js';

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<string> {
  switch (name) {
    case 'save_idea':            return saveIdea(args);
    case 'set_reminder':         return setReminder(args, userId);
    case 'list_reminders':       return listReminders(args, userId);
    case 'log_team_task':        return logTeamTask(args, userId);
    case 'search_memory':        return searchMemory(args, userId);
    case 'gmail_list_unread':    return gmailListUnread(args);
    case 'gmail_search':         return gmailSearch(args);
    case 'gmail_read':           return gmailRead(args);
    case 'gmail_send':           return gmailSend(args);
    case 'calendar_list_events': return calendarListEvents(args);
    case 'calendar_create_event':return calendarCreateEvent(args);
    case 'get_session_context':  return getSessionContext(args);
    case 'write_note_to_claude': return writeNoteToClaude(args);
    default:
      return `Unknown tool: ${name}`;
  }
}
