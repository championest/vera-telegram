import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { calendarListEvents } from './calendar-list.js';
export async function syncCalendar(input) {
    const days = Number(input['days'] ?? 14);
    const raw = await calendarListEvents({ days, max_results: 50 });
    let parsed = [];
    try {
        const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[1]);
        }
        else {
            return `ซิงค์ไม่สำเร็จ — ไม่พบ event data จาก Google Calendar`;
        }
    }
    catch {
        return `ซิงค์ไม่สำเร็จ — parse error`;
    }
    if (!parsed.length)
        return `ไม่มี event ใน ${days} วันข้างหน้า`;
    const batch = db.batch();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 1);
    // Clear stale future events
    const existing = await db.collection('champ-calendar')
        .where('start', '>=', cutoff.toISOString())
        .get();
    existing.docs.forEach(doc => batch.delete(doc.ref));
    // Write new events
    for (const event of parsed) {
        const ref = db.collection('champ-calendar').doc(event.id ?? db.collection('champ-calendar').doc().id);
        batch.set(ref, {
            title: event.summary ?? event.title ?? 'No title',
            start: event.start?.dateTime ?? event.start?.date ?? event.start ?? '',
            end: event.end?.dateTime ?? event.end?.date ?? event.end ?? null,
            allDay: !event.start?.dateTime,
            location: event.location ?? null,
            description: event.description ?? null,
            googleEventId: event.id ?? null,
            syncedAt: FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    return `ซิงค์แล้ว ${parsed.length} events สำหรับ ${days} วันข้างหน้า`;
}
