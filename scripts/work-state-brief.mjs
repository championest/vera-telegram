// Prints a compact cross-project work-state brief for Claude Code SessionStart.
// Run from vera-telegram root (needs firebase-admin + .env FIREBASE_KEY_PATH).
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

const envPath = new URL('../.env', import.meta.url).pathname;
let keyPath = process.env.FIREBASE_KEY_PATH;
if (!keyPath && existsSync(envPath)) {
  const m = readFileSync(envPath, 'utf8').match(/^FIREBASE_KEY_PATH=(.+)$/m);
  if (m) keyPath = m[1].trim();
}
if (!keyPath || !existsSync(keyPath)) {
  console.log('WORK STATE: unavailable (no service account key)');
  process.exit(0);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();

const ago = (ts) => {
  const mins = Math.round((Date.now() - ts.toDate().getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};
const clip = (s, n) => (s && s.length > n ? s.slice(0, n).trim() + '…' : s || '');

try {
  const [states, pending] = await Promise.all([
    db.collection('work-state').orderBy('updated_at', 'desc').limit(6).get(),
    db.collection('claude-tasks').where('status', '==', 'pending').get().catch(() => ({ size: 0, forEach: () => {} })),
  ]);

  console.log('WORK STATE (continuity across sessions/devices):');
  if (states.empty) console.log('  (no recorded work yet)');
  states.forEach((d) => {
    const s = d.data();
    console.log(`  • [${s.project}] ${ago(s.updated_at)} — ${clip(s.last_task, 110)}`);
    if (s.last_summary) console.log(`      ↳ ${clip(s.last_summary, 130)}`);
    if (s.next) console.log(`      → next: ${clip(s.next, 110)}`);
  });
  if (pending.size > 0) {
    console.log(`PENDING REMOTE TASKS (claude-tasks): ${pending.size} — executor daemon should pick these up.`);
    pending.forEach((d) => console.log(`  • ${clip(d.data().task, 110)}`));
  }
} catch (e) {
  console.log('WORK STATE: query failed —', e.message);
}
process.exit(0);
