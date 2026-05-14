import { google } from 'googleapis';
import { db } from '../firebase.js';
import { config } from '../config.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
];

export function isGoogleConfigured(): boolean {
  return !!(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_REDIRECT_URI);
}

export function createOAuth2Client() {
  if (!isGoogleConfigured()) throw new Error('Google OAuth not configured');
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID!,
    config.GOOGLE_CLIENT_SECRET!,
    config.GOOGLE_REDIRECT_URI!,
  );
}

export function getAuthUrl(): string {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: 'http://localhost',
  });
}

export async function exchangeCode(code: string): Promise<void> {
  const oauth2 = createOAuth2Client();
  // Override redirect_uri to match what was used in getAuthUrl
  const { tokens } = await oauth2.getToken({ code, redirect_uri: 'http://localhost' });
  await db.collection('vera-google-tokens').doc('champ').set({ ...tokens, updatedAt: new Date() });
}

export async function getAuthedClient() {
  if (!isGoogleConfigured()) return null;
  const snap = await db.collection('vera-google-tokens').doc('champ').get();
  if (!snap.exists) return null;

  const tokens = snap.data()!;
  const oauth2 = createOAuth2Client();
  oauth2.setCredentials(tokens);

  // Persist refreshed tokens automatically
  oauth2.on('tokens', async (newTokens) => {
    await db.collection('vera-google-tokens').doc('champ').set(
      { ...tokens, ...newTokens, updatedAt: new Date() },
      { merge: true }
    );
  });

  return oauth2;
}

export async function isConnected(): Promise<boolean> {
  if (!isGoogleConfigured()) return false;
  const snap = await db.collection('vera-google-tokens').doc('champ').get();
  return snap.exists && !!snap.data()?.access_token;
}
