import { chromium, type BrowserContext, type Page } from 'playwright';

const USER_DATA_DIR = process.env.BROWSER_DATA_DIR ?? '/tmp/vera-browser-data';
const IDLE_TIMEOUT_MS = 10 * 60_000; // close after 10 min idle to free RAM

let context: BrowserContext | null = null;
let page: Page | null = null;
let lastUsed = Date.now();
let closer: NodeJS.Timeout | null = null;

async function launchContext(): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  return ctx;
}

function scheduleIdleClose(): void {
  if (closer) clearTimeout(closer);
  closer = setTimeout(async () => {
    if (Date.now() - lastUsed >= IDLE_TIMEOUT_MS) {
      await closeBrowser();
    } else {
      scheduleIdleClose();
    }
  }, IDLE_TIMEOUT_MS + 1000);
}

export async function getPage(): Promise<Page> {
  lastUsed = Date.now();
  if (page && !page.isClosed()) return page;

  if (!context) {
    context = await launchContext();
    context.on('close', () => { context = null; page = null; });
  }
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(45_000);
  scheduleIdleClose();
  return page;
}

export async function closeBrowser(): Promise<void> {
  try {
    if (page && !page.isClosed()) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  } finally {
    page = null;
    context = null;
    if (closer) { clearTimeout(closer); closer = null; }
  }
}

export function touch(): void {
  lastUsed = Date.now();
}
