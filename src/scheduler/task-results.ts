// Pushes finished claude-tasks results to Champ on Telegram.
// Primary path: executor POSTs /task-result for instant push.
// This sweeper is the safety net (Vera restart, network blip) — every 60s.
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { config } from '../config.js';
import { mdEscape, sendMd } from '../utils/telegram.js';

export async function pushTaskResult(bot: Bot, taskId: string): Promise<boolean> {
  const ref = db.collection('claude-tasks').doc(taskId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const t = snap.data()!;
  if (!['done', 'failed'].includes(String(t['status'])) || t['notified'] === true) return false;

  // Poster Dojo practice renders are silent per-task — rolled up into the
  // once-a-day digest (scheduler/poster-dojo-digest.ts) instead of spamming
  // a Telegram message for every render. Mark notified so it isn't re-checked.
  if (t['project'] === 'poster-dojo' || t['source'] === 'practice-loop') {
    await ref.update({ notified: true });
    return false;
  }

  const emoji = t['status'] === 'done' ? '✅' : '❌';
  const proj = t['project'] ? ` [${t['project']}]` : '';
  const meta = [
    t['duration_s'] ? `${t['duration_s']}s` : '',
    t['num_turns'] ? `${t['num_turns']} turns` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // Escape the header fields (project names and task strings are identifier-heavy
  // — one underscore there used to demote the whole message to plain text). The
  // result body is left alone: Claude writes deliberate Markdown in its summary,
  // and sendMd already degrades gracefully if that body won't parse.
  const msg = [
    `${emoji} *งานจาก Claude Code เสร็จแล้ว*${mdEscape(proj)}`,
    `📋 ${mdEscape(String(t['task']).slice(0, 200))}`,
    meta ? `⏱ ${meta}` : '',
    '',
    String(t['result'] ?? '(no result)').slice(0, 3500),
  ]
    .filter((l) => l !== '')
    .join('\n');

  await sendMd(bot, config.TELEGRAM_OWNER_CHAT_ID, msg);
  await ref.update({ notified: true });
  return true;
}

export function startTaskResultSweeper(bot: Bot) {
  setInterval(async () => {
    try {
      const snap = await db.collection('claude-tasks').where('notified', '==', false).limit(10).get();
      for (const d of snap.docs) {
        await pushTaskResult(bot, d.id);
      }
    } catch (err) {
      console.error('[task-results sweeper] error:', err);
    }
  }, 60_000);
  console.log('Task result sweeper started (60s)');
}
