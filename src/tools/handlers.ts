import { saveIdea } from './save-idea.js';
import { setReminder } from './set-reminder.js';
import { listReminders } from './list-reminders.js';
import { cancelReminder } from './cancel-reminder.js';
import { snoozeReminder } from './snooze-reminder.js';
import { logTeamTask } from './log-team-task.js';
import { searchMemory } from './search-memory.js';
import { gmailListUnread, gmailSearch, gmailRead, gmailMarkRead, gmailTrash } from './gmail-read.js';
import { gmailSend } from './gmail-send.js';
import { calendarListEvents } from './calendar-list.js';
import { calendarCreateEvent } from './calendar-create.js';
import { getSessionContext, writeNoteToClaude, readAceNotes } from './session-bridge.js';

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    switch (name) {
      case 'save_idea':            return await saveIdea(args);
      case 'set_reminder':         return await setReminder(args, userId);
      case 'list_reminders':       return await listReminders(args, userId);
      case 'cancel_reminder':      return await cancelReminder(args, userId);
      case 'snooze_reminder':      return await snoozeReminder(args, userId);
      case 'log_team_task':        return await logTeamTask(args, userId);
      case 'search_memory':        return await searchMemory(args, userId);
      case 'gmail_list_unread':    return await gmailListUnread(args);
      case 'gmail_search':         return await gmailSearch(args);
      case 'gmail_read':           return await gmailRead(args);
      case 'gmail_send':           return await gmailSend(args);
      case 'gmail_mark_read':      return await gmailMarkRead(args);
      case 'gmail_trash':          return await gmailTrash(args);
      case 'calendar_list_events': return await calendarListEvents(args);
      case 'calendar_create_event':return await calendarCreateEvent(args);
      case 'get_session_context':  return await getSessionContext(args);
      case 'write_note_to_claude': return await writeNoteToClaude(args);
      case 'read_ace_notes':       return await readAceNotes(args);
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err: any) {
    console.error(`[Tool error] ${name}:`, err);
    return `ขออภัยค่ะ tool ${name} เจอข้อผิดพลาด: ${err.message ?? 'unknown error'}`;
  }
}
