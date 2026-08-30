// Safe Telegram sending.
//
// Vera builds almost every message by interpolating live data — note bodies,
// reminder text, calendar titles, task names, tool output, error strings — into
// a `parse_mode: 'Markdown'` template. Telegram's legacy Markdown treats `_`,
// `*`, `` ` `` and `[` as syntax, so ONE stray underscore anywhere in that data
// makes the API reject the entire message with:
//
//   400: can't parse entities: Can't find end of the entity starting at byte N
//
// That is not a formatting glitch, it is total message loss. The 07:00 morning
// brief died this way and simply stopped arriving — no error visible to Champ,
// just silence. Task names like `progress_text` or a file path with an
// underscore are enough to trigger it.
//
// Two defences, use both:
//   mdEscape()  — wrap every interpolated value so it can't open an entity
//   sendMd()    — if a message still fails to parse, resend it as plain text
//                 rather than losing it
import type { Api, Bot, Context } from 'grammy';

type SendExtra = Parameters<Api['sendMessage']>[2];
type EditExtra = Parameters<Api['editMessageText']>[3];

/** Escape the four characters legacy Markdown treats as entity syntax. */
export function mdEscape(value: unknown): string {
  return String(value ?? '').replace(/([_*`[])/g, '\\$1');
}

function isParseError(err: any): boolean {
  const desc = String(err?.description ?? err?.message ?? '');
  return err?.error_code === 400 && /can't parse entities|can't find end of/i.test(desc);
}

/**
 * Send with Markdown, degrading to plain text if the text won't parse.
 * Delivery beats formatting — a readable message with visible asterisks is
 * infinitely better than no message.
 */
export async function sendMd(
  bot: Bot,
  chatId: string | number,
  text: string,
  extra?: SendExtra,
): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown', ...extra });
  } catch (err: any) {
    if (!isParseError(err)) throw err;
    console.warn('[telegram] markdown rejected, resending as plain text');
    await bot.api.sendMessage(chatId, text, { ...extra, parse_mode: undefined });
  }
}

/** editMessageText with the same degradation. */
export async function editMd(
  bot: Bot,
  chatId: string | number,
  messageId: number,
  text: string,
  extra?: EditExtra,
): Promise<void> {
  try {
    await bot.api.editMessageText(chatId, messageId, text, { parse_mode: 'Markdown', ...extra });
  } catch (err: any) {
    if (!isParseError(err)) throw err;
    await bot.api.editMessageText(chatId, messageId, text, { ...extra, parse_mode: undefined });
  }
}

/** ctx.reply with the same degradation, for command and message handlers. */
export async function replyMd(ctx: Context, text: string, extra?: SendExtra): Promise<void> {
  try {
    await ctx.reply(text, { parse_mode: 'Markdown', ...extra });
  } catch (err: any) {
    if (!isParseError(err)) throw err;
    console.warn('[telegram] markdown rejected on reply, resending as plain text');
    await ctx.reply(text, { ...extra, parse_mode: undefined });
  }
}
