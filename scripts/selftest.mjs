// End-to-end self-test of Vera's secretary brain (persona + tools + Gemini),
// bypassing the Telegram transport. Uses a throwaway userId so it never
// pollutes Champ's real conversation history / reminders.
import 'dotenv/config';
import { runAgent } from '../dist/llm-router.js';

const USER = 'vera-selftest';               // NOT the owner — isolates memory/reminders
const prompts = [
  // 1) casual chat — must NOT fire research/web_search (the old "มั่วๆ" bug)
  'สวัสดีค่ะ Vera ว่างมั้ย ขอคุยด้วยแป๊บ',
  // 2) task assignment — must route to member=cody (roster fix)
  'สั่ง Cody ให้ deploy guild web หน่อยนะ',
  // 3) calendar read — should list events or gracefully say /connect if not connected
  'พรุ่งนี้มีนัดอะไรบ้าง',
];

for (const p of prompts) {
  console.log('\n=== USER: ' + p);
  try {
    const reply = await runAgent({ userId: USER, userText: p });
    console.log('--- VERA:\n' + reply);
  } catch (e) {
    console.log('!!! ERROR: ' + (e?.message ?? e));
  }
}
console.log('\n[selftest done]');
process.exit(0);
