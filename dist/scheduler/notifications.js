import cron from 'node-cron';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);
export function startNotificationScheduler(bot) {
    cron.schedule('* * * * *', async () => {
        try {
            const snap = await db.collection('vera-notifications')
                .where('status', '==', 'pending')
                .get();
            for (const doc of snap.docs) {
                await doc.ref.update({ status: 'sending' });
                const data = doc.data();
                try {
                    await bot.api.sendMessage(CHAT_ID, data['message'], { parse_mode: 'Markdown' });
                    await doc.ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp() });
                }
                catch (err) {
                    console.error('[Notification send error]', err);
                    await doc.ref.update({ status: 'pending' });
                }
            }
        }
        catch (err) {
            console.error('[Notification scheduler error]', err);
        }
    });
    console.log('Notification scheduler started (every 1 minute)');
}
