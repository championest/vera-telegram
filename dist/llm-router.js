import { db } from './firebase.js';
import { config } from './config.js';
import { runClaudeLoop } from './claude-loop.js';
import { runGeminiLoop, GEMINI_PRIMARY, GEMINI_FALLBACK } from './gemini-loop.js';
import { appendMessage } from './memory/conversation.js';
/** Whether Claude is usable at all this process. If no key, everything routes to Gemini. */
const HAS_CLAUDE = !!config.ANTHROPIC_API_KEY;
// When Claude fails for a "hard" reason (no credit / bad key), skip it for a
// while and serve on Gemini — then automatically retry Claude after the cooldown
// (so funding the account or fixing the key self-heals with no redeploy).
const CLAUDE_COOLDOWN_MS = 15 * 60 * 1000;
let claudeCooldownUntil = 0;
export const DEFAULT_PROVIDER = 'auto';
const PREFS_COLLECTION = 'vera-prefs';
const prefCache = new Map();
const PREF_TTL_MS = 60_000;
export async function getUserProvider(userId) {
    const cached = prefCache.get(userId);
    if (cached && cached.expiresAt > Date.now())
        return cached.value;
    try {
        const snap = await db.collection(PREFS_COLLECTION).doc(userId).get();
        const stored = snap.exists ? snap.data()?.['provider'] : undefined;
        const value = stored === 'claude' || stored === 'gemini' || stored === 'auto' ? stored : DEFAULT_PROVIDER;
        prefCache.set(userId, { value, expiresAt: Date.now() + PREF_TTL_MS });
        return value;
    }
    catch (err) {
        console.warn('[llm-router] getUserProvider failed', err);
        return DEFAULT_PROVIDER;
    }
}
export async function setUserProvider(userId, provider) {
    await db.collection(PREFS_COLLECTION).doc(userId).set({ provider, updatedAt: new Date() }, { merge: true });
    prefCache.set(userId, { value: provider, expiresAt: Date.now() + PREF_TTL_MS });
}
function isOverloaded(err) {
    const msg = String(err?.message ?? err ?? '');
    const status = err?.status ?? err?.statusCode;
    if (typeof status === 'number' && (status === 429 || status === 503 || status === 529 || status >= 500))
        return true;
    return /overload|rate.?limit|503|529|service unavailable|temporarily|timeout|ETIMEDOUT|ECONNRESET/i.test(msg);
}
/** "Hard" Claude failures that won't fix themselves per-request: no credit, bad/expired key,
 *  no model access. Fall back to Gemini AND cool down so we don't retry every turn. */
function isClaudeHardFail(err) {
    const msg = String(err?.message ?? err?.error?.error?.message ?? err ?? '');
    const status = err?.status ?? err?.statusCode;
    if (status === 401 || status === 403)
        return true;
    if (status === 400 && /credit|billing|balance|too low|quota|insufficient/i.test(msg))
        return true;
    return /credit balance|billing|too low|insufficient|quota exceeded/i.test(msg);
}
/** Convert NormalizedFile[] to Anthropic content blocks */
function filesToClaudeBlocks(files) {
    const blocks = [];
    for (const f of files) {
        const mime = f.mimeType;
        if (mime.startsWith('image/')) {
            blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: mime, data: f.buffer.toString('base64') },
            });
        }
        else if (mime === 'application/pdf') {
            blocks.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: f.buffer.toString('base64') },
            });
        }
        else {
            // Plain text fallback — extracted text passed via filename context
            const text = f.buffer.toString('utf-8');
            blocks.push({
                type: 'text',
                text: `<file name="${f.filename ?? 'attached'}" type="${mime}">\n${text}\n</file>`,
            });
        }
    }
    return blocks;
}
/** Convert NormalizedFile[] to Gemini Part[] */
function filesToGeminiParts(files) {
    const parts = [];
    for (const f of files) {
        const mime = f.mimeType;
        if (mime.startsWith('image/') || mime === 'application/pdf') {
            parts.push({
                inlineData: {
                    mimeType: mime,
                    data: f.buffer.toString('base64'),
                },
            });
        }
        else {
            const text = f.buffer.toString('utf-8');
            parts.push({
                text: `<file name="${f.filename ?? 'attached'}" type="${mime}">\n${text}\n</file>`,
            });
        }
    }
    return parts;
}
/**
 * Main entry — picks provider, executes agentic loop, falls back to the other on overload.
 *
 * - 'claude' : Claude only (no fallback)
 * - 'gemini' : Gemini only (no fallback)
 * - 'auto'   : Claude primary, fall back to Gemini on overload/5xx
 */
export async function runAgent(opts) {
    // If no Claude key is configured, force Gemini regardless of stored/requested preference.
    const provider = HAS_CLAUDE
        ? (opts.provider ?? await getUserProvider(opts.userId))
        : 'gemini';
    const files = opts.files ?? [];
    // Persist user turn ONCE here so both loops see it in history
    await appendMessage(opts.userId, 'user', opts.userText || (files.length ? '[ส่งไฟล์มา]' : ''));
    const runClaude = () => runClaudeLoop({
        userId: opts.userId,
        userText: opts.userText,
        onProgress: opts.onProgress,
        sendUpdate: opts.sendUpdate,
        attachments: files.length ? filesToClaudeBlocks(files) : undefined,
        skipAppend: true,
        model: opts.claudeModel,
    });
    const runGemini = (model) => runGeminiLoop({
        userId: opts.userId,
        userText: opts.userText,
        onProgress: opts.onProgress,
        sendUpdate: opts.sendUpdate,
        attachments: files.length ? filesToGeminiParts(files) : undefined,
        skipAppend: true,
    }, model);
    // Gemini with its own primary→fallback-model chain.
    const runGeminiChain = async () => {
        try {
            return await runGemini(GEMINI_PRIMARY);
        }
        catch (err) {
            if (isOverloaded(err)) {
                console.warn('[llm-router] Gemini primary failed, switching to fallback model');
                return await runGemini(GEMINI_FALLBACK);
            }
            throw err;
        }
    };
    if (provider === 'gemini')
        return runGeminiChain();
    // claude or auto → try Claude, fall back to Gemini on overload OR hard failure.
    // While Claude is in cooldown (recent billing/auth failure) skip it entirely.
    if (Date.now() < claudeCooldownUntil)
        return runGeminiChain();
    try {
        return await runClaude();
    }
    catch (err) {
        const hard = isClaudeHardFail(err);
        if (!hard && !isOverloaded(err))
            throw err;
        if (hard) {
            claudeCooldownUntil = Date.now() + CLAUDE_COOLDOWN_MS;
            console.warn('[llm-router] Claude unavailable (billing/auth) — using Gemini for 15m');
        }
        else {
            console.warn('[llm-router] Claude overloaded — falling back to Gemini');
        }
        return runGeminiChain();
    }
}
