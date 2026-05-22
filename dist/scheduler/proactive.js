import cron from 'node-cron';
import { google } from 'googleapis';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
import { getAuthedClient, isConnected } from '../services/google-auth.js';
const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);
const OWNER_ID = config.TELEGRAM_OWNER_CHAT_ID;
const STATE_DOC = 'champ';
const STATE_COLLECTION = 'vera-proactive-state';
const PREFS_COLLECTION = 'vera-prefs';
const MAX_SEEN = 200; // cap arrays to avoid runaway
async function isProactiveEnabled() {
    try {
        const snap = await db.collection(PREFS_COLLECTION).doc(OWNER_ID).get();
        // Default ON — Champ explicitly asked for proactive Jarvis behaviour
        return snap.data()?.['proactive'] !== 'off';
    }
    catch {
        return true;
    }
}
async function getState() {
    try {
        const snap = await db.collection(STATE_COLLECTION).doc(STATE_DOC).get();
        return (snap.data() ?? {});
    }
    catch {
        return {};
    }
}
async function saveState(patch) {
    await db.collection(STATE_COLLECTION).doc(STATE_DOC).set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
function getHeader(headers, name) {
    return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}
async function send(bot, text) {
    try {
        await bot.api.sendMessage(CHAT_ID, text, { parse_mode: 'Markdown' });
    }
    catch (err) {
        // Retry plain in case Markdown parsing failed
        try {
            await bot.api.sendMessage(CHAT_ID, text);
        }
        catch { /* drop */ }
    }
}
// ───────────────── Email scan ─────────────────
async function scanImportantEmail(bot) {
    if (!await isConnected())
        return;
    const auth = await getAuthedClient();
    if (!auth)
        return;
    const gmail = google.gmail({ version: 'v1', auth });
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:important is:unread newer_than:1d',
        maxResults: 5,
    });
    const messages = res.data.messages ?? [];
    if (messages.length === 0)
        return;
    const state = await getState();
    const seen = new Set(state.seenEmailIds ?? []);
    const fresh = [];
    for (const m of messages) {
        if (!m.id || seen.has(m.id))
            continue;
        const full = await gmail.users.messages.get({
            userId: 'me', id: m.id, format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
        });
        fresh.push({
            id: m.id,
            from: getHeader(full.data.payload?.headers, 'From'),
            subject: getHeader(full.data.payload?.headers, 'Subject') || '(no subject)',
            snippet: String(full.data.snippet ?? '').slice(0, 160),
        });
    }
    if (fresh.length === 0)
        return;
    for (const e of fresh) {
        const fromShort = e.from.replace(/<.*>/, '').trim() || e.from;
        const text = [
            `📧 *Important email*`,
            `*From:* ${fromShort}`,
            `*Subject:* ${e.subject}`,
            e.snippet ? `\n${e.snippet}...` : '',
        ].filter(Boolean).join('\n');
        await send(bot, text);
    }
    // Update seen list (keep most recent MAX_SEEN)
    const next = [...fresh.map(f => f.id), ...(state.seenEmailIds ?? [])].slice(0, MAX_SEEN);
    await saveState({ seenEmailIds: next });
}
// ───────────────── Calendar pre-alert ─────────────────
async function scanUpcomingEvents(bot) {
    if (!await isConnected())
        return;
    const auth = await getAuthedClient();
    if (!auth)
        return;
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const min = new Date(now.getTime() + 5 * 60_000); // 5 min from now
    const max = new Date(now.getTime() + 15 * 60_000); // 15 min from now
    const res = await calendar.events.list({
        calendarId: 'primary',
        timeMin: min.toISOString(),
        timeMax: max.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });
    const events = res.data.items ?? [];
    if (events.length === 0)
        return;
    const state = await getState();
    const alerted = new Set(state.alertedEventIds ?? []);
    const fresh = events.filter(e => e.id && !alerted.has(e.id));
    if (fresh.length === 0)
        return;
    for (const ev of fresh) {
        const start = ev.start?.dateTime
            ? new Date(ev.start.dateTime).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })
            : 'ทั้งวัน';
        const text = [
            `⏰ *นัดใกล้แล้ว — อีก ~10 นาที*`,
            `${start} · ${ev.summary ?? '(ไม่มีชื่อ)'}`,
            ev.location ? `📍 ${ev.location}` : '',
            ev.description ? `\n${String(ev.description).slice(0, 200)}` : '',
        ].filter(Boolean).join('\n');
        await send(bot, text);
    }
    const next = [...fresh.map(e => e.id), ...(state.alertedEventIds ?? [])].slice(0, MAX_SEEN);
    await saveState({ alertedEventIds: next });
}
// ───────────────── Overdue tasks (daily) ─────────────────
async function scanOverdueTasks(bot) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    const state = await getState();
    if (state.lastOverdueScanDay === today)
        return; // already scanned today
    // champ-tasks where due_date < today, status not DONE
    const snap = await db.collection('champ-tasks').limit(200).get();
    const overdue = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => {
        if (!t.due_date || typeof t.due_date !== 'string')
            return false;
        const due = t.due_date.slice(0, 10);
        const status = String(t.status ?? '').toUpperCase();
        return due < today && status !== 'DONE' && status !== 'CANCELLED';
    });
    if (overdue.length > 0) {
        const lines = ['📋 *งานที่เลยกำหนด*\n'];
        overdue.slice(0, 8).forEach(t => {
            const title = String(t.title ?? '(no title)');
            lines.push(`• ${title} — due ${t.due_date}`);
        });
        if (overdue.length > 8)
            lines.push(`\n_+ อีก ${overdue.length - 8} รายการ_`);
        await send(bot, lines.join('\n'));
    }
    await saveState({ lastOverdueScanDay: today });
}
// ───────────────── Boot ─────────────────
export function startProactiveScheduler(bot) {
    // Calendar pre-alert — every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        if (!await isProactiveEnabled())
            return;
        try {
            await scanUpcomingEvents(bot);
        }
        catch (err) {
            console.error('[proactive/calendar]', err);
        }
    });
    // Important email — every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
        if (!await isProactiveEnabled())
            return;
        try {
            await scanImportantEmail(bot);
        }
        catch (err) {
            console.error('[proactive/email]', err);
        }
    });
    // Overdue tasks — 08:30 BKK (= 01:30 UTC)
    cron.schedule('30 1 * * *', async () => {
        if (!await isProactiveEnabled())
            return;
        try {
            await scanOverdueTasks(bot);
        }
        catch (err) {
            console.error('[proactive/overdue]', err);
        }
    });
    console.log('Proactive scheduler started (calendar/5min, email/10min, overdue/daily 08:30 BKK)');
}
