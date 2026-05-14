import { createBot } from './bot.js';
import { startReminderScheduler } from './scheduler/reminders.js';

async function main() {
  console.log('Starting Vera...');

  const bot = createBot();
  startReminderScheduler(bot);

  await bot.start({
    onStart: (info) => console.log(`Vera online as @${info.username}`),
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
