import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { fetchCalendarEvents } from './calendar-list.js';
export async function syncCalendar(input) {
    const days = Number(input['days'] ?? 14);
    // Fetch structured events directly. (Previously this parsed a ```json``` block
    // out of calendarListEvents' human-formatted text — which it never emits — so
    // sync ALWAYS failed with "ไม่พบ event data".)
    const result = await fetchCalendarEvents(days, 50);
    if (!result.ok)
        return `ซิงค์ไม่สำเร็จ — ${result.message}`;
    const parsed = result.events;
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
