import cron from 'node-cron';
import { db } from '../firebase.js';
import { Timestamp } from 'firebase-admin/firestore';
import { config } from '../config.js';
const CHAT_ID = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);
export function startStuckTaskChecker(bot) {
    // Check every 2 hours
    cron.schedule('0 */2 * * *', async () => {
        try {
            const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
            const snap = await db.collection('team-workflow')
                .where('status', '==', 'IN_PROGRESS')
                .where('timestamp', '<=', Timestamp.fromDate(threeHoursAgo))
                .get();
            if (snap.empty)
                return;
            const lines = ['⚠️ *งานที่ค้างนานกว่า 3 ชั่วโมง*\n'];
            snap.docs.slice(0, 5).forEach(d => {
                const t = d.data();
                const member = String(t['member'] ?? '');
                const task = String(t['task'] ?? '');
                lines.push(`• *${member}*: ${task}`);
                lines.push(`  ID: \`${d.id}\``);
            });
            lines.push('\nอัพเดตสถานะได้เลยนะคะ หรือบอก Vera ว่าทำเสร็จแล้ว');
            await bot.api.sendMessage(CHAT_ID, lines.join('\n'), { parse_mode: 'Markdown' });
        }
        catch (err) {
            console.error('[Stuck task checker error]', err);
        }
    });
    console.log('Stuck task checker started (every 2 hours)');
}
