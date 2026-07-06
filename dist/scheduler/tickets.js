import cron from 'node-cron';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);
// Map the apps we accept tickets from to a `claude-tasks.project` slug so the
// remote executor can `cd` into the right repo.
const PROJECT_MAP = {
    'pkm-court': 'up-level-pkm-court',
    'pkm-deck': 'up-level-pkm-deck',
    'guild': 'up-level-guild-members-web',
    'lorcana-weekly': 'lorcana-weekly',
};
function escapeMd(s) {
    return s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}
function buildClaudeTaskPrompt(type, source, title, description, url, ticketId) {
    const lines = [
        `User-submitted ${type} ticket from ${source}`,
        `Title: ${title}`,
    ];
    if (description)
        lines.push(`Details: ${description}`);
    if (url)
        lines.push(`Where: ${url}`);
    lines.push(`Ticket id: ${ticketId} (tickets/${ticketId})`);
    lines.push(`Goal: diagnose, fix in code, commit, deploy if appropriate, then mark this ticket resolved by updating tickets/${ticketId} { status: "resolved" }.`);
    return lines.join('\n');
}
async function notifyAndDispatch(bot, doc) {
    const t = doc.data();
    const type = String(t['type'] ?? 'bug');
    const source = String(t['source'] ?? 'unknown');
    const title = String(t['title'] ?? '(no title)');
    const description = String(t['description'] ?? '').slice(0, 600);
    const url = String(t['url'] ?? '');
    const codename = t['codename'] ? String(t['codename']) : null;
    const userEmail = t['userEmail'] ? String(t['userEmail']) : null;
    const emoji = type === 'bug' ? '🐛' : '💡';
    const project = PROJECT_MAP[source] ?? source;
    // Auto-dispatch: enqueue a claude-tasks doc the moment a ticket lands so
    // the Mac executor starts work without Champ having to tap a button.
    // Cancel button still lets him abort if it's a misfire.
    const taskRef = await db.collection('claude-tasks').add({
        task: buildClaudeTaskPrompt(type, source, title, description, url, doc.id),
        project: project || null,
        status: 'pending',
        source: 'ticket-auto',
        ticketId: doc.id,
        created_at: FieldValue.serverTimestamp(),
    });
    const who = codename ? `\`${escapeMd(codename)}\`` : userEmail ? escapeMd(userEmail) : 'anon';
    const lines = [
        `${emoji} *${escapeMd(type.toUpperCase())} \\[${escapeMd(source)}\\]* — 🤖 auto\\-dispatched`,
        `*${escapeMd(title)}*`,
        '',
    ];
    if (description)
        lines.push(escapeMd(description), '');
    lines.push(`👤 ${who}`);
    if (url)
        lines.push(`🔗 ${escapeMd(url)}`);
    lines.push(`🆔 ticket \`${escapeMd(doc.id)}\``);
    lines.push(`⚙️ task \`${escapeMd(taskRef.id)}\``);
    try {
        await bot.api.sendMessage(CHAT_ID, lines.join('\n'), {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [[
                        { text: '✋ Cancel', callback_data: `tk:cancel:${doc.id}` },
                        { text: '✅ Done', callback_data: `tk:done:${doc.id}` },
                    ]],
            },
        });
    }
    catch (err) {
        console.error('[tickets] markdown send failed, retrying plain', err);
        await bot.api.sendMessage(CHAT_ID, `${emoji} ${type.toUpperCase()} [${source}] — auto-dispatched\n${title}\n${description}\n${url}\nticket: ${doc.id}\ntask: ${taskRef.id}`, {
            reply_markup: {
                inline_keyboard: [[
                        { text: '✋ Cancel', callback_data: `tk:cancel:${doc.id}` },
                        { text: '✅ Done', callback_data: `tk:done:${doc.id}` },
                    ]],
            },
        });
    }
    await doc.ref.update({
        notified: true,
        notifiedAt: FieldValue.serverTimestamp(),
        projectSlug: project,
        status: 'in_progress',
        dispatchedTaskId: taskRef.id,
        dispatchedAt: FieldValue.serverTimestamp(),
    });
}
export function startTicketScheduler(bot) {
    cron.schedule('* * * * *', async () => {
        try {
            const snap = await db
                .collection('tickets')
                .where('notified', '==', false)
                .orderBy('createdAtMs', 'asc')
                .limit(10)
                .get();
            if (snap.empty)
                return;
            for (const doc of snap.docs) {
                try {
                    await notifyAndDispatch(bot, doc);
                }
                catch (err) {
                    console.error('[tickets] notify failed for', doc.id, err);
                }
            }
        }
        catch (err) {
            console.error('[tickets] sweeper error:', err);
        }
    });
}
// Telegram callback handlers — wire from bot.ts via `tk:` prefix.
export async function handleTicketCallback(bot, action, ticketId, chatId, messageId) {
    const ref = db.collection('tickets').doc(ticketId);
    const snap = await ref.get();
    if (!snap.exists) {
        await bot.api.sendMessage(chatId, `Ticket ${ticketId} not found`);
        return;
    }
    const t = snap.data() ?? {};
    if (action === 'done') {
        await ref.update({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp() });
        await bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: { inline_keyboard: [] } });
        await bot.api.sendMessage(chatId, `✅ Ticket ${ticketId} → resolved`);
        return;
    }
    if (action === 'later') {
        await ref.update({ status: 'open', deferred: true });
        await bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: { inline_keyboard: [] } });
        await bot.api.sendMessage(chatId, `⏰ Ticket ${ticketId} deferred`);
        return;
    }
    if (action === 'cancel') {
        const dispatchedId = String(t['dispatchedTaskId'] ?? '');
        if (dispatchedId) {
            const taskRef = db.collection('claude-tasks').doc(dispatchedId);
            const taskSnap = await taskRef.get();
            const status = String(taskSnap.data()?.['status'] ?? '');
            if (status === 'pending') {
                // Not picked up yet — safe to cancel outright.
                await taskRef.update({
                    status: 'cancelled',
                    cancelledAt: FieldValue.serverTimestamp(),
                });
            }
            else {
                // Executor already running it. Flag the doc so a future
                // operator can spot it; the in-flight Claude run isn't
                // killable from here.
                await taskRef.update({
                    cancelRequested: true,
                    cancelRequestedAt: FieldValue.serverTimestamp(),
                });
            }
        }
        await ref.update({ status: 'open', cancelledAt: FieldValue.serverTimestamp() });
        await bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: { inline_keyboard: [] } });
        await bot.api.sendMessage(chatId, `✋ Ticket ${ticketId} cancelled — task ${dispatchedId || '(none)'}`);
        return;
    }
    // Legacy 'fix' — kept so older Telegram messages still work after the
    // auto-dispatch switchover. Re-dispatches if no claude-tasks bound yet.
    if (t['dispatchedTaskId']) {
        await bot.api.sendMessage(chatId, `Ticket ${ticketId} already dispatched (task ${t['dispatchedTaskId']})`);
        return;
    }
    const project = String(t['projectSlug'] ?? PROJECT_MAP[String(t['source'] ?? '')] ?? '');
    const type = String(t['type'] ?? 'bug');
    const title = String(t['title'] ?? '');
    const description = String(t['description'] ?? '');
    const url = String(t['url'] ?? '');
    const taskRef = await db.collection('claude-tasks').add({
        task: buildClaudeTaskPrompt(type, String(t['source'] ?? ''), title, description, url, ticketId),
        project: project || null,
        status: 'pending',
        source: 'ticket-manual',
        ticketId,
        created_at: FieldValue.serverTimestamp(),
    });
    await ref.update({
        status: 'in_progress',
        dispatchedTaskId: taskRef.id,
        dispatchedAt: FieldValue.serverTimestamp(),
    });
    await bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: { inline_keyboard: [] } });
    await bot.api.sendMessage(chatId, `🤖 Dispatched to Claude\nticket: ${ticketId}\ntask: ${taskRef.id}\nproject: ${project || '(unspecified)'}`);
}
