import { config } from '../config.js';
const GH_API = 'https://api.github.com';
function headers() {
    return {
        Authorization: `Bearer ${config.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };
}
export async function githubListRepos(args) {
    if (!config.GITHUB_TOKEN)
        return 'github tools ไม่พร้อม — ตั้งค่า GITHUB_TOKEN ใน Railway';
    const limit = Number(args.limit ?? 10);
    const res = await fetch(`${GH_API}/user/repos?sort=updated&per_page=${limit}`, { headers: headers() });
    if (!res.ok)
        return `GitHub error ${res.status}: ${await res.text()}`;
    const repos = (await res.json());
    return `📦 Repos (${repos.length}):\n` + repos.map(r => `• ${r.full_name} (${r.default_branch}) — ${r.description ?? 'no description'}`).join('\n');
}
export async function githubReadFile(args) {
    if (!config.GITHUB_TOKEN)
        return 'github tools ไม่พร้อม — ตั้งค่า GITHUB_TOKEN ใน Railway';
    const repo = String(args.repo ?? '');
    const path = String(args.path ?? '');
    const branch = String(args.branch ?? 'main');
    if (!repo || !path)
        return 'ต้องระบุ repo และ path';
    const res = await fetch(`${GH_API}/repos/${repo}/contents/${path}?ref=${branch}`, { headers: headers() });
    if (!res.ok)
        return `GitHub error ${res.status}: ${await res.text()}`;
    const data = (await res.json());
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const preview = content.length > 2000 ? content.slice(0, 2000) + '\n...[ตัดที่ 2000 ตัวอักษร]' : content;
    return `📄 ${repo}/${path} (sha: ${data.sha.slice(0, 7)})\n\`\`\`\n${preview}\n\`\`\``;
}
export async function githubUpdateFile(args) {
    if (!config.GITHUB_TOKEN)
        return 'github tools ไม่พร้อม — ตั้งค่า GITHUB_TOKEN ใน Railway';
    const repo = String(args.repo ?? '');
    const path = String(args.path ?? '');
    const content = String(args.content ?? '');
    const message = String(args.message ?? 'update via Vera');
    const branch = String(args.branch ?? 'main');
    if (!repo || !path || !content)
        return 'ต้องระบุ repo, path, และ content';
    let sha;
    const getRes = await fetch(`${GH_API}/repos/${repo}/contents/${path}?ref=${branch}`, { headers: headers() });
    if (getRes.ok)
        sha = (await getRes.json()).sha;
    const body = { message, content: Buffer.from(content).toString('base64'), branch };
    if (sha)
        body.sha = sha;
    const res = await fetch(`${GH_API}/repos/${repo}/contents/${path}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify(body),
    });
    if (!res.ok)
        return `GitHub error ${res.status}: ${await res.text()}`;
    const data = (await res.json());
    return `✅ Committed: ${message}\n🔗 ${data.commit.html_url}`;
}
export async function githubCreatePr(args) {
    if (!config.GITHUB_TOKEN)
        return 'github tools ไม่พร้อม — ตั้งค่า GITHUB_TOKEN ใน Railway';
    const repo = String(args.repo ?? '');
    const title = String(args.title ?? '');
    const head = String(args.head ?? '');
    const base = String(args.base ?? 'main');
    const body = String(args.body ?? '');
    if (!repo || !title || !head)
        return 'ต้องระบุ repo, title, head';
    const res = await fetch(`${GH_API}/repos/${repo}/pulls`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ title, head, base, body }),
    });
    if (!res.ok)
        return `GitHub error ${res.status}: ${await res.text()}`;
    const pr = (await res.json());
    return `✅ PR #${pr.number} created\n🔗 ${pr.html_url}`;
}
export async function githubListPrs(args) {
    if (!config.GITHUB_TOKEN)
        return 'github tools ไม่พร้อม — ตั้งค่า GITHUB_TOKEN ใน Railway';
    const repo = String(args.repo ?? '');
    const state = String(args.state ?? 'open');
    if (!repo)
        return 'ต้องระบุ repo';
    const res = await fetch(`${GH_API}/repos/${repo}/pulls?state=${state}&per_page=10`, { headers: headers() });
    if (!res.ok)
        return `GitHub error ${res.status}: ${await res.text()}`;
    const prs = (await res.json());
    if (!prs.length)
        return `ไม่มี PR (${state}) ใน ${repo}`;
    return `🔀 PRs ใน ${repo}:\n` + prs.map(p => `• #${p.number} ${p.title} — ${p.html_url}`).join('\n');
}
