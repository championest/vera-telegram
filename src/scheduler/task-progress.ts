// Live progress for remote Claude Code tasks.
//
// A dispatched task used to be a black box: "ส่งงานแล้ว" and then silence for
// however many minutes the work took. From a phone that is indistinguishable
// from a hung executor, and Champ would re-send the task.
//
// The executor now writes `progress_text` as it works (throttled to ~20s), and
// this listener mirrors it into ONE Telegram message that keeps getting edited
// in place — live status without a wall of notifications.
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { config } from '../config.js';

/** Silent task sources — rolled up into their own digest, never per-task chatter. */
const SILENT_PROJECTS = new Set(['poster-dojo']);
const SILENT_SOURCES = new Set(['practice-loop']);

interface Tracked {
  messageId: number;
  lastText: string;
}

const tracked = new Map<string, Tracked>();

function isSilent(t: FirebaseFirestore.DocumentData): boolean {
  return SILENT_PROJECTS.has(String(t['project'] ?? '')) || SILENT_SOURCES.has(String(t['source'] ?? ''));
}

// Plain text, no parse_mode. Task text and tool output are arbitrary strings —
// a stray `*` or `_` makes Telegram reject the message, and on an EDIT that
// rejection is silent, freezing the progress card on its first line forever.
function render(t: FirebaseFirestore.DocumentData): string {
  const proj = t['project'] ? ` [${t['project']}]` : '';
  const started = t['started_at']?.toDate?.();
  const mins = started ? Math.round((Date.now() - started.getTime()) / 60000) : 0;
  const elapsed = mins >= 1 ? ` · ${mins} นาที` : '';
  return [
    `⚙️ กำลังทำอยู่${proj}${elapsed}`,
    `📋 ${String(t['task'] ?? '').slice(0, 160)}`,
    '',
    `↳ ${String(t['progress_text'] ?? 'เริ่มงาน...').slice(0, 160)}`,
  ].join('\n');
}

async function sync(bot: Bot, taskId: string, t: FirebaseFirestore.DocumentData): Promise<void> {
  const text = render(t);
  const existing = tracked.get(taskId);

  if (!existing) {
    const sent = await bot.api.sendMessage(config.TELEGRAM_OWNER_CHAT_ID, text);
    tracked.set(taskId, { messageId: sent.message_id, lastText: text });
    return;
  }

  // Telegram rejects an edit that changes nothing — skip rather than eat the 400.
  if (existing.lastText === text) return;

  await bot.api
    .editMessageText(config.TELEGRAM_OWNER_CHAT_ID, existing.messageId, text)
    .then(() => {
      existing.lastText = text;
    })
    .catch(() => {
      /* message deleted by Champ, or edit raced the final result — harmless */
    });
}

export function startTaskProgressListener(bot: Bot): void {
  const attach = () => {
    db.collection('claude-tasks')
      .where('status', '==', 'running')
      .limit(10)
      .onSnapshot(
        async (snap) => {
          for (const change of snap.docChanges()) {
            const t = change.doc.data();
            if (change.type === 'removed' || isSilent(t)) continue;
            if (!t['progress_text']) continue;
            try {
              await sync(bot, change.doc.id, t);
            } catch (err) {
              console.error('[task-progress] sync failed:', err);
            }
          }
          // Anything that left `running` is finished — task-results.ts sends the
          // real summary, so stop tracking and let that message stand.
          for (const id of [...tracked.keys()]) {
            if (!snap.docs.some((d) => d.id === id)) tracked.delete(id);
          }
        },
        (err) => {
          console.warn('[task-progress] listener dropped, re-attaching in 30s:', err.message);
          setTimeout(attach, 30_000);
        },
      );
  };
  attach();
  console.log('Task progress listener started (realtime)');
}
