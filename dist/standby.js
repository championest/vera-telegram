import { isPrimaryStale } from './scheduler/heartbeat.js';
const CHECK_MS = 20_000;
/**
 * STANDBY supervisor (runs on the cloud instance, VERA_STANDBY=true).
 * Polls Telegram ONLY while the primary (mini) is down, and stands down the
 * moment the mini's heartbeat is fresh again — so there is never more than one
 * active poller (Telegram allows only one getUpdates per bot; two = 409 fights).
 *
 * Interactive replies only — the proactive schedulers (reminders/briefs/etc.)
 * stay on the primary, so the standby never double-sends them.
 */
export function startStandbySupervisor(bot) {
    let polling = false;
    const tick = async () => {
        const down = await isPrimaryStale();
        if (down && !polling) {
            polling = true;
            console.log('[standby] primary DOWN → taking over Telegram polling (Claude)');
            bot
                .start({ onStart: () => console.log('[standby] now polling as backup') })
                .catch((e) => {
                console.error('[standby] bot.start failed', e?.message ?? e);
                polling = false;
            });
        }
        else if (!down && polling) {
            console.log('[standby] primary BACK → standing down');
            polling = false;
            await bot.stop().catch(() => { });
        }
    };
    void tick();
    setInterval(tick, CHECK_MS);
    console.log(`Standby supervisor started (checks every ${CHECK_MS / 1000}s)`);
}
