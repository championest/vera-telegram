import { getPage, closeBrowser, touch } from '../services/browser.js';
const MAX_TEXT = 4000;
function trimText(s) {
    const cleaned = s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (cleaned.length <= MAX_TEXT)
        return cleaned;
    return cleaned.slice(0, MAX_TEXT) + `\n\n... [truncated ${cleaned.length - MAX_TEXT} chars]`;
}
/** Heuristic: looks like a CSS selector vs. visible text */
function isSelector(s) {
    return /^[#.\[]|::?|>|\s>\s|\s+\.\w|\s+#\w/.test(s.trim()) || /^[a-z]+\[/i.test(s.trim());
}
function pickLocator(page, target, opts) {
    if (isSelector(target))
        return page.locator(target).first();
    // Try button/link first by accessible name, then any text
    if (opts?.role)
        return page.getByRole(opts.role, { name: target, exact: false }).first();
    return page.getByText(target, { exact: false }).first();
}
async function pageSummary(page) {
    const url = page.url();
    const title = await page.title().catch(() => '');
    let bodyText = '';
    try {
        bodyText = await page.locator('body').innerText({ timeout: 3000 });
    }
    catch { /* page might be navigating */ }
    return `📍 *URL:* ${url}\n*Title:* ${title}\n\n${trimText(bodyText)}`;
}
export async function webOpen(args) {
    const url = String(args.url ?? '').trim();
    if (!url)
        return 'ระบุ url ด้วย';
    let target = url;
    if (!/^https?:\/\//i.test(target))
        target = `https://${target}`;
    try {
        const page = await getPage();
        await page.goto(target, { waitUntil: 'domcontentloaded' });
        // Wait briefly for client-side render
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        touch();
        return await pageSummary(page);
    }
    catch (err) {
        return `เปิดเว็บไม่สำเร็จ: ${err?.message ?? 'unknown'}`;
    }
}
export async function webClick(args) {
    const target = String(args.target ?? '').trim();
    const role = args.role ? String(args.role) : undefined;
    if (!target)
        return 'ระบุ target (text หรือ selector) ด้วย';
    try {
        const page = await getPage();
        const loc = pickLocator(page, target, { role });
        await loc.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => { });
        await loc.click({ timeout: 10_000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => { });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => { });
        touch();
        return `✅ คลิก "${target}" แล้ว\n\n` + await pageSummary(page);
    }
    catch (err) {
        return `คลิกไม่สำเร็จ "${target}": ${err?.message ?? 'unknown'}`;
    }
}
export async function webFill(args) {
    const target = String(args.target ?? '').trim();
    const value = String(args.value ?? '');
    const submit = Boolean(args.submit ?? false);
    if (!target)
        return 'ระบุ target (label หรือ selector) ด้วย';
    try {
        const page = await getPage();
        let loc;
        if (isSelector(target)) {
            loc = page.locator(target).first();
        }
        else {
            loc = page.getByLabel(target, { exact: false }).first();
            // Fallback: by placeholder
            if (await loc.count() === 0)
                loc = page.getByPlaceholder(target, { exact: false }).first();
        }
        await loc.fill(value, { timeout: 8000 });
        if (submit) {
            await loc.press('Enter');
            await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => { });
        }
        touch();
        return `✅ กรอก "${target}" = "${value}"${submit ? ' + Enter' : ''}\n\n` + await pageSummary(page);
    }
    catch (err) {
        return `กรอกไม่สำเร็จ "${target}": ${err?.message ?? 'unknown'}`;
    }
}
export async function webExtract(_args) {
    try {
        const page = await getPage();
        touch();
        // Also list main links (top 15) for navigation context
        const links = await page.$$eval('a[href]', as => as.slice(0, 50)
            .map(a => ({ text: a.innerText?.trim() ?? '', href: a.href }))
            .filter(l => l.text && l.text.length < 80)
            .slice(0, 15)).catch(() => []);
        const linkList = links.length ? '\n\n*Links:*\n' + links.map(l => `• [${l.text}](${l.href})`).join('\n') : '';
        return await pageSummary(page) + linkList;
    }
    catch (err) {
        return `อ่านหน้าไม่สำเร็จ: ${err?.message ?? 'unknown'}`;
    }
}
export async function webClose(_args) {
    await closeBrowser();
    return '🔒 ปิด browser session แล้ว';
}
