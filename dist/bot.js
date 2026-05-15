import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config.js';
import { handleUserMessage, handleMediaMessage } from './handlers/message.js';
import { handleStart, handleReminders, handleIdeas, handleTasks, handleHelp, handleConnect, handleCode, handleStatus, handleMenu } from './handlers/command.js';
import { handleReminderCallback } from './scheduler/reminders.js';
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
        try {
            const reply = await handleUserMessage(userId, rawText);
            try {
                await ctx.reply(reply, { parse_mode: 'Markdown' });
            }
            catch {
                await ctx.reply(reply);
            }
        }
        catch (err) {
            console.error('[Message handler error]', err);
            await ctx.reply('ขออภัยค่ะ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
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
