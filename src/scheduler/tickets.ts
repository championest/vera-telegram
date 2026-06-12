import cron from 'node-cron';
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';

const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);

// Map the apps we accept tickets from to a `claude-tasks.project` slug so the
// remote executor can `cd` into the right repo.
const PROJECT_MAP: Record<string, string> = {
    'pkm-court': 'up-level-pkm-court',
    'pkm-deck': 'up-level-pkm-deck',
    'guild': 'up-level-guild-members-web',
    'lorcana-weekly': 'lorcana-weekly',
};

function escapeMd(s: string): string {
    return s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

async function notifyAndDispatch(bot: Bot, doc: FirebaseFirestore.QueryDocumentSnapshot) {
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

    const who = codename ? `\`${escapeMd(codename)}\`` : userEmail ? escapeMd(userEmail) : 'anon';

    const lines = [
        `${emoji} *${escapeMd(type.toUpperCase())} \\[${escapeMd(source)}\\]*`,
        `*${escapeMd(title)}*`,
        '',
    ];
    if (description) lines.push(escapeMd(description), '');
    lines.push(`👤 ${who}`);
    if (url) lines.push(`🔗 ${escapeMd(url)}`);
    lines.push(`🆔 \`${escapeMd(doc.id)}\``);

    try {
        await bot.api.sendMessage(CHAT_ID, lines.join('\n'), {
            parse_mode: 'MarkdownV2',
            reply_markup: {
                inline_keyboard: [[
                    { text: '🤖 ให้ Claude แก้', callback_data: `tk:fix:${doc.id}` },
                    { text: '⏰ Later', callback_data: `tk:later:${doc.id}` },
                    { text: '✅ Done', callback_data: `tk:done:${doc.id}` },
                ]],
            },
        });
    } catch (err) {
        // Telegram MarkdownV2 escaping is fussy; fall back to plain text so we
        // never leave a ticket un-notified.
        console.error('[tickets] markdown send failed, retrying plain', err);
        await bot.api.sendMessage(
            CHAT_ID,
            `${emoji} ${type.toUpperCase()} [${source}]\n${title}\n${description}\n${url}\nid: ${doc.id}`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🤖 Claude fix', callback_data: `tk:fix:${doc.id}` },
                        { text: '⏰ Later', callback_data: `tk:later:${doc.id}` },
                        { text: '✅ Done', callback_data: `tk:done:${doc.id}` },
                    ]],
                },
            }
        );
    }

    await doc.ref.update({
        notified: true,
        notifiedAt: FieldValue.serverTimestamp(),
        projectSlug: project,
    });
}

export function startTicketScheduler(bot: Bot): void {
    cron.schedule('* * * * *', async () => {
        try {
            const snap = await db
                .collection('tickets')
                .where('notified', '==', false)
                .orderBy('createdAtMs', 'asc')
                .limit(10)
                .get();
            if (snap.empty) return;
            for (const doc of snap.docs) {
                try {
                    await notifyAndDispatch(bot, doc);
                } catch (err) {
                    console.error('[tickets] notify failed for', doc.id, err);
                }
            }
        } catch (err) {
            console.error('[tickets] sweeper error:', err);
        }
    });
}

// Telegram callback handlers — wire from bot.ts via `tk:` prefix.
export async function handleTicketCallback(
    bot: Bot,
    action: 'fix' | 'later' | 'done',
    ticketId: string,
    chatId: number,
    messageId: number
): Promise<void> {
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

    // 'fix' → push into claude-tasks for the remote executor
    const project = String(t['projectSlug'] ?? PROJECT_MAP[String(t['source'] ?? '')] ?? '');
    const type = String(t['type'] ?? 'bug');
    const title = String(t['title'] ?? '');
    const description = String(t['description'] ?? '');
    const url = String(t['url'] ?? '');
    const taskLines = [
        `User-submitted ${type} ticket from ${t['source']}`,
        `Title: ${title}`,
    ];
    if (description) taskLines.push(`Details: ${description}`);
    if (url) taskLines.push(`Where: ${url}`);
    taskLines.push(`Ticket id: ${ticketId} (tickets/${ticketId})`);
    taskLines.push(
        'Goal: diagnose, fix in code, commit, deploy if appropriate, then mark this ticket resolved by updating tickets/' +
            ticketId +
            ' { status: "resolved" }.'
    );

    const taskRef = await db.collection('claude-tasks').add({
        task: taskLines.join('\n'),
        project: project || null,
        status: 'pending',
        source: 'ticket-auto',
        ticketId,
        created_at: FieldValue.serverTimestamp(),
    });

    await ref.update({
        status: 'in_progress',
        dispatchedTaskId: taskRef.id,
        dispatchedAt: FieldValue.serverTimestamp(),
    });

    await bot.api.editMessageReplyMarkup(chatId, messageId, { reply_markup: { inline_keyboard: [] } });
    await bot.api.sendMessage(
        chatId,
        `🤖 Dispatched to Claude\nticket: ${ticketId}\ntask: ${taskRef.id}\nproject: ${project || '(unspecified)'}`
    );
}
