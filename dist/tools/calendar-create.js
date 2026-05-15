import { google } from 'googleapis';
import { getAuthedClient, isConnected } from '../services/google-auth.js';
const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';
export async function calendarCreateEvent(args) {
    if (!await isConnected())
        return NOT_CONNECTED;
    const auth = await getAuthedClient();
    if (!auth)
        return NOT_CONNECTED;
    const calendar = google.calendar({ version: 'v3', auth });
    const title = String(args.title ?? '');
    const startDateTime = String(args.start_datetime ?? '');
    const endDateTime = String(args.end_datetime ?? '');
    const description = args.description ? String(args.description) : undefined;
    const location = args.location ? String(args.location) : undefined;
    const allDay = Boolean(args.all_day);
    if (!title || !startDateTime)
        return 'กรุณาระบุ title และ start_datetime ค่ะ';
    const event = {
        summary: title,
        description,
        location,
    };
    if (allDay) {
        event.start = { date: startDateTime.slice(0, 10) };
        event.end = { date: (endDateTime || startDateTime).slice(0, 10) };
    }
    else {
        event.start = { dateTime: startDateTime, timeZone: 'Asia/Bangkok' };
        event.end = {
            dateTime: endDateTime || new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString(),
            timeZone: 'Asia/Bangkok',
        };
    }
    const res = await calendar.events.insert({ calendarId: 'primary', requestBody: event });
    return [
        `สร้างนัดหมายสำเร็จค่ะ ✅`,
        `*${res.data.summary}*`,
        `🕐 ${new Date(res.data.start?.dateTime ?? res.data.start?.date ?? '').toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
        location ? `📍 ${location}` : '',
        `ID: \`${res.data.id}\``,
    ].filter(Boolean).join('\n');
}
