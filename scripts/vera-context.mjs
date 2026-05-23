#!/usr/bin/env node
/**
 * Query vera-conversations + champ-tasks from Firestore.
 * Run from: cd /Projects/vera-telegram && node scripts/vera-context.mjs
 * Outputs formatted work context for Ace to read in Claude Code.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, '../package.json'));

// Use dotenv from vera-telegram's node_modules
const dotenv = require('dotenv');
dotenv.config({ path: resolve(__dirname, '../.env') });

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.startsWith('-----')
        ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        : Buffer.from(process.env.FIREBASE_PRIVATE_KEY ?? '', 'base64').toString('utf8'),
    }),
  });
}

const db = admin.firestore();
const output = [];

// 1. vera-conversations (unsynced first, then recent 7)
const convSnap = await db.collection('vera-conversations')
  .orderBy('timestamp', 'desc')
  .limit(7)
  .get();

if (!convSnap.empty) {
  output.push('## Work Context จาก Vera (Telegram)\n');
  for (const doc of convSnap.docs) {
    const d = doc.data();
    const synced = d.synced_to_claude ? ' _(synced)_' : ' **[NEW]**';
    const ts = d.timestamp?.toDate?.()?.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) ?? '';
    output.push(`### ${d.topic}${synced}${ts ? ` — ${ts}` : ''}`);
    output.push(d.summary);
    if (d.action_items?.length) {
      output.push('\nAction items:');
      for (const item of d.action_items) output.push(`- ${item}`);
    }
    if (d.project) output.push(`\nProject: ${d.project}`);
    output.push('');

    // mark synced
    if (!d.synced_to_claude) {
      await doc.ref.update({ synced_to_claude: true });
    }
  }
}

// 1b. claude-conversations (recent Claude Code session turns)
const claudeSnap = await db.collection('claude-conversations')
  .orderBy('timestamp', 'desc')
  .limit(7)
  .get();

if (!claudeSnap.empty) {
  output.push('## Recent Claude Code session\n');
  for (const doc of claudeSnap.docs) {
    const d = doc.data();
    const ts = d.timestamp ? new Date(d.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '';
    output.push(`### ${d.project || 'session'}${ts ? ` — ${ts}` : ''}`);
    if (d.user_msg) output.push(`**You:** ${d.user_msg}`);
    if (d.claude_summary) output.push(`**Claude:** ${d.claude_summary}`);
    output.push('');
  }
}

// 2. champ-tasks (TODO + IN_PROGRESS)
const tasksSnap = await db.collection('champ-tasks')
  .where('status', 'in', ['TODO', 'IN_PROGRESS'])
  .orderBy('createdAt', 'desc')
  .limit(10)
  .get();

if (!tasksSnap.empty) {
  output.push('## Champ Tasks (TODO / IN_PROGRESS)\n');
  for (const doc of tasksSnap.docs) {
    const d = doc.data();
    const priority = d.priority === 'urgent' ? '🔴' : d.priority === 'high' ? '🟠' : '⚪';
    const status = d.status === 'IN_PROGRESS' ? '⏳' : '📋';
    output.push(`${status} ${priority} **${d.title}**${d.dueDate ? ` (due: ${d.dueDate})` : ''}`);
    if (d.notes) output.push(`   ${d.notes}`);
  }
  output.push('');
}

if (output.length === 0) {
  console.log('ไม่มี work context หรือ tasks จาก Vera');
} else {
  console.log(output.join('\n'));
}

process.exit(0);
