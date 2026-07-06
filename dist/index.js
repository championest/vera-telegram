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
import { startNewsDigestScheduler } from './scheduler/news-digest.js';
import { createHttpServer } from './server/http.js';
import { startHQBridge } from './handlers/hq-bridge.js';
import { startHeartbeat } from './scheduler/heartbeat.js';
import { startStandbySupervisor } from './standby.js';
// Default = STANDBY (safe): a cloud host stays idle unless explicitly made primary.
// The mini is pinned primary via its launchd env (VERA_ROLE=primary), so only ONE
// instance is ever primary even if a cloud box redeploys with no env changes.
const STANDBY = process.env.VERA_ROLE !== 'primary';
async function main() {
    const bot = createBot();
    createHttpServer(bot);
    if (STANDBY) {
        // CLOUD STANDBY: idle until the mini (primary) goes down, then take over
        // Telegram polling only. No schedulers/HQ bridge → never double-sends.
        console.log('Starting Vera (STANDBY mode — waiting for primary to go down)...');
        startStandbySupervisor(bot);
        return;
    }
    // PRIMARY (mini): full service + heartbeat so the standby knows we're alive.
    console.log('Starting Vera (PRIMARY)...');
    startHeartbeat('mini');
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
    startNewsDigestScheduler(bot);
    await bot.start({
        onStart: (info) => console.log(`Vera online as @${info.username} (PRIMARY)`),
    });
}
main().catch((err) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
