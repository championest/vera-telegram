import { google } from 'googleapis';
import { getAuthedClient, isConnected, friendlyGoogleError } from '../services/google-auth.js';
const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';
const CALENDAR_API = 'calendar-json.googleapis.com';
export async function calendarUpdateEvent(args) {
    if (!await isConnected())
        return NOT_CONNECTED;
    const auth = await getAuthedClient();
    if (!auth)
        return NOT_CONNECTED;
    const eventId = String(args.event_id ?? '').trim();
    if (!eventId)
        return 'กรุณาระบุ event_id ค่ะ';
    const calendar = google.calendar({ version: 'v3', auth });
    const patch = {};
    if (args.title)
        patch['summary'] = args.title;
    if (args.description)
        patch['description'] = args.description;
    if (args.location)
        patch['location'] = args.location;
    if (args.start_datetime) {
        const isAllDay = args.all_day === true || !String(args.start_datetime).includes('T');
        patch['start'] = isAllDay
            ? { date: String(args.start_datetime).slice(0, 10) }
            : { dateTime: args.start_datetime, timeZone: 'Asia/Bangkok' };
    }
    if (args.end_datetime) {
        const isAllDay = args.all_day === true || !String(args.end_datetime).includes('T');
        patch['end'] = isAllDay
            ? { date: String(args.end_datetime).slice(0, 10) }
            : { dateTime: args.end_datetime, timeZone: 'Asia/Bangkok' };
    }
    try {
        await calendar.events.patch({ calendarId: 'primary', eventId, requestBody: patch });
    }
    catch (e) {
        const friendly = await friendlyGoogleError(e, 'Calendar', CALENDAR_API);
        if (friendly)
            return friendly;
        throw e;
    }
    return `อัพเดตนัด ${eventId} สำเร็จค่ะ ✅`;
}
export async function calendarDeleteEvent(args) {
    if (!await isConnected())
        return NOT_CONNECTED;
    const auth = await getAuthedClient();
    if (!auth)
        return NOT_CONNECTED;
    const eventId = String(args.event_id ?? '').trim();
    if (!eventId)
        return 'กรุณาระบุ event_id ค่ะ';
    const calendar = google.calendar({ version: 'v3', auth });
    try {
        await calendar.events.delete({ calendarId: 'primary', eventId });
    }
    catch (e) {
        const friendly = await friendlyGoogleError(e, 'Calendar', CALENDAR_API);
        if (friendly)
            return friendly;
        throw e;
    }
    return `ลบนัด ${eventId} สำเร็จค่ะ 🗑`;
}
