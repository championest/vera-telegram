import express from 'express';
import type { Bot } from 'grammy';
import { exchangeCode } from '../services/google-auth.js';
import { config } from '../config.js';
import { recordClaudeSync, ClaudeSyncEntry } from '../memory/claude-sync.js';
import { pushTaskResult } from '../scheduler/task-results.js';

let pendingSuccess = false;
export function getAndClearPendingSuccess(): boolean {
  const v = pendingSuccess;
  pendingSuccess = false;
  return v;
}

export function createHttpServer(bot?: Bot) {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'vera-telegram' });
  });

  app.post('/claude-sync', async (req, res) => {
    try {
      const body = req.body ?? {};
      const entry: ClaudeSyncEntry = {
        user_msg: String(body.user_msg ?? ''),
        claude_summary: String(body.claude_summary ?? ''),
        project: String(body.project ?? ''),
        cwd: String(body.cwd ?? ''),
        session_id: String(body.session_id ?? ''),
        timestamp: String(body.timestamp ?? new Date().toISOString()),
        source: 'claude-code',
      };
      await recordClaudeSync(entry);
      res.json({ ok: true });
    } catch (err) {
      console.error('[claude-sync] error:', err);
      res.status(500).json({ ok: false, error: 'sync_failed' });
    }
  });

  // Mac executor pings this when a claude-task finishes; result text is read
  // from Firestore by taskId (unguessable doc ID = auth), never from the body.
  app.post('/task-result', async (req, res) => {
    try {
      const taskId = String(req.body?.taskId ?? '').trim();
      if (!taskId || !bot) {
        res.status(400).json({ ok: false });
        return;
      }
      const pushed = await pushTaskResult(bot, taskId);
      res.json({ ok: pushed });
    } catch (err) {
      console.error('[task-result] error:', err);
      res.status(500).json({ ok: false });
    }
  });

  app.get('/oauth/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send('Missing code parameter.');
      return;
    }
    try {
      await exchangeCode(code);
      pendingSuccess = true;
      res.send('<html><body><h2>✅ เชื่อม Google สำเร็จ!</h2><p>กลับไป Telegram ได้เลยค่ะ</p></body></html>');
    } catch (err) {
      console.error('[OAuth callback error]', err);
      res.status(500).send('<html><body><h2>❌ เชื่อมไม่สำเร็จ</h2><p>กรุณาลองใหม่ค่ะ</p></body></html>');
    }
  });

  const port = parseInt(config.PORT, 10);
  app.listen(port, () => console.log(`HTTP server listening on port ${port}`));

  return app;
}
