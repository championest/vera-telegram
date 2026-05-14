import type { Context } from 'grammy';
import { listReminders } from '../tools/list-reminders.js';
import { db } from '../firebase.js';
import { isGoogleConfigured, getAuthUrl, isConnected } from '../services/google-auth.js';

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

export async function handleConnect(ctx: Context) {
  if (!isGoogleConfigured()) {
    await ctx.reply('ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID/SECRET ในระบบค่ะ\nกรุณาเพิ่ม env vars ใน Railway ก่อนนะคะ');
    return;
  }
  if (await isConnected()) {
    await ctx.reply('เชื่อม Google แล้วค่ะ ✅\nใช้ Gmail และ Calendar ได้เลย\n\nถ้าอยากเชื่อมใหม่ ให้คลิก link ด้านล่างค่ะ:\n' + getAuthUrl());
    return;
  }
  const url = getAuthUrl();
  await ctx.reply(
    '*เชื่อม Google Account*\n\n' +
    '1. คลิก link ด้านล่าง\n' +
    '2. อนุมัติ Google Account\n' +
    '3. Browser จะเด้งไป localhost (error ปกติ)\n' +
    '4. *copy code จาก URL bar* — ส่วนที่อยู่หลัง `?code=` จนถึง `&scope`\n' +
    '5. ส่ง `/code <code>` กลับมาที่นี่\n\n' +
    url,
    { parse_mode: 'Markdown' }
  );
}

export async function handleCode(ctx: Context) {
  const text = ctx.message?.text ?? '';
  const code = text.replace('/code', '').trim();

  if (!code) {
    await ctx.reply('กรุณาส่ง code ด้วยนะคะ เช่น `/code 4/0AX4...`', { parse_mode: 'Markdown' });
    return;
  }

  try {
    if (ctx.chat) await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    const { exchangeCode } = await import('../services/google-auth.js');
    await exchangeCode(code);
    await ctx.reply('เชื่อม Google สำเร็จแล้วค่ะ ✅\nตอนนี้ใช้ Gmail และ Calendar ได้เลย');
  } catch (err: any) {
    console.error('[handleCode error]', err);
    await ctx.reply('เชื่อมไม่สำเร็จค่ะ — code อาจหมดอายุหรือไม่ถูกต้อง\nลอง /connect ใหม่อีกครั้งนะคะ');
  }
}

export async function handleHelp(ctx: Context) {
  await ctx.reply(
    '*Vera — วิธีใช้งาน*\n\n' +
    'แค่พิมพ์ตามธรรมชาติค่ะ เช่น:\n\n' +
    '💡 "บันทึกไอเดีย: อยากทำแอป..."\n' +
    '⏰ "เตือนฉันพรุ่งนี้ 9 โมงเรื่อง meeting"\n' +
    '📋 "ให้ Kai ทำ deploy ก่อน 5 โมง"\n' +
    '🔍 "ฉันพูดเรื่อง Firestore เมื่อไหร่?"\n\n' +
    'คำสั่ง: /reminders /ideas /tasks /connect /help',
    { parse_mode: 'Markdown' }
  );
}
