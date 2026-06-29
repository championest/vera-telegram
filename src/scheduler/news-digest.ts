// News daily digest.
// Approval moved to a web admin page (uplevelguild.com/news-admin), NOT Telegram.
// Articles flow: scraper writes status='pending' → admins accept on the web
// (status='admin_approved') → Champ confirms on the web (status='published').
//
// Telegram's only job now: once a day (20:00 Asia/Bangkok, distinct from the
// 21:00 Poster Dojo digest) tell Champ how many articles await HIS final confirm,
// i.e. count `news_articles` where status=='admin_approved'. Silent if zero.
//
// Modelled on scheduler/poster-dojo-digest.ts. We count by status only (not a
// per-day window): the backlog awaiting confirmation can include items admins
// accepted on earlier days, so a start-of-day filter would wrongly drop them.
import cron from 'node-cron';
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { config } from '../config.js';

const CHAT_ID = config.TELEGRAM_OWNER_CHAT_ID;

export async function sendNewsDigest(bot: Bot): Promise<number> {
  const snap = await db
    .collection('news_articles')
    .where('status', '==', 'admin_approved')
    .get();

  const n = snap.size;
  if (n === 0) return 0; // เงียบไว้ถ้าไม่มีข่าวรอยืนยัน

  await bot.api.sendMessage(
    CHAT_ID,
    `📰 วันนี้มีข่าว ${n} ชิ้นที่แอดมินยอมรับแล้ว รอคุณยืนยันโพส → uplevelguild.com/news-admin`,
  );
  return n;
}

export function startNewsDigestScheduler(bot: Bot): void {
  // 20:00 Asia/Bangkok daily
  cron.schedule(
    '0 20 * * *',
    () => {
      sendNewsDigest(bot).catch((err) =>
        console.error('[news-digest] error:', err),
      );
    },
    { timezone: 'Asia/Bangkok' },
  );
  console.log('News digest scheduler started (20:00 BKK daily)');
}
