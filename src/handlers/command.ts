import type { Context } from 'grammy';
import { listReminders } from '../tools/list-reminders.js';
import { db } from '../firebase.js';
import { isGoogleConfigured, getAuthUrl, isConnected } from '../services/google-auth.js';
import { config } from '../config.js';
import { getUserProvider, setUserProvider, type ModelProvider } from '../llm-router.js';

export const QUICK_KEYBOARD = {
  keyboard: [
    [{ text: '📅 ตาราง' }, { text: '📧 เมล' }, { text: '⏰ Reminder' }],
    [{ text: '🔍 ค้นหา...' }, { text: '📝 บันทึกไอเดีย...' }, { text: '💼 งานทีม' }],
  ],
  resize_keyboard: true,
  persistent: true,
};

export async function handleStart(ctx: Context) {
  await ctx.reply(
    '*Vera ที่นี่ค่ะ* — เลขาฯ ส่วนตัวของคุณ Champ\n\nพิมพ์อะไรก็ได้เลยค่ะ หรือกดปุ่มด้านล่าง',
    { parse_mode: 'Markdown', reply_markup: QUICK_KEYBOARD }
  );
}

export async function handleMenu(ctx: Context) {
  await ctx.reply('เมนูหลักค่ะ 👇', { reply_markup: QUICK_KEYBOARD });
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
  const connected = await isConnected();
  const url = getAuthUrl();
  await ctx.reply(
    (connected ? '🔄 *Re-authorize Google* (อัป scope)\n\n' : '*เชื่อม Google Account*\n\n') +
    '1. กดปุ่มด้านล่าง → อนุมัติ Google Account\n' +
    '2. Browser เด้งไป localhost (error ปกติ)\n' +
    '3. Copy URL ทั้งหมดจาก address bar\n' +
    '4. ส่งกลับมาที่นี่ว่า `/code <URL นั้น>`',
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '🔗 เชื่อม Google Account', url }]],
      },
    }
  );
}

