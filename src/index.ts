import 'dotenv/config';
import { createBot } from './bot.js';
import { startReminderScheduler } from './scheduler/reminders.js';
import { startMorningBriefScheduler } from './scheduler/morning-brief.js';
import { startStuckTaskChecker } from './scheduler/stuck-tasks.js';
import { createHttpServer } from './server/http.js';

async function main() {
  console.log('Starting Vera...');

  createHttpServer();

  const bot = createBot();
  startReminderScheduler(bot);
  startMorningBriefScheduler(bot);
  startStuckTaskChecker(bot);

  await bot.start({
    onStart: (info) => console.log(`Vera online as @${info.username}`),
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
