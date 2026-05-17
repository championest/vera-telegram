import { chromium } from 'playwright';
import { getAuthedClient } from '../services/google-auth.js';
import { db } from '../firebase.js';
const NBL_BASE = 'https://notebooklm.google.com';
async function launchBrowser() {
    return chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
}
async function getAuthenticatedContext(browser) {
    // Try stored cookies first
    const snap = await db.collection('vera-notebooklm').doc('session').get();
    if (snap.exists) {
        const data = snap.data();
        const expiresAt = data['expiresAt']?.toDate?.();
        if (expiresAt && expiresAt > new Date()) {
            const context = await browser.newContext();
            await context.addCookies(data['cookies']);
            return context;
        }
    }
    // Try to auth via Google OAuth access token
    const auth = await getAuthedClient();
    if (!auth)
        throw new Error('Google ยังไม่ได้เชื่อมค่ะ — กรุณาใช้ /connect');
    const { token: accessToken } = await auth.getAccessToken();
    if (!accessToken)
        throw new Error('ไม่สามารถดึง access token ได้');
    const context = await browser.newContext();
    const page = await context.newPage();
    // Use OAuthLogin to establish Google browser session
    await page.goto(`https://accounts.google.com/accounts/OAuthLogin?source=ogb&package_name=com.google.android.googlequicksearchbox&key=${accessToken}`, { waitUntil: 'networkidle', timeout: 30000 });
    // Check if we landed on a Google page (session established)
    const url = page.url();
    if (!url.includes('google.com')) {
        throw new Error('Google auth failed — URL: ' + url);
    }
    // Navigate to NotebookLM to trigger auth
    await page.goto(NBL_BASE, { waitUntil: 'networkidle', timeout: 30000 });
    const finalUrl = page.url();
    if (finalUrl.includes('accounts.google.com') || finalUrl.includes('signin')) {
        throw new Error('NotebookLM auth failed — still on sign-in page');
    }
    // Store cookies for future use (7 days)
    const cookies = await context.cookies();
    await db.collection('vera-notebooklm').doc('session').set({
        cookies,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
    });
    await page.close();
    return context;
}
/** Debug helper — returns all visible button/link text on the current page */
export async function notebooklmDebugPage() {
    let browser = null;
    try {
        browser = await launchBrowser();
        const context = await getAuthenticatedContext(browser);
        const page = await context.newPage();
        await page.goto(NBL_BASE, { waitUntil: 'networkidle', timeout: 30000 });
        const finalUrl = page.url();
        // Collect all button/link text and aria-labels
        const elements = await page.evaluate(() => {
            const sel = 'button, a, [role="button"], [role="link"]';
            return Array.from(document.querySelectorAll(sel))
                .map(el => ({
                tag: el.tagName,
                text: el.innerText?.trim().slice(0, 60),
                label: el.getAttribute('aria-label')?.slice(0, 60),
                testid: el.getAttribute('data-testid'),
            }))
                .filter(e => e.text || e.label)
                .slice(0, 30);
        });
        await browser.close();
        const lines = elements.map((e) => `[${e.tag}] text="${e.text}" label="${e.label}" testid="${e.testid}"`);
        return `URL: ${finalUrl}\n\n${lines.join('\n')}`;
    }
    catch (err) {
        try {
            browser?.close();
        }
        catch { }
        return `DEBUG_ERROR: ${err.message?.slice(0, 200)}`;
    }
}
export async function notebooklmCreate(args) {
    const title = String(args.title ?? 'Research');
    const sourceUrls = args.source_urls ?? [];
    const summaryNote = String(args.summary_note ?? '');
    let browser = null;
    try {
        browser = await launchBrowser();
    }
    catch (err) {
        console.error('[NotebookLM] Browser launch failed:', err);
        return `ERROR_NBL: Chromium launch failed — ${err.message?.slice(0, 150)}`;
    }
    try {
        const context = await getAuthenticatedContext(browser);
        const page = await context.newPage();
        // Navigate to NotebookLM
        await page.goto(NBL_BASE, { waitUntil: 'networkidle', timeout: 30000 });
        // Click "New notebook" button
        const newNotebookBtn = page.locator('[data-testid="new-notebook-button"], button:has-text("New notebook"), button:has-text("notebook ใหม่"), button:has-text("Create"), button:has-text("New")').first();
        await newNotebookBtn.waitFor({ timeout: 15000 });
        await newNotebookBtn.click();
        // Wait for notebook to load (URL changes to /notebook/ID)
        await page.waitForURL(/\/notebook\//, { timeout: 20000 });
        const notebookUrl = page.url();
        const notebookId = notebookUrl.split('/notebook/')[1]?.split('?')[0];
        // Rename notebook title
        try {
            const titleInput = page.locator('[data-testid="notebook-title"], input[placeholder*="title"], input[aria-label*="title"]').first();
            await titleInput.waitFor({ timeout: 5000 });
            await titleInput.click({ clickCount: 3 });
            await titleInput.fill(title);
            await page.keyboard.press('Enter');
        }
        catch { /* title rename optional */ }
        // Add source URLs one by one
        for (const url of sourceUrls.slice(0, 5)) {
            try {
                // Click "Add source" button
                const addSourceBtn = page.locator('button:has-text("Add source"), button:has-text("เพิ่มแหล่ง"), [data-testid="add-source"]').first();
                await addSourceBtn.waitFor({ timeout: 10000 });
                await addSourceBtn.click();
                // Select "Website" option
                const websiteOption = page.locator('button:has-text("Website"), [data-testid="source-website"]').first();
                await websiteOption.waitFor({ timeout: 5000 });
                await websiteOption.click();
                // Enter URL
                const urlInput = page.locator('input[type="url"], input[placeholder*="url"], input[placeholder*="URL"]').first();
                await urlInput.waitFor({ timeout: 5000 });
                await urlInput.fill(url);
                // Submit
                const submitBtn = page.locator('button:has-text("Insert"), button:has-text("Add"), button[type="submit"]').first();
                await submitBtn.click();
                // Wait for source to process
                await page.waitForTimeout(3000);
            }
            catch (err) {
                console.warn('[NotebookLM] Failed to add source:', url, err);
            }
        }
        // Add summary as a note (if supported)
        if (summaryNote) {
            try {
                const addNoteBtn = page.locator('button:has-text("Add note"), button:has-text("Studio"), [data-testid="add-note"]').first();
                await addNoteBtn.waitFor({ timeout: 5000 });
                await addNoteBtn.click();
                const noteArea = page.locator('textarea[placeholder*="note"], [data-testid="note-input"]').first();
                await noteArea.waitFor({ timeout: 5000 });
                await noteArea.fill(summaryNote.slice(0, 2000));
                const saveNoteBtn = page.locator('button:has-text("Save"), button:has-text("บันทึก")').first();
                await saveNoteBtn.click();
            }
            catch { /* note is optional */ }
        }
        await browser.close();
        return `✅ NotebookLM สร้างแล้วค่ะ\nชื่อ: ${title}\nSources: ${sourceUrls.length} แหล่ง\nลิงก์: ${notebookUrl}`;
    }
    catch (err) {
        try {
            browser?.close();
        }
        catch { /* ignore */ }
        console.error('[NotebookLM] Creation failed:', err);
        // Don't clear cookies on auth error — might be a transient issue
        const errMsg = err.message?.slice(0, 150) ?? String(err).slice(0, 150);
        return `ERROR_NBL: ${errMsg}`;
    }
}
export async function notebooklmSaveSession(cookiesJson) {
    try {
        const cookies = JSON.parse(cookiesJson);
        await db.collection('vera-notebooklm').doc('session').set({
            cookies,
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            updatedAt: new Date(),
        });
        return '✅ บันทึก NotebookLM session แล้วค่ะ';
    }
    catch (err) {
        return `❌ บันทึก session ไม่สำเร็จ: ${err.message}`;
    }
}
