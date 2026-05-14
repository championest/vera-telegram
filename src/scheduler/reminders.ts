import cron from 'node-cron';
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { config } from '../config.js';

export function startReminderScheduler(bot: Bot): void {
  cron.schedule('* * * * *', async () => {
    const now = new Date();

    try {
      const snap = await db.collection('vera-reminders')
        .where('status', '==', 'pending')
        .where('remindAt', '<=', Timestamp.fromDate(now))
        .get();

      for (const doc of snap.docs) {
        const reminder = doc.data();
        const chatId = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);

        await bot.api.sendMessage(
          chatId,
          `⏰ *Reminder*\n${reminder['message']}`,
          { parse_mode: 'Markdown' }
        );

        if (reminder['repeat'] === 'daily') {
          const next = (reminder['remindAt'] as Timestamp).toDate();
          next.setDate(next.getDate() + 1);
          await doc.ref.update({ remindAt: Timestamp.fromDate(next), lastSentAt: FieldValue.serverTimestamp() });
        } else if (reminder['repeat'] === 'weekly') {
          const next = (reminder['remindAt'] as Timestamp).toDate();
          next.setDate(next.getDate() + 7);
          await doc.ref.update({ remindAt: Timestamp.fromDate(next), lastSentAt: FieldValue.serverTimestamp() });
        } else {
          await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() });
        }
      }
    } catch (err) {
      console.error('[Reminder scheduler error]', err);
    }
  });

  console.log('Reminder scheduler started (every 1 minute)');
}
