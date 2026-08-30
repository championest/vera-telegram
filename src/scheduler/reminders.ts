import cron from 'node-cron';
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { config } from '../config.js';
import { mdEscape, sendMd } from '../utils/telegram.js';

const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);

export function startReminderScheduler(bot: Bot): void {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    try {
      const snap = await db.collection('vera-reminders')
        .where('status', '==', 'pending')
        .where('remindAt', '<=', Timestamp.fromDate(now))
        .get();

      for (const doc of snap.docs) {
        // Dedup: claim the doc atomically before sending
        await doc.ref.update({ status: 'sending' });

        const reminder = doc.data();
        try {
          await sendMd(
            bot,
            CHAT_ID,
            `⏰ *Reminder*\n${mdEscape(reminder['message'])}`,
            {
              reply_markup: {
                inline_keyboard: [[
                  { text: '⏰ Snooze 1h', callback_data: `rm:snooze:${doc.id}` },
                  { text: '✅ Done',       callback_data: `rm:done:${doc.id}` },
                  { text: '🗑 Delete',    callback_data: `rm:delete:${doc.id}` },
                ]],
              },
            }
          );

          if (reminder['repeat'] === 'daily') {
            const next = (reminder['remindAt'] as Timestamp).toDate();
            next.setDate(next.getDate() + 1);
            await doc.ref.update({ status: 'pending', remindAt: Timestamp.fromDate(next), lastSentAt: FieldValue.serverTimestamp() });
          } else if (reminder['repeat'] === 'weekly') {
            const next = (reminder['remindAt'] as Timestamp).toDate();
            next.setDate(next.getDate() + 7);
            await doc.ref.update({ status: 'pending', remindAt: Timestamp.fromDate(next), lastSentAt: FieldValue.serverTimestamp() });
          } else {
            await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() });
          }
        } catch (sendErr) {
          console.error('[Reminder send error]', sendErr);
          // Revert status so it retries next minute
          await doc.ref.update({ status: 'pending' });
        }
      }
    } catch (err) {
      console.error('[Reminder scheduler error]', err);
    }
  });

  console.log('Reminder scheduler started (every 1 minute)');
}

export async function handleReminderCallback(bot: Bot, action: string, docId: string, callbackQueryId: string): Promise<void> {
  const ref = db.collection('vera-reminders').doc(docId);
  try {
    if (action === 'done' || action === 'delete') {
      await ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
      await bot.api.answerCallbackQuery(callbackQueryId, { text: action === 'done' ? '✅ Done!' : '🗑 Deleted' });
    } else if (action === 'snooze') {
      const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000);
      await ref.update({ status: 'pending', remindAt: Timestamp.fromDate(snoozeUntil) });
      await bot.api.answerCallbackQuery(callbackQueryId, { text: '⏰ Snoozed 1 hour' });
    }
  } catch (err) {
    console.error('[Reminder callback error]', err);
    await bot.api.answerCallbackQuery(callbackQueryId, { text: 'เกิดข้อผิดพลาดค่ะ' });
  }
}
