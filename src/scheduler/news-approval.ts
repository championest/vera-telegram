// News approval gate.
// A separate scraper writes `news_articles` docs with status='pending'. Nothing
// is public until Champ taps ✅ on Telegram. This sweeper (every 60s, same trick
// as task-results.ts) finds pending articles not yet sent, pushes each to Champ
// with [✅ อนุมัติ] [❌ ตัด] buttons, then marks `notified:true` so it isn't
// re-sent. Scraper docs have no `notified` field — treated as not-notified.
//
// Callback (wired in bot.ts via `news_ok:` / `news_no:` prefix):
//   news_ok:<id> → status='published', publishedAt = serverTimestamp()  (page orders by publishedAt)
//   news_no:<id> → status='rejected'
import type { Bot } from 'grammy';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import { config } from '../config.js';

const CHAT_ID = config.TELEGRAM_OWNER_CHAT_ID;

const GAME_TAG: Record<string, string> = {
  pokemon: '🔴 Pokémon',
  lorcana: '🟣 Lorcana',
  riftbound: '🔵 Riftbound',
  general: '🗞 ทั่วไป',
};

function buildCaption(t: FirebaseFirestore.DocumentData): string {
  const tag = GAME_TAG[String(t['game'] ?? '')] ?? '🗞 ข่าว';
  const title = String(t['title'] ?? '(ไม่มีหัวข้อ)');
  const summary = String(t['summary'] ?? '').slice(0, 600);
  const source = String(t['source'] ?? '');
  const sourceUrl = String(t['sourceUrl'] ?? '');

  const lines = [`${tag}  *${title}*`, ''];
  if (summary) lines.push(summary, '');
  if (source) lines.push(`📰 ${source}`);
  if (sourceUrl) lines.push(sourceUrl);
  // Telegram photo caption hard limit is 1024 chars
  return lines.filter((l) => l !== undefined).join('\n').slice(0, 1024);
}

function approvalKeyboard(id: string) {
  return {
    inline_keyboard: [[
      { text: '✅ อนุมัติ', callback_data: `news_ok:${id}` },
      { text: '❌ ตัด', callback_data: `news_no:${id}` },
    ]],
  };
}

async function notifyArticle(bot: Bot, doc: FirebaseFirestore.QueryDocumentSnapshot): Promise<void> {
  const t = doc.data();
  const caption = buildCaption(t);
  const img = String(t['img'] ?? '').trim();
  const reply_markup = approvalKeyboard(doc.id);

  try {
    if (img) {
      await bot.api.sendPhoto(CHAT_ID, img, {
        caption,
        parse_mode: 'Markdown',
        reply_markup,
      });
    } else {
      await bot.api.sendMessage(CHAT_ID, caption, {
        parse_mode: 'Markdown',
        reply_markup,
      });
    }
  } catch (err) {
    // Markdown can break on raw titles, or the image URL may be unreachable —
    // fall back to a plain text message so the approval still goes out.
    console.error('[news-approval] rich send failed, retrying plain', err);
    await bot.api.sendMessage(CHAT_ID, caption, { reply_markup });
  }

  await doc.ref.update({ notified: true, notifiedAt: FieldValue.serverTimestamp() });
}

export function startNewsApprovalScheduler(bot: Bot): void {
  setInterval(async () => {
    try {
      // Query only by status — scraper docs lack `notified`, so filtering on
      // notified==false in the query would skip them. Filter in code instead.
      const snap = await db
        .collection('news_articles')
        .where('status', '==', 'pending')
        .limit(10)
        .get();
      for (const doc of snap.docs) {
        if (doc.data()['notified'] === true) continue;
        try {
          await notifyArticle(bot, doc);
        } catch (err) {
          console.error('[news-approval] notify failed for', doc.id, err);
        }
      }
    } catch (err) {
      console.error('[news-approval sweeper] error:', err);
    }
  }, 60_000);
  console.log('News approval sweeper started (60s)');
}

// Telegram callback handler — wired from bot.ts via `news_ok:` / `news_no:` prefix.
export async function handleNewsCallback(
  bot: Bot,
  action: 'ok' | 'no',
  articleId: string,
  chatId: number,
  messageId: number,
): Promise<void> {
  const ref = db.collection('news_articles').doc(articleId);
  const snap = await ref.get();
  if (!snap.exists) {
    await bot.api.sendMessage(chatId, `News ${articleId} not found`);
    return;
  }

  if (action === 'ok') {
    await ref.update({ status: 'published', publishedAt: FieldValue.serverTimestamp() });
  } else {
    await ref.update({ status: 'rejected' });
  }

  const statusText = action === 'ok' ? '✅ เผยแพร่แล้ว' : '❌ ตัดทิ้งแล้ว';
  // Replace the keyboard with a single disabled-style status row. Works for both
  // photo and text messages and visibly marks the decision on the card.
  try {
    await bot.api.editMessageReplyMarkup(chatId, messageId, {
      reply_markup: { inline_keyboard: [[{ text: statusText, callback_data: 'news_done' }]] },
    });
  } catch {
    /* message too old to edit — non-fatal */
  }
}
