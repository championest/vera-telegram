import express from 'express';
import { exchangeCode } from '../services/google-auth.js';
import { config } from '../config.js';
let pendingSuccess = false;
export function getAndClearPendingSuccess() {
    const v = pendingSuccess;
    pendingSuccess = false;
    return v;
}
export function createHttpServer() {
    const app = express();
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', service: 'vera-telegram' });
    });
    app.get('/oauth/callback', async (req, res) => {
        const code = req.query.code;
        if (!code) {
            res.status(400).send('Missing code parameter.');
            return;
        }
        try {
            await exchangeCode(code);
            pendingSuccess = true;
            res.send('<html><body><h2>✅ เชื่อม Google สำเร็จ!</h2><p>กลับไป Telegram ได้เลยค่ะ</p></body></html>');
        }
        catch (err) {
            console.error('[OAuth callback error]', err);
            res.status(500).send('<html><body><h2>❌ เชื่อมไม่สำเร็จ</h2><p>กรุณาลองใหม่ค่ะ</p></body></html>');
        }
    });
    const port = parseInt(config.PORT, 10);
    app.listen(port, () => console.log(`HTTP server listening on port ${port}`));
    return app;
}
