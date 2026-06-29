import 'dotenv/config';
import { createBot } from './bot.js';
import { startReminderScheduler } from './scheduler/reminders.js';
import { startMorningBriefScheduler } from './scheduler/morning-brief.js';
import { startStuckTaskChecker } from './scheduler/stuck-tasks.js';
import { startNotificationScheduler } from './scheduler/notifications.js';
import { startProactiveScheduler } from './scheduler/proactive.js';
import { startTaskResultSweeper } from './scheduler/task-results.js';
import { startTicketScheduler } from './scheduler/tickets.js';
import { startTicketCleanupScheduler } from './scheduler/tickets-cleanup.js';
import { startPosterDojoDigestScheduler } from './scheduler/poster-dojo-digest.js';
import { startNewsApprovalScheduler } from './scheduler/news-approval.js';
import { createHttpServer } from './server/http.js';
import { startHQBridge } from './handlers/hq-bridge.js';
async function main() {
    console.log('Starting Vera...');
    const bot = createBot();
    createHttpServer(bot);
    startHQBridge(bot);
    startReminderScheduler(bot);
    startMorningBriefScheduler(bot);
    startStuckTaskChecker(bot);
    startNotificationScheduler(bot);
    startProactiveScheduler(bot);
    startTaskResultSweeper(bot);
    startTicketScheduler(bot);
    startTicketCleanupScheduler();
    startPosterDojoDigestScheduler(bot);
    startNewsApprovalScheduler(bot);
    await bot.start({
        onStart: (info) => console.log(`Vera online as @${info.username}`),
    });
}
main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
