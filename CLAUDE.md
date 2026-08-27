# vera-telegram — Project Context

Personal Telegram AI secretary bot for Champ, deployed on Railway.

## Stack
- grammy (Telegram bot framework, TypeScript-first)
- Anthropic Claude API (claude-sonnet-4-6) with tool use
- Firebase Firestore (project: up-level-guild) — Admin SDK via env vars
- node-cron (reminder scheduler, polls every 60s)
- TypeScript / Node.js ESM

## Key paths
- Entry: `src/index.ts` → `src/bot.ts`
- Claude agentic loop: `src/handlers/message.ts`
- Tool schemas: `src/tools/definitions.ts`
- Tool implementations: `src/tools/*.ts`
- Vera persona: `src/persona/vera.ts`
- Reminder scheduler: `src/scheduler/reminders.ts`
- Conversation memory: `src/memory/conversation.ts`

## Firestore collections
- `vera-memory` — conversation history (userId, role, content, timestamp, embedding)
- `vera-sessions` — rolled-up session summaries (summary, topics, decisions, openThreads, embedding). Written by `scheduler/memory-rollup.ts` every 30 min once a conversation has been idle 30 min. This is what makes memory survive past the 20-message live window.
- `vera-facts` — durable facts about Champ. Written by `save_fact` AND auto-extracted by the rollup; deduped semantically (cosine ≥ 0.88) so restatements don't pile up.
- `vera-memory-state` — per-user `lastRollupAt` marker so a rollup never re-summarizes the same messages
- `vera-reminders` — scheduled reminders (userId, message, remindAt, repeat, status)
- `vera-ideas` — saved ideas (title, body, tags, createdAt)
- `team-workflow` — SHARED with team-dashboard (Vera appends with source: 'vera-bot')
- `claude-tasks` — remote execution queue: Vera `dispatch_claude_task` writes pending → Mac executor daemon (`~/.claude/team/executor/`) runs Claude Code headless → writes result → `/task-result` or 60s sweeper pushes to Telegram. Admin-SDK-only (no public rules) by design.
  - The executor wakes on a **Firestore realtime listener**, not the 20s poll (poll is the fallback) — measured claim latency 1.2s.
  - While it works it writes `progress_text` / `progress_at` (throttled 20s); `scheduler/task-progress.ts` mirrors that into ONE Telegram message it keeps editing, so a long task reads as alive instead of hung.
- `work-state` — rolling per-project state written by Claude Code Stop hook; surfaced in `get_session_context`
- `claude-executor/heartbeat` — Mac daemon liveness (stale >2min = Mac offline)
- `tickets` — user bug/suggestion tickets submitted from Up Level web apps (PKM Court today; widget reusable). Sweeper (`scheduler/tickets.ts`) polls `notified == false`, sends Telegram card with [🤖 Claude fix / ⏰ Later / ✅ Done] buttons. `fix` enqueues a `claude-tasks` doc bound to the ticket so the executor self-closes it.

## Required Firestore indexes (create in Firebase Console)
- `vera-memory`: userId ASC, timestamp ASC
- `vera-sessions`: userId ASC, createdAt DESC
- `vera-facts`: userId ASC, createdAt DESC
- `vera-reminders`: status ASC, remindAt ASC
- `vera-reminders`: userId ASC, status ASC, remindAt ASC
- `team-workflow`: source ASC, session ASC, timestamp DESC

## Deploy
1. Push to GitHub
2. Connect to Railway → auto-detect Node.js (Nixpacks)
3. Set env vars in Railway dashboard (see .env.example)
4. Railway runs: `npm run build && npm start`

## Security
Bot middleware blocks all users except TELEGRAM_OWNER_CHAT_ID.
Firebase creds are loaded from env vars — never commit service-account.json.
