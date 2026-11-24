// בדיקת מבנה של אתר חדש: שומר טקסט, קישורים ותבנית כרטיסים ל-debug/
import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";
const { extractCoing } = createRequire(import.meta.url)("./extract.cjs");
const EXTRACT = (process.env.PROBE_URLS || "").startsWith("coing:");
const urls = (process.env.PROBE_URLS || "https://coing.co/").replace(/^coing:/, "").split(",");
const b = await chromium.launch();
const ctx = await b.newContext({ locale: "he-IL", timezoneId: "Asia/Jerusalem" });
let out = "";
for (const u of urls) {
  const p = await ctx.newPage();
  try {
    await p.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
    await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    const reqs = [];
    p.on("response", (r) => { const ct = r.headers()["content-type"] || ""; if (/json/.test(ct)) reqs.push(r.url()); });
    await p.waitForTimeout(8000);
    for (let i = 0; i < 6; i++) { await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(800); }
    if (EXTRACT) { const r = await p.evaluate(`(${extractCoing.toString()})()`); out += `\n\n===== ${u}\n${r.events.length} events\n` + r.events.map((e) => JSON.stringify(e)).join("\n"); await p.close(); continue; }
    const info = await p.evaluate(() => {
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.href);
      const pat = {}; links.forEach((h) => { const k = h.replace(/[?#].*/, "").split("/").slice(0, 4).join("/"); pat[k] = (pat[k] || 0) + 1; });
      const xhr = performance.getEntriesByType("resource").filter((r) => /api|json|graphql|events/i.test(r.name)).map((r) => r.name).slice(0, 40);
      const sample = [...document.querySelectorAll("a[href]")].filter((a) => a.innerText.length > 25).slice(0, 12).map((a) => a.href + "\n   " + a.innerText.replace(/\s*\n\s*/g, " | ").slice(0, 220));
      const html = document.documentElement.outerHTML.replace(/<style[\s\S]*?<\/style>/g, "").slice(0, 4000);
      return { html, url: location.href, title: document.title, text: document.body.innerText.slice(0, 5000), pat: Object.entries(pat).sort((a, b) => b[1] - a[1]).slice(0, 30), xhr, sample };
    });
    out += `\n\n===== ${u}\n${JSON.stringify({ ...info, text: undefined, html: undefined, json: reqs.slice(0, 40) }, null, 1)}\n--- TEXT\n${info.text}\n--- HTML\n${info.html}`;
  } catch (e) { out += `\n\n===== ${u}\nERROR ${e.message}`; }
  await p.close();
}
await b.close();
fs.mkdirSync("debug", { recursive: true });
fs.writeFileSync("debug/probe.txt", out);
