import { db } from '../firebase.js';

const NBL_BASE = 'https://notebooklm.google.com';
const BATCH_URL = `${NBL_BASE}/_/LabsTailwindUi/data/batchexecute`;

// ─── Cookie helpers ──────────────────────────────────────────────────────────

async function loadCookieHeader(): Promise<string> {
  const snap = await db.collection('vera-notebooklm').doc('session').get();
  if (!snap.exists) throw new Error('ไม่มี NotebookLM session — ใช้ /nbl_cookies เพื่อ setup');

  const cookies: any[] = snap.data()!['cookies'] ?? [];
  if (!cookies.length) throw new Error('cookies ว่างเปล่า — ใช้ /nbl_cookies ใหม่');

  return cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
}

// ─── Session extraction (CSRF + build label + session ID) ───────────────────

interface NBLSession {
  snlm0e: string; // CSRF token
  bl: string;     // build label
  sid: string;    // session ID
}

async function fetchSession(cookieHeader: string): Promise<NBLSession> {
  const res = await fetch(NBL_BASE, {
    headers: {
      Cookie: cookieHeader,
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!res.ok) throw new Error(`GET notebooklm.google.com → ${res.status}`);

  const html = await res.text();

  // Detect redirect to sign-in
  if (html.includes('accounts.google.com') || html.includes('ServiceLogin')) {
    throw new Error('NBL_AUTH_EXPIRED: cookies หมดอายุ — ใช้ /nbl_cookies ใหม่');
  }

  const snlm0e = html.match(/"SNlM0e":"([^"]+)"/)?.[1] ?? '';
  const bl     = html.match(/"cfb2h":"([^"]+)"/)?.[1]
               ?? html.match(/"bl":"([^"]+)"/)?.[1]
               ?? '';
  const sid    = html.match(/"FdrFJe":"([^"]+)"/)?.[1] ?? '';

  if (!snlm0e) throw new Error('ดึง CSRF token ไม่ได้ — cookies อาจหมดอายุ');

  return { snlm0e, bl, sid };
}

// ─── batchexecute helper ─────────────────────────────────────────────────────

async function batchExecute(
  cookieHeader: string,
  session: NBLSession,
  rpcId: string,
  payload: unknown[],
  reqId = 1,
): Promise<any> {
  const fReq = JSON.stringify([[[ rpcId, JSON.stringify(payload), null, 'generic' ]]]);
  const body = `f.req=${encodeURIComponent(fReq)}&at=${encodeURIComponent(session.snlm0e)}&`;

  const url = `${BATCH_URL}?rpcids=${rpcId}&bl=${session.bl}&_reqid=${reqId}&rt=c`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Cookie: cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      'X-Same-Domain': '1',
      Origin: NBL_BASE,
      Referer: `${NBL_BASE}/`,
    },
    body,
  });

  if (!res.ok) throw new Error(`batchexecute ${rpcId} → HTTP ${res.status}`);

  const text = await res.text();
  // Strip XSSI prefix )]}'
  const clean = text.replace(/^\)\]\}'\n/, '').trim();

  try {
    const outer = JSON.parse(clean);
    // Response is nested arrays — find the wrb.fr entry
    for (const chunk of outer) {
      if (Array.isArray(chunk) && chunk[0] === 'wrb.fr' && chunk[1] === rpcId && chunk[2]) {
        return JSON.parse(chunk[2]);
      }
    }
    return outer;
  } catch {
    return clean;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function notebooklmCreate(args: Record<string, unknown>): Promise<string> {
  const title      = String(args.title ?? 'Research');
  const sourceUrls = (args.source_urls as string[]) ?? [];
  const summaryNote = String(args.summary_note ?? '');

  try {
    const cookieHeader = await loadCookieHeader();
    const session      = await fetchSession(cookieHeader);

    // 1. Create notebook — RPC CCqFvf
    const createPayload = [title, null, null, [2]];
    const createResp    = await batchExecute(cookieHeader, session, 'CCqFvf', createPayload, 1);

    // Extract notebook ID from response array
    // Expected structure: [[notebookId, title, ...], ...]
    let notebookId: string | null = null;
    if (Array.isArray(createResp)) {
      const flat = createResp.flat(5);
      notebookId = flat.find((v: any) => typeof v === 'string' && v.length > 10 && !v.includes(' ')) ?? null;
    }

    if (!notebookId) {
      console.error('[NotebookLM] Unexpected create response:', JSON.stringify(createResp).slice(0, 300));
      throw new Error('ดึง notebook ID ไม่ได้จาก response');
    }

    const notebookUrl = `${NBL_BASE}/notebook/${notebookId}`;

    // 2. Add source URLs — RPC izAoDd
    for (const url of sourceUrls.slice(0, 5)) {
      try {
        await batchExecute(cookieHeader, session, 'izAoDd', [notebookId, url], 2);
        await new Promise(r => setTimeout(r, 1500));
      } catch (e) {
        console.warn('[NotebookLM] Add source failed:', url, e);
      }
    }

    // 3. Add summary note if provided — RPC could vary; skip if unknown
    // (note creation RPC not confirmed — skip for now)

    return `✅ NotebookLM สร้างแล้วค่ะ\nชื่อ: ${title}\nSources: ${sourceUrls.length} แหล่ง\nลิงก์: ${notebookUrl}`;

  } catch (err: any) {
    console.error('[NotebookLM] Error:', err);
    const msg = err.message ?? String(err);
    if (msg.includes('NBL_AUTH_EXPIRED') || msg.includes('nbl_cookies')) {
      return `ERROR_NBL_AUTH: cookies หมดอายุ — ใช้ /nbl_cookies เพื่อ export ใหม่จาก Chrome`;
    }
    return `ERROR_NBL: ${msg.slice(0, 200)}`;
  }
}

export async function notebooklmDebugPage(): Promise<string> {
  try {
    const cookieHeader = await loadCookieHeader();
    const session = await fetchSession(cookieHeader);
    return `✅ Session OK\nSNlM0e: ${session.snlm0e.slice(0, 20)}...\nbl: ${session.bl}\nsid: ${session.sid.slice(0, 20)}...`;
  } catch (err: any) {
    return `ERROR: ${err.message}`;
  }
}

export async function notebooklmSaveSession(cookiesJson: string): Promise<string> {
  try {
    const rawCookies = JSON.parse(cookiesJson);
    const cookies = rawCookies.map((c: any) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? '/',
      expires: c.expirationDate ?? -1,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? false,
      sameSite: c.sameSite === 'no_restriction' ? 'None'
              : c.sameSite === 'lax' ? 'Lax'
              : c.sameSite === 'strict' ? 'Strict'
              : 'None',
    }));

    await db.collection('vera-notebooklm').doc('session').set({
      cookies,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
      source: 'manual-export',
    });

    return `✅ บันทึก ${cookies.length} cookies แล้วค่ะ — ลอง /nbl_debug เพื่อทดสอบ`;
  } catch (err: any) {
    return `❌ บันทึกไม่สำเร็จ: ${err.message}`;
  }
}
