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
- `vera-memory` — conversation history (userId, role, content, timestamp)
- `vera-reminders` — scheduled reminders (userId, message, remindAt, repeat, status)
- `vera-ideas` — saved ideas (title, body, tags, createdAt)
- `team-workflow` — SHARED with team-dashboard (Vera appends with source: 'vera-bot')

## Required Firestore indexes (create in Firebase Console)
- `vera-memory`: userId ASC, timestamp ASC
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
