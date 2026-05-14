import { Bot, GrammyError, HttpError } from 'grammy';
import { config } from './config.js';
import { handleUserMessage } from './handlers/message.js';
import { handleStart, handleReminders, handleIdeas, handleTasks, handleHelp } from './handlers/command.js';

export function createBot(): Bot {
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
  bot.command('help', handleHelp);

  bot.on('message:text', async (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.message.text;

    await ctx.api.sendChatAction(ctx.chat.id, 'typing');

    try {
      const reply = await handleUserMessage(userId, text);
      await ctx.reply(reply, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[Message handler error]', err);
      await ctx.reply('ขออภัยค่ะ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  });

  bot.catch((err) => {
    if (err.error instanceof GrammyError) {
      console.error('[Grammy error]', err.error.description);
    } else if (err.error instanceof HttpError) {
      console.error('[HTTP error]', err.error);
    } else {
      console.error('[Unexpected error]', err.error);
    }
  });

  return bot;
}
