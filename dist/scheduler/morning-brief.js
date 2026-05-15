import cron from 'node-cron';
import { db } from '../firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
import { config } from '../config.js';
import { isConnected, getAuthedClient } from '../services/google-auth.js';
import { google } from 'googleapis';
const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);
async function buildMorningBrief() {
    const lines = ['☀️ *Good morning คุณ Champ!*\n'];
    // Unread notes from claude-notes
    try {
        const notesSnap = await db.collection('claude-notes')
            .where('read', '==', false)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
        if (!notesSnap.empty) {
            lines.push('*📬 Notes ที่ยังไม่ได้อ่าน*');
            notesSnap.docs.forEach(d => {
                const n = d.data();
                lines.push(`• [${n['topic'] ?? 'note'}] ${n['note']}`);
            });
            lines.push('');
        }
    }
    catch { /* index may not exist yet */ }
    // Pending reminders today
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const reminderSnap = await db.collection('vera-reminders')
        .where('status', '==', 'pending')
        .where('remindAt', '<=', Timestamp.fromDate(endOfDay))
        .get();
    if (!reminderSnap.empty) {
        lines.push('*⏰ Reminders วันนี้*');
        reminderSnap.docs.forEach(d => {
            const r = d.data();
            const t = r['remindAt'].toDate().toLocaleTimeString('th-TH', {
                timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit',
            });
            lines.push(`• ${t} — ${r['message']}`);
        });
        lines.push('');
    }
    // Today's calendar events
    if (await isConnected()) {
        try {
            const auth = await getAuthedClient();
            if (auth) {
                const calendar = google.calendar({ version: 'v3', auth });
                const endOfDayISO = new Date();
                endOfDayISO.setHours(23, 59, 59, 999);
                const res = await calendar.events.list({
                    calendarId: 'primary',
                    timeMin: now.toISOString(),
                    timeMax: endOfDayISO.toISOString(),
                    maxResults: 5,
                    singleEvents: true,
                    orderBy: 'startTime',
                });
                const events = res.data.items ?? [];
                if (events.length > 0) {
                    lines.push('*📅 นัดวันนี้*');
                    events.forEach(ev => {
                        const start = ev.start?.dateTime
                            ? new Date(ev.start.dateTime).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
                            : 'ทั้งวัน';
                        lines.push(`• ${start} — ${ev.summary ?? '(ไม่มีชื่อ)'}`);
                    });
                    lines.push('');
                }
                else {
                    lines.push('*📅 วันนี้ไม่มีนัด 🟢*\n');
                }
            }
        }
        catch { /* calendar unavailable */ }
    }
    // Latest session log
    const sessionSnap = await db.collection('team-workflow')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();
    const NOISE = ['pre-push gate', 'Claude response complete', 'Session started', 'Auto-logged'];
    const meaningful = sessionSnap.docs
        .map(d => d.data())
        .filter(e => !NOISE.some(p => String(e['task'] ?? '').includes(p)))
        .slice(0, 5);
    if (meaningful.length > 0) {
        lines.push('*🖥 Session ล่าสุดจากคอม*');
        meaningful.forEach(e => {
            const emoji = e['status'] === 'DONE' ? '✅' : e['status'] === 'BLOCKED' ? '🚫' : '⏳';
            lines.push(`${emoji} ${e['member']}: ${e['task']}`);
        });
        lines.push('');
    }
    lines.push('_วันนี้ Champ อยากทำอะไรบ้างคะ?_ 👇');
    return { text: lines.join('\n') };
}
export function startMorningBriefScheduler(bot) {
    // 7:00 AM Bangkok = 00:00 UTC
    cron.schedule('0 0 * * *', async () => {
        try {
            const { text } = await buildMorningBrief();
            await bot.api.sendMessage(CHAT_ID, text, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                            { text: '📋 ช่วยวางแผนวันนี้', callback_data: 'brief:plan_day' },
                            { text: '💬 จะพิมพ์เอง', callback_data: 'brief:free_day' },
                        ]],
                },
            });
        }
        catch (err) {
            console.error('[Morning brief error]', err);
        }
    });
    console.log('Morning brief scheduler started (07:00 BKK daily)');
}
// Exported so bot.ts can trigger manually (e.g. /brief command)
export async function sendMorningBrief(bot) {
    const { text } = await buildMorningBrief();
    await bot.api.sendMessage(CHAT_ID, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                    { text: '📋 ช่วยวางแผนวันนี้', callback_data: 'brief:plan_day' },
                    { text: '💬 จะพิมพ์เอง', callback_data: 'brief:free_day' },
                ]],
        },
    });
}
