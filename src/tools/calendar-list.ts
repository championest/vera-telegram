import { google } from 'googleapis';
import { getAuthedClient, isConnected } from '../services/google-auth.js';

const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';

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
  if (!await isConnected()) return NOT_CONNECTED;
  const auth = await getAuthedClient();
  if (!auth) return NOT_CONNECTED;

  const calendar = google.calendar({ version: 'v3', auth });
  const maxResults = Number(args.max_results ?? 10);
  const days = Number(args.days ?? 7);

  const now = new Date();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items ?? [];
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
