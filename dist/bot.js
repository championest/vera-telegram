import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config.js';
import { handleUserMessage, handleMediaMessage } from './handlers/message.js';
import { handleStart, handleReminders, handleIdeas, handleTasks, handleHelp, handleConnect, handleCode, handleStatus, handleMenu } from './handlers/command.js';
import { handleReminderCallback } from './scheduler/reminders.js';
import { sendMorningBrief } from './scheduler/morning-brief.js';
import { db } from './firebase.js';
import { calendarListEvents } from './tools/calendar-list.js';
import { gmailListUnread } from './tools/gmail-read.js';
import { listReminders } from './tools/list-reminders.js';
import { getSessionContext } from './tools/session-bridge.js';
export function createBot() {
    const bot = new Bot(config.TELEGRAM_BOT_TOKEN);
    const ownerId = parseInt(config.TELEGRAM_OWNER_CHAT_ID, 10);
    // Only respond to Champ
    bot.use(async (ctx, next) => {
        if (ctx.from?.id !== ownerId) {
            await ctx.reply('Unauthorized.');
            return;
        }
        await next();
    });
    bot.command('start', handleStart);
    bot.command('reminders', handleReminders);
    bot.command('ideas', handleIdeas);
    bot.command('tasks', handleTasks);
    bot.command('connect', handleConnect);
    bot.command('code', handleCode);
    bot.command('help', handleHelp);
    bot.command('status', handleStatus);
    bot.command('menu', handleMenu);
    bot.command('brief', async (ctx) => {
        await ctx.api.sendChatAction(ctx.chat.id, 'typing');
        try {
            await sendMorningBrief(bot);
        }
        catch (err) {
            await ctx.reply(`เกิดข้อผิดพลาด: ${err.message}`);
        }
    });
    bot.command('nbl_connect', async (ctx) => {
        await ctx.reply('📓 *NotebookLM Setup*\n\n' +
            'เพื่อให้ Vera สร้าง NotebookLM ได้อัตโนมัติ ต้องทำครั้งเดียว:\n\n' +
            '1. เปิด [notebooklm.google.com](https://notebooklm.google.com) บน Chrome\n' +
            '2. Login ด้วย Google account ของ Champ\n' +
            '3. กด F12 → Application → Cookies → https://notebooklm.google.com\n' +
            '4. Copy cookies ทั้งหมดเป็น JSON (ใช้ EditThisCookie extension แล้วกด Export)\n' +
            '5. ส่งมาให้ Vera ด้วยคำสั่ง:\n' +
            '`/nbl_cookies [paste JSON here]`', { parse_mode: 'Markdown' });
    });
    bot.command('nbl_cookies', async (ctx) => {
        const text = ctx.message?.text ?? '';
        const cookiesJson = text.replace('/nbl_cookies', '').trim();
        if (!cookiesJson) {
            await ctx.reply('กรุณาใส่ cookies JSON หลังคำสั่ง');
            return;
        }
        const { notebooklmSaveSession } = await import('./tools/notebooklm.js');
        const result = await notebooklmSaveSession(cookiesJson);
        await ctx.reply(result);
    });
    bot.on('callback_query:data', async (ctx) => {
        const data = ctx.callbackQuery.data ?? '';
        if (data.startsWith('rm:')) {
            const [, action, docId] = data.split(':');
            await handleReminderCallback(bot, action, docId, ctx.callbackQuery.id);
            try {
                await ctx.editMessageReplyMarkup();
            }
            catch { /* message too old */ }
        }
        else if (data === 'brief:plan_day') {
            await ctx.answerCallbackQuery({ text: 'กำลังวางแผน...' });
            try {
                await ctx.editMessageReplyMarkup();
            }
            catch { /* ok */ }
            await ctx.api.sendChatAction(ctx.chat.id, 'typing');
            try {
                // Build context from Firestore before calling Gemini
                const [tasksSnap, ideasSnap] = await Promise.all([
                    db.collection('team-workflow')
                        .where('status', 'in', ['IN_PROGRESS', 'TODO'])
                        .orderBy('timestamp', 'desc')
                        .limit(10)
                        .get(),
                    db.collection('vera-ideas')
                        .orderBy('createdAt', 'desc')
                        .limit(5)
                        .get(),
                ]);
                const tasks = tasksSnap.docs.map(d => `[${d.data()['status']}] ${d.data()['member']}: ${d.data()['task']}`).join('\n');
                const ideas = ideasSnap.docs.map(d => `• ${d.data()['title']}`).join('\n');
                const planQuery = `วันนี้ไม่มีนัด ช่วยวางแผนวันนี้ให้หน่อยค่ะ

Tasks ที่ยังค้างอยู่:
${tasks || '(ไม่มี)'}

Ideas ที่บันทึกไว้:
${ideas || '(ไม่มี)'}

แนะนำว่าวันนี้ควรโฟกัสเรื่องอะไรก่อน แล้วช่วยสร้าง schedule คร่าวๆ ได้เลยค่ะ`;
                const userId = String(ctx.from?.id);
                const reply = await handleUserMessage(userId, planQuery);
                try {
                    await ctx.reply(reply, { parse_mode: 'Markdown' });
                }
                catch {
                    await ctx.reply(reply);
                }
            }
            catch (err) {
                await ctx.reply(`เกิดข้อผิดพลาดค่ะ: ${err.message ?? 'unknown'}`);
            }
        }
        else if (data === 'brief:free_day') {
            await ctx.answerCallbackQuery({ text: 'โอเค! วันพักผ่อน 😊' });
            try {
                await ctx.editMessageReplyMarkup();
            }
            catch { /* ok */ }
            await ctx.reply('โอเคค่ะ วันนี้ไม่มีนัด — พักผ่อนได้เลย หรือจะให้ Vera ช่วยอะไรก็พิมพ์มาได้เลยนะคะ 😊');
        }
        else {
            await ctx.answerCallbackQuery();
        }
    });
    async function sendMediaReply(ctx, buffer, mimeType, caption) {
        const userId = String(ctx.from.id);
        await ctx.api.sendChatAction(ctx.chat.id, 'typing');
        try {
            const reply = await handleMediaMessage(userId, buffer, mimeType, caption);
            try {
                await ctx.reply(reply, { parse_mode: 'Markdown' });
            }
            catch {
                await ctx.reply(reply);
            }
        }
        catch (err) {
            console.error('[Media handler error]', err);
            await ctx.reply('ขออภัยค่ะ ไม่สามารถประมวลผลไฟล์ได้');
        }
    }
    async function downloadTelegramFile(ctx, fileId) {
        const file = await ctx.api.getFile(fileId);
        const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const res = await fetch(url);
        return Buffer.from(await res.arrayBuffer());
    }
    bot.on('message:voice', async (ctx) => {
        const buf = await downloadTelegramFile(ctx, ctx.message.voice.file_id);
        await sendMediaReply(ctx, buf, 'audio/ogg', null);
    });
    bot.on('message:audio', async (ctx) => {
        const buf = await downloadTelegramFile(ctx, ctx.message.audio.file_id);
        await sendMediaReply(ctx, buf, ctx.message.audio.mime_type ?? 'audio/mpeg', null);
    });
    bot.on('message:photo', async (ctx) => {
        const photos = ctx.message.photo;
        const largest = photos[photos.length - 1];
        const buf = await downloadTelegramFile(ctx, largest.file_id);
        await sendMediaReply(ctx, buf, 'image/jpeg', ctx.message.caption ?? null);
    });
    bot.on('message:document', async (ctx) => {
        const doc = ctx.message.document;
        const mime = doc.mime_type ?? '';
        if (!mime.startsWith('image/') && !mime.startsWith('audio/')) {
            await ctx.reply('ตอนนี้รองรับแค่รูปภาพและไฟล์เสียงค่ะ');
            return;
        }
        const buf = await downloadTelegramFile(ctx, doc.file_id);
        await sendMediaReply(ctx, buf, mime, ctx.message.caption ?? null);
    });
    const KEYBOARD_DIRECT = {
        '📅 ตาราง': () => calendarListEvents({ days: 7 }),
        '📧 เมล': () => gmailListUnread({ limit: 5 }),
        '⏰ Reminder': (uid) => listReminders({}, uid),
        '💼 งานทีม': () => getSessionContext({ limit: 10 }),
        '🔍 ค้นหา...': async () => 'พิมพ์ตามนี้ได้เลยค่ะ เช่น "ค้นหา ราคา iPhone 16" หรือ "เช็คข่าว..."',
        '📝 บันทึกไอเดีย...': async () => 'พิมพ์ตามนี้ได้เลยค่ะ เช่น "บันทึกไอเดีย: อยากทำแอป..."',
    };
    bot.on('message:text', async (ctx) => {
        const userId = String(ctx.from.id);
        const rawText = ctx.message.text;
        await ctx.api.sendChatAction(ctx.chat.id, 'typing');
        // Keyboard button → direct tool call (no Gemini roundtrip)
        const directHandler = KEYBOARD_DIRECT[rawText];
        if (directHandler) {
            try {
                const result = await directHandler(userId);
                try {
                    await ctx.reply(result, { parse_mode: 'Markdown' });
                }
                catch {
                    await ctx.reply(result);
                }
            }
            catch (err) {
                console.error('[Keyboard handler error]', err);
                await ctx.reply(`เกิดข้อผิดพลาดค่ะ: ${err.message ?? 'unknown'}`);
            }
            return;
        }
        // All other text → Gemini agentic loop
        // Send an immediate status message so Champ knows Vera received the request
        let statusMsgId = null;
        try {
            const sent = await ctx.reply('⏳ กำลังดำเนินการ...');
            statusMsgId = sent.message_id;
        }
        catch { /* non-fatal */ }
        // Keep typing indicator alive every 4s (Telegram drops it after 5s)
        const typingInterval = setInterval(async () => {
            try {
                await ctx.api.sendChatAction(ctx.chat.id, 'typing');
            }
            catch { /* ignore */ }
        }, 4000);
        const updateStatus = async (text) => {
            if (statusMsgId == null)
                return;
            try {
                await ctx.api.editMessageText(ctx.chat.id, statusMsgId, text);
            }
            catch { /* ignore */ }
        };
        const sendUpdate = async (text) => {
            try {
                await ctx.reply(text);
            }
            catch { /* ignore */ }
        };
        try {
            const reply = await handleUserMessage(userId, rawText, updateStatus, sendUpdate);
            // Remove status message before sending final reply
            if (statusMsgId != null) {
                try {
                    await ctx.api.deleteMessage(ctx.chat.id, statusMsgId);
                }
                catch { /* ignore */ }
            }
            try {
                await ctx.reply(reply, { parse_mode: 'Markdown' });
            }
            catch {
                await ctx.reply(reply);
            }
        }
        catch (err) {
            console.error('[Message handler error]', err);
            if (statusMsgId != null) {
                try {
                    await ctx.api.deleteMessage(ctx.chat.id, statusMsgId);
                }
                catch { /* ignore */ }
            }
            await ctx.reply(`⚠️ ${err?.message?.slice(0, 200) ?? String(err).slice(0, 200)}`);
        }
        finally {
            clearInterval(typingInterval);
        }
    });
    bot.catch((err) => {
        if (err.error instanceof GrammyError) {
            console.error('[Grammy error]', err.error.description);
        }
        else if (err.error instanceof HttpError) {
            console.error('[HTTP error]', err.error);
        }
        else {
            console.error('[Unexpected error]', err.error);
        }
    });
    return bot;
}
