import { google } from 'googleapis';
import { getAuthedClient, isConnected, friendlyGoogleError } from '../services/google-auth.js';

const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';
const CALENDAR_API = 'calendar-json.googleapis.com';

export type CalendarFetch =
  | { ok: true; events: any[] }
  | { ok: false; message: string };

/** Fetch upcoming primary-calendar events, mapping auth/config errors to
 *  friendly messages. Shared by the formatter (calendarListEvents) and the
 *  Firestore sync (syncCalendar) so both handle a disabled API / dead token
 *  identically. */
export async function fetchCalendarEvents(days: number, maxResults: number): Promise<CalendarFetch> {
  if (!await isConnected()) return { ok: false, message: NOT_CONNECTED };
  const auth = await getAuthedClient();
  if (!auth) return { ok: false, message: NOT_CONNECTED };

  const calendar = google.calendar({ version: 'v3', auth });
  const now = new Date();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  try {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return { ok: true, events: res.data.items ?? [] };
  } catch (e) {
    const friendly = await friendlyGoogleError(e, 'Calendar', CALENDAR_API);
    if (friendly) return { ok: false, message: friendly };
    throw e;
  }
}

function formatEventDate(start: any): string {
  if (start.dateTime) {
    return new Date(start.dateTime).toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return new Date(start.date!).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export async function calendarListEvents(args: Record<string, unknown>): Promise<string> {
  const maxResults = Number(args.max_results ?? 10);
  const days = Number(args.days ?? 7);

  const result = await fetchCalendarEvents(days, maxResults);
  if (!result.ok) return result.message;

  const events = result.events;
  if (events.length === 0) return `ไม่มีนัดใน ${days} วันข้างหน้าค่ะ`;

  const lines = [`*นัดหมายใน ${days} วันข้างหน้า (${events.length} รายการ)*\n`];
  for (const ev of events) {
    const start = ev.start!;
    lines.push(`• *${ev.summary ?? '(ไม่มีชื่อ)'}*`);
    lines.push(`  🕐 ${formatEventDate(start)}`);
    if (ev.location) lines.push(`  📍 ${ev.location}`);
    if (ev.description) lines.push(`  📝 ${ev.description.slice(0, 100)}`);
    lines.push(`  ID: \`${ev.id}\`\n`);
  }
  return lines.join('\n');
}
