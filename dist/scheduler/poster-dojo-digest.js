// Poster Dojo daily digest.
// Per-render Telegram notifications are suppressed in scheduler/task-results.ts.
// Instead, once a day (21:00 Asia/Bangkok) Champ gets a single summary with the
// number of posters the Dojo rendered that day.
//
// Source of truth: Firestore `poster-dojo` collection. Each render is one doc
// (firestore-sync.mjs `pushOne` → db.collection('poster-dojo').doc(name).set(...,
//  { created_at: serverTimestamp() })). We count docs whose `created_at` is on or
// after the start of *today* in Asia/Bangkok (UTC+7, no DST).
import cron from 'node-cron';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { config } from '../config.js';
const CHAT_ID = config.TELEGRAM_OWNER_CHAT_ID;
// Start of today in Asia/Bangkok as a Date (Bangkok is a fixed UTC+7 offset).
function startOfTodayBangkok() {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
    return new Date(`${today}T00:00:00+07:00`);
}
export async function sendPosterDojoDigest(bot) {
    const start = startOfTodayBangkok();
    const snap = await db
        .collection('poster-dojo')
        .where('created_at', '>=', Timestamp.fromDate(start))
        .get();
    const n = snap.size;
    if (n === 0)
        return 0; // เงียบไว้ถ้าวันนี้ไม่มีงาน
    await bot.api.sendMessage(CHAT_ID, `🥋 วันนี้ Dojo ทำโพสไป ${n} งาน`);
    return n;
}
export function startPosterDojoDigestScheduler(bot) {
    // 21:00 Asia/Bangkok daily
    cron.schedule('0 21 * * *', () => {
        sendPosterDojoDigest(bot).catch((err) => console.error('[poster-dojo-digest] error:', err));
    }, { timezone: 'Asia/Bangkok' });
    console.log('Poster Dojo digest scheduler started (21:00 BKK daily)');
}