export async function handleCode(ctx: Context) {
  const text = ctx.message?.text ?? '';
  const raw = text.replace('/code', '').trim();

  if (!raw) {
    await ctx.reply('กรุณาส่ง code หรือ URL ด้วยนะคะ เช่น `/code http://localhost/?code=4/0AX4...`', { parse_mode: 'Markdown' });
    return;
  }

  // Accept either a full redirect URL or a bare code
  let code = raw;
  if (raw.startsWith('http')) {
    try {
      const parsed = new URL(raw);
      code = parsed.searchParams.get('code') ?? raw;
    } catch {
      // keep raw
    }
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

export async function handleStatus(ctx: Context) {
  const [googleConnected, reminderSnap, memorySnap, machineSnap, tokenSnap, pendingSnap, runningSnap] = await Promise.all([
    isConnected(),
    db.collection('vera-reminders').where('status', '==', 'pending').count().get(),
    db.collection('vera-memory').where('userId', '==', String(ctx.from?.id)).count().get(),
    db.collection('machine-status').get(),
    db.collection('token-usage').doc('summary').get(),
    db.collection('claude-tasks').where('status', '==', 'pending').count().get(),
    db.collection('claude-tasks').where('status', '==', 'running').count().get(),
  ]);

  const lastSessionSnap = await db.collection('team-workflow')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get();

  const lastSession = lastSessionSnap.empty
    ? 'ไม่มีข้อมูล'
    : lastSessionSnap.docs[0].data()['session'] ?? 'ไม่มีข้อมูล';

  // ── Machine health (Mac mini + any reporting box) ──
  const now = Date.now();
  const machineLines = machineSnap.empty
    ? '  (ยังไม่มี heartbeat)'
    : machineSnap.docs.map((d) => {
        const m = d.data();
        const upd = m['updated_at']?.toDate?.()?.getTime?.() ?? 0;
        const fresh = upd && now - upd < 5 * 60_000;
        const svcUp = (m['services'] || []).filter((s: any) => s.running).length;
        const svcTot = (m['services'] || []).length;
        return `  ${fresh ? '🟢' : '⚪️'} *${m['id'] || d.id}* — RAM ${m['ram_pct']}% · Disk ${m['disk']?.pct}% · up ${m['uptime_h']}h · svc ${svcUp}/${svcTot}`;
      }).join('\n');

  // ── Token cost ──
  const t = tokenSnap.exists ? tokenSnap.data()! : null;
  const tokenLine = t
    ? `💰 Token: วันนี้ $${t['today_cost_usd'] ?? 0} · 7วัน $${t['last7_cost_usd'] ?? 0} · รวม $${Math.round(t['all_time_cost_usd'] ?? 0)}`
    : '💰 Token: ไม่มีข้อมูล';

  const pending = pendingSnap.data().count;
  const running = runningSnap.data().count;

  await ctx.reply(
    '*🖥️ Ops Status*\n\n' +
    '*เครื่อง:*\n' + machineLines + '\n\n' +
    tokenLine + '\n' +
    `📋 Queue: ${running} กำลังทำ · ${pending} ค้าง\n` +
    `🗓️ Last session: ${lastSession}\n\n` +
    '*Vera:*\n' +
    `Google: ${googleConnected ? '✅' : '❌ /connect'} · Reminders: ${reminderSnap.data().count} · Memory: ${memorySnap.data().count}`,
    { parse_mode: 'Markdown' }
  );
}

const MODEL_LABELS: Record<ModelProvider, string> = {
  auto: '🤖 auto (Claude → Gemini fallback)',
  claude: '🟠 Claude only',
  gemini: '🔵 Gemini only',
};

export async function handleModel(ctx: Context) {
  const userId = String(ctx.from?.id);
  const text = ctx.message?.text ?? '';
  const arg = text.replace('/model', '').trim().toLowerCase();

  if (!arg) {
    const current = await getUserProvider(userId);
    await ctx.reply(
      `*Vera LLM provider*\n\n` +
      `ปัจจุบัน: ${MODEL_LABELS[current]}\n\n` +
      `เปลี่ยนได้ด้วย:\n` +
      `• \`/model auto\` — Claude หลัก, fallback Gemini อัตโนมัติ\n` +
      `• \`/model claude\` — Claude อย่างเดียว\n` +
      `• \`/model gemini\` — Gemini อย่างเดียว`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  if (arg !== 'auto' && arg !== 'claude' && arg !== 'gemini') {
    await ctx.reply('ใช้: /model auto | claude | gemini');
    return;
  }

  await setUserProvider(userId, arg as ModelProvider);
  await ctx.reply(`เปลี่ยน provider เป็น ${MODEL_LABELS[arg as ModelProvider]} แล้วค่ะ ✅`);
}

export async function handleProactive(ctx: Context) {
  const userId = String(ctx.from?.id);
  const text = ctx.message?.text ?? '';
  const arg = text.replace('/proactive', '').trim().toLowerCase();

  if (arg !== 'on' && arg !== 'off') {
    const snap = await db.collection('vera-prefs').doc(userId).get();
    const current = snap.data()?.['proactive'] === 'off' ? 'off' : 'on';
    await ctx.reply(
      `*Proactive alerts*\n\n` +
      `ปัจจุบัน: ${current === 'on' ? '🟢 on' : '🔴 off'}\n\n` +
      `แจ้งเตือนอัตโนมัติ:\n` +
      `📧 Email สำคัญ (every 10 min)\n` +
      `⏰ นัดใกล้ ~10 นาที (every 5 min)\n` +
      `📋 งานเลยกำหนด (daily 08:30 BKK)\n\n` +
      `เปิด/ปิด: \`/proactive on\` หรือ \`/proactive off\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  await db.collection('vera-prefs').doc(userId).set(
    { proactive: arg, updatedAt: new Date() },
    { merge: true }
  );
  await ctx.reply(arg === 'on' ? '🟢 Proactive alerts เปิดแล้ว' : '🔴 Proactive alerts ปิดแล้ว');
}

export async function handleHelp(ctx: Context) {
  await ctx.reply(
    '*Vera — วิธีใช้งาน*\n\n' +
    'แค่พิมพ์ตามธรรมชาติค่ะ เช่น:\n\n' +
    '💡 "บันทึกไอเดีย: อยากทำแอป..."\n' +
    '⏰ "เตือนฉันพรุ่งนี้ 9 โมงเรื่อง meeting"\n' +
    '📋 "ให้ Kai ทำ deploy ก่อน 5 โมง"\n' +
    '🔍 "ฉันพูดเรื่อง Firestore เมื่อไหร่?"\n\n' +
    'คำสั่ง: /reminders /ideas /tasks /connect /model /proactive /help',
    { parse_mode: 'Markdown' }
  );
}
