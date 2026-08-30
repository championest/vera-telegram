import { google } from 'googleapis';
import { db } from '../firebase.js';
import { config } from '../config.js';
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/documents',
];
export function isGoogleConfigured() {
    return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI);
}
export function createOAuth2Client() {
    if (!isGoogleConfigured())
        throw new Error('Google OAuth not configured');
    return new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, config.GOOGLE_REDIRECT_URI);
}
export function getAuthUrl() {
    const oauth2 = createOAuth2Client();
    return oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        redirect_uri: 'http://localhost',
    });
}
export async function exchangeCode(code) {
    const oauth2 = createOAuth2Client();
    // Override redirect_uri to match what was used in getAuthUrl
    const { tokens } = await oauth2.getToken({ code, redirect_uri: 'http://localhost' });
    await db.collection('vera-google-tokens').doc('champ').set({ ...tokens, updatedAt: new Date() });
}
export async function getAuthedClient() {
    if (!isGoogleConfigured())
        return null;
    const snap = await db.collection('vera-google-tokens').doc('champ').get();
    if (!snap.exists)
        return null;
    const tokens = snap.data();
    const oauth2 = createOAuth2Client();
    oauth2.setCredentials(tokens);
    // Persist refreshed tokens automatically
    oauth2.on('tokens', async (newTokens) => {
        await db.collection('vera-google-tokens').doc('champ').set({ ...tokens, ...newTokens, updatedAt: new Date() }, { merge: true });
    });
    return oauth2;
}
export async function isConnected() {
    if (!isGoogleConfigured())
        return false;
    const snap = await db.collection('vera-google-tokens').doc('champ').get();
    return snap.exists && !!snap.data()?.access_token;
}
/** Friendly message when the Google connection is missing OR the refresh token died. */
export const GOOGLE_EXPIRED = 'การเชื่อม Google หมดอายุแล้วค่ะ 🔑 — ส่ง /connect เพื่อเชื่อมใหม่ (ทำครั้งเดียวจบ)';
/** Detect an expired/revoked refresh token (Google returns "invalid_grant"). */
export function isInvalidGrant(e) {
    const s = String(e?.response?.data?.error ?? e?.message ?? e ?? '');
    return /invalid_grant/i.test(s);
}
/** Extract a comparable string of an error's Google reason + message. */
function errText(e) {
    const g = e?.response?.data?.error;
    const reason = g?.errors?.[0]?.reason ?? g?.status ?? '';
    const msg = g?.message ?? e?.message ?? '';
    return `${reason} ${msg} ${String(e ?? '')}`;
}
/** The API itself is turned off in the Cloud project (403 accessNotConfigured /
 *  SERVICE_DISABLED). This is the classic "Gmail works but Calendar fails"
 *  cause: the Calendar API was never enabled in the OAuth client's project. */
export function isApiDisabled(e) {
    return /accessNotConfigured|SERVICE_DISABLED|has not been used in project|it is disabled/i.test(errText(e));
}
/** The stored token was granted before this scope existed (403 insufficient scope). */
export function isInsufficientScope(e) {
    const status = e?.code ?? e?.response?.status;
    return Number(status) === 403 && /insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(errText(e));
}
/** Google Cloud project NUMBER that owns the OAuth client (client_id prefix). */
function oauthProjectNumber() {
    const m = (config.GOOGLE_CLIENT_ID ?? '').match(/^(\d+)-/);
    return m ? m[1] : null;
}
/** Direct "enable this API" console link for the OAuth client's project. */
export function apiEnableUrl(apiId) {
    const p = oauthProjectNumber();
    return `https://console.cloud.google.com/apis/library/${apiId}${p ? `?project=${p}` : ''}`;
}
/** Map a Google API error to an actionable Thai message (and clear dead tokens).
 *  Returns null when the error is NOT a recognized auth/config problem — the
 *  caller should then rethrow so it surfaces normally. `api` = human label,
 *  `apiId` = the googleapis library id (e.g. 'calendar-json.googleapis.com'). */
export async function friendlyGoogleError(e, api, apiId) {
    if (isInvalidGrant(e)) {
        await clearTokens();
        return GOOGLE_EXPIRED;
    }
    if (isApiDisabled(e)) {
        return (`Google ${api} API ยังไม่ได้เปิดใช้งานใน Cloud project ค่ะ ⚙️\n\n` +
            `แชมป์เปิดลิงก์นี้ แล้วกด *ENABLE*:\n${apiEnableUrl(apiId)}\n\n` +
            `รอสัก 1 นาทีแล้วลองใหม่ได้เลยค่ะ (Gmail/Drive ใช้ได้เพราะ API พวกนั้นเปิดไว้แล้ว แต่ ${api} ยังไม่เปิด)`);
    }
    if (isInsufficientScope(e)) {
        return `การเชื่อม Google ที่มีอยู่ยังไม่มีสิทธิ์ ${api} ค่ะ 🔑 — ส่ง /connect เพื่ออนุมัติสิทธิ์ใหม่ให้ครบทุกตัวนะคะ`;
    }
    return null;
}
/** Remove the dead token doc so isConnected()→false and tools stop failing loudly. */
export async function clearTokens() {
    await db.collection('vera-google-tokens').doc('champ').delete().catch(() => { });
}
