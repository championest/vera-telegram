import { config } from '../config.js';
export async function webSearch(args) {
    const apiKey = config.TAVILY_API_KEY;
    if (!apiKey)
        return 'web_search ไม่พร้อมใช้งาน — กรุณาตั้งค่า TAVILY_API_KEY ใน Railway';
    const query = String(args.query ?? '');
    const maxResults = Number(args.max_results ?? 5);
    const searchDepth = String(args.search_depth ?? 'basic');
    const includeAnswer = args.include_answer !== false;
    if (!query)
        return 'กรุณาระบุ query ที่ต้องการค้นหา';
    const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: maxResults,
            search_depth: searchDepth,
            include_answer: includeAnswer,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        return `Tavily error ${res.status}: ${err}`;
    }
    const data = (await res.json());
    const lines = [`🔍 ค้นหา: "${data.query}"\n`];
    if (data.answer) {
        lines.push(`📝 สรุป: ${data.answer}\n`);
    }
    data.results.forEach((r, i) => {
        lines.push(`${i + 1}. **${r.title}**`);
        lines.push(`   ${r.content.slice(0, 300)}${r.content.length > 300 ? '...' : ''}`);
        lines.push(`   🔗 ${r.url}\n`);
    });
    return lines.join('\n');
}
export async function fetchUrl(args) {
    const apiKey = config.TAVILY_API_KEY;
    if (!apiKey)
        return 'fetch_url ไม่พร้อมใช้งาน — กรุณาตั้งค่า TAVILY_API_KEY ใน Railway';
    const url = String(args.url ?? '');
    if (!url)
        return 'กรุณาระบุ URL';
    // Use Tavily extract endpoint to get page content cleanly
    const res = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, urls: [url] }),
    });
    if (!res.ok) {
        const err = await res.text();
        return `Tavily extract error ${res.status}: ${err}`;
    }
    const data = (await res.json());
    const result = data.results?.[0];
    if (!result)
        return `ไม่สามารถดึงเนื้อหาจาก ${url}`;
    const content = result.raw_content.slice(0, 2000);
    return `📄 **${url}**\n\n${content}${result.raw_content.length > 2000 ? '\n\n[... เนื้อหายาวกว่านี้ ตัดให้ 2000 ตัวอักษร]' : ''}`;
}
