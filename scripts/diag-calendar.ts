import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthedClient, isConnected, isGoogleConfigured } from '../src/services/google-auth.js';
import { db } from '../src/firebase.js';

function dump(label: string, e: any) {
  const gerr = e?.response?.data?.error;
  console.log(`\n❌ ${label} FAILED`);
  console.log('  status :', e?.code ?? e?.response?.status);
  console.log('  message:', e?.message);
  if (gerr) {
    console.log('  g.error:', typeof gerr === 'string' ? gerr : JSON.stringify(gerr?.status ?? gerr));
    const reasons = gerr?.errors?.map((x: any) => x.reason).join(', ');
    if (reasons) console.log('  reasons:', reasons);
    if (gerr?.message) console.log('  g.msg  :', gerr.message);
  }
}

async function main() {
  console.log('googleConfigured:', isGoogleConfigured());
  console.log('isConnected     :', await isConnected());

  const snap = await db.collection('vera-google-tokens').doc('champ').get();
  if (snap.exists) {
    const t = snap.data()!;
    console.log('token scopes    :', t.scope ?? '(none stored)');
    console.log('has refresh_tok :', !!t.refresh_token);
    console.log('expiry_date     :', t.expiry_date, t.expiry_date ? new Date(t.expiry_date).toISOString() : '');
  } else {
    console.log('NO TOKEN DOC — Champ never completed /connect');
  }

  const auth = await getAuthedClient();
  if (!auth) { console.log('no authed client'); process.exit(0); }

  // Force a token refresh to surface refresh-token problems
  try {
    const at = await auth.getAccessToken();
    console.log('\naccess token ok :', !!at?.token);
  } catch (e) { dump('TOKEN REFRESH', e); }

  // Gmail (known-working control)
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    const p = await gmail.users.getProfile({ userId: 'me' });
    console.log('\n✅ GMAIL ok     :', p.data.emailAddress, 'msgs', p.data.messagesTotal);
  } catch (e) { dump('GMAIL', e); }

  // Calendar (the reported failure)
  try {
    const cal = google.calendar({ version: 'v3', auth });
    const r = await cal.events.list({ calendarId: 'primary', maxResults: 1, timeMin: new Date().toISOString(), singleEvents: true, orderBy: 'startTime' });
    console.log('\n✅ CALENDAR ok  :', (r.data.items ?? []).length, 'event(s)');
  } catch (e) { dump('CALENDAR', e); }

  // Calendar list (does the token even have calendar scope granted?)
  try {
    const cal = google.calendar({ version: 'v3', auth });
    const cl = await cal.calendarList.list({ maxResults: 5 });
    console.log('✅ CAL LIST ok  :', (cl.data.items ?? []).map(c => c.id).join(', '));
  } catch (e) { dump('CALENDAR LIST', e); }

  process.exit(0);
}
main().catch(e => { console.error('fatal', e); process.exit(1); });
