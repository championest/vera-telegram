import cron from 'node-cron';
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
import { sendMd } from '../utils/telegram.js';

const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);

export function startNotificationScheduler(bot: Bot): void {
  cron.schedule('* * * * *', async () => {
    try {
      const snap = await db.collection('vera-notifications')
        .where('status', '==', 'pending')
        .get();

      for (const doc of snap.docs) {
        await doc.ref.update({ status: 'sending' });
        const data = doc.data();
        try {
          // The message body is written by other systems (executor, hooks, HQ).
          // A single `[` used to fail the parse, flip the doc back to `pending`,
          // and leave the notification stuck in that loop forever — sendMd
          // degrades to plain text instead of losing it.
          await sendMd(bot, CHAT_ID, data['message']);
          await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() });
        } catch (err) {
          console.error('[Notification send error]', err);
          await doc.ref.update({ status: 'pending' });
        }
      }
    } catch (err) {
      console.error('[Notification scheduler error]', err);
    }
  });

  console.log('Notification scheduler started (every 1 minute)');
}
