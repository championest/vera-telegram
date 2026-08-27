// Turns finished conversations into long-term memory. Runs every 30 min; the
// rollup itself no-ops while Champ is still mid-conversation, so the cadence
// only decides how soon after a chat ends the memory becomes recallable.
import { config } from '../config.js';
import { rollupSessions } from '../memory/session-summary.js';
import { warmRecallCache } from '../memory/recall.js';

const INTERVAL_MS = 30 * 60_000;
/** Let the bot finish booting before spending Gemini calls on backlog. */
const FIRST_RUN_DELAY_MS = 2 * 60_000;

async function runOnce(): Promise<void> {
  try {
    const res = await rollupSessions(config.TELEGRAM_OWNER_CHAT_ID);
    if (res.status === 'ok') {
      console.log(
        `[memory-rollup] summarized ${res.messages} messages · ${res.factsSaved} new facts · ${String(res.summary).slice(0, 80)}`,
      );
    }
  } catch (err) {
    console.error('[memory-rollup] error:', err);
  }
}

export function startMemoryRollupScheduler(): void {
  warmRecallCache(config.TELEGRAM_OWNER_CHAT_ID);
  setTimeout(runOnce, FIRST_RUN_DELAY_MS);
  setInterval(runOnce, INTERVAL_MS);
  console.log('Memory rollup scheduler started (30m)');
}
