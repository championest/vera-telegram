import type { Context } from 'grammy';
import { listReminders } from '../tools/list-reminders.js';
import { db } from '../firebase.js';

export async function handleStart(ctx: Context) {
  await ctx.reply(
    '*Vera ที่นี่ค่ะ* — เลขาฯ ส่วนตัวของคุณ Champ\n\n' +
    'พิมพ์อะไรก็ได้เลยค่ะ หรือใช้คำสั่ง:\n' +
    '/reminders — ดู reminder ที่ตั้งไว้\n' +
    '/ideas — ดูไอเดียที่บันทึกไว้\n' +
    '/tasks — ดู task ทีมวันนี้\n' +
    '/help — วิธีใช้งาน',
    { parse_mode: 'Markdown' }
  );
}

export async function handleReminders(ctx: Context) {
  const userId = String(ctx.from?.id);
  const result = await listReminders({}, userId);
  await ctx.reply(result);
}

export async function handleIdeas(ctx: Context) {
  const snap = await db.collection('vera-ideas').orderBy('createdAt', 'desc').limit(10).get();
  if (snap.empty) {
    await ctx.reply('ยังไม่มีไอเดียที่บันทึกไว้ค่ะ');
    return;
  }
  const lines = snap.docs.map(d => `• *${d.data()['title']}*\n  ${d.data()['body']}`);
  await ctx.reply(lines.join('\n\n'), { parse_mode: 'Markdown' });
}

export async function handleTasks(ctx: Context) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  const snap = await db.collection('team-workflow')
    .where('source', '==', 'vera-bot')
    .where('session', '==', today)
    .orderBy('timestamp', 'desc')
    .limit(20)
    .get();

  if (snap.empty) {
    await ctx.reply('ไม่มี task จาก Vera วันนี้ค่ะ');
    return;
  }
  const lines = snap.docs.map(d => {
    const t = d.data();
    return `• [${t['status']}] *${t['member']}*: ${t['task']}`;
  });
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
}

export async function handleHelp(ctx: Context) {
  await ctx.reply(
    '*Vera — วิธีใช้งาน*\n\n' +
    'แค่พิมพ์ตามธรรมชาติค่ะ เช่น:\n\n' +
    '💡 "บันทึกไอเดีย: อยากทำแอป..."\n' +
    '⏰ "เตือนฉันพรุ่งนี้ 9 โมงเรื่อง meeting"\n' +
    '📋 "ให้ Kai ทำ deploy ก่อน 5 โมง"\n' +
    '🔍 "ฉันพูดเรื่อง Firestore เมื่อไหร่?"\n\n' +
    'คำสั่ง: /reminders /ideas /tasks /help',
    { parse_mode: 'Markdown' }
  );
}
