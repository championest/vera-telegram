import { listReminders } from '../tools/list-reminders.js';
import { db } from '../firebase.js';
import { isGoogleConfigured, getAuthUrl, isConnected } from '../services/google-auth.js';
export async function handleStart(ctx) {
    await ctx.reply('*Vera ที่นี่ค่ะ* — เลขาฯ ส่วนตัวของคุณ Champ\n\n' +
        'พิมพ์อะไรก็ได้เลยค่ะ หรือใช้คำสั่ง:\n' +
        '/reminders — ดู reminder ที่ตั้งไว้\n' +
        '/ideas — ดูไอเดียที่บันทึกไว้\n' +
        '/tasks — ดู task ทีมวันนี้\n' +
        '/help — วิธีใช้งาน', { parse_mode: 'Markdown' });
}
export async function handleReminders(ctx) {
    const userId = String(ctx.from?.id);
    const result = await listReminders({}, userId);
    await ctx.reply(result);
}
export async function handleIdeas(ctx) {
    const snap = await db.collection('vera-ideas').orderBy('createdAt', 'desc').limit(10).get();
    if (snap.empty) {
        await ctx.reply('ยังไม่มีไอเดียที่บันทึกไว้ค่ะ');
        return;
    }
    const lines = snap.docs.map(d => `• *${d.data()['title']}*\n  ${d.data()['body']}`);
    await ctx.reply(lines.join('\n\n'), { parse_mode: 'Markdown' });
}
export async function handleTasks(ctx) {
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
export async function handleConnect(ctx) {
    if (!isGoogleConfigured()) {
        await ctx.reply('ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID/SECRET ในระบบค่ะ\nกรุณาเพิ่ม env vars ใน Railway ก่อนนะคะ');
        return;
    }
    if (await isConnected()) {
        await ctx.reply('เชื่อม Google แล้วค่ะ ✅\nใช้ Gmail และ Calendar ได้เลย');
        return;
    }
    const url = getAuthUrl();
    await ctx.reply('*เชื่อม Google Account*\n\n' +
        '1. กดปุ่มด้านล่าง → อนุมัติ Google Account\n' +
        '2. Browser เด้งไป localhost (error ปกติ)\n' +
        '3. Copy URL ทั้งหมดจาก address bar\n' +
        '4. ส่งกลับมาที่นี่ว่า `/code <URL นั้น>`', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '🔗 เชื่อม Google Account', url }]],
        },
    });
}
export async function handleCode(ctx) {
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
        }
        catch {
            // keep raw
        }
    }
    try {
        if (ctx.chat)
            await ctx.api.sendChatAction(ctx.chat.id, 'typing');
        const { exchangeCode } = await import('../services/google-auth.js');
        await exchangeCode(code);
        await ctx.reply('เชื่อม Google สำเร็จแล้วค่ะ ✅\nตอนนี้ใช้ Gmail และ Calendar ได้เลย');
    }
    catch (err) {
        console.error('[handleCode error]', err);
        await ctx.reply('เชื่อมไม่สำเร็จค่ะ — code อาจหมดอายุหรือไม่ถูกต้อง\nลอง /connect ใหม่อีกครั้งนะคะ');
    }
}
export async function handleHelp(ctx) {
    await ctx.reply('*Vera — วิธีใช้งาน*\n\n' +
        'แค่พิมพ์ตามธรรมชาติค่ะ เช่น:\n\n' +
        '💡 "บันทึกไอเดีย: อยากทำแอป..."\n' +
        '⏰ "เตือนฉันพรุ่งนี้ 9 โมงเรื่อง meeting"\n' +
        '📋 "ให้ Kai ทำ deploy ก่อน 5 โมง"\n' +
        '🔍 "ฉันพูดเรื่อง Firestore เมื่อไหร่?"\n\n' +
        'คำสั่ง: /reminders /ideas /tasks /connect /help', { parse_mode: 'Markdown' });
}
