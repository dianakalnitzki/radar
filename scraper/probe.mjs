// בדיקת מבנה של אתר חדש: שומר טקסט, קישורים ותבנית כרטיסים ל-debug/
import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";
const { extractCoing } = createRequire(import.meta.url)("./extract.cjs");
const EXTRACT = (process.env.PROBE_URLS || "").startsWith("coing:");
const MULTI = (process.env.PROBE_URLS || "").startsWith("multi:");
const X = createRequire(import.meta.url)("./extract.cjs");
const urls = (process.env.PROBE_URLS || "https://coing.co/").replace(/^(coing|multi):/, "").split(",");
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
    if (MULTI) {
      const ld = await p.evaluate(() => { const r = []; for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { const w = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(w); const ty = [].concat(o["@type"] || []).join(","); if (/Event/.test(ty)) r.push((o.name || "") + " @" + (o.startDate || "") + " $" + JSON.stringify(o.offers && (o.offers.price ?? o.offers.lowPrice ?? (o.offers[0] && o.offers[0].price)))); Object.values(o).forEach(w); }; w(JSON.parse(s.textContent)); } catch (e) {} } return r; });
      let gen = []; try { gen = await p.evaluate(`(${X.extractGeneric.toString()})({})`); } catch (e) { gen = [{ ti: "ERR " + e.message }]; }
      const ang = await p.evaluate(() => { try { const el = document.querySelector('[ng-controller]'); const sc = el && window.angular && window.angular.element(el).scope(); const findItems = (s) => { for (const k in s) { if (k[0] === "$") continue; const v = s[k]; if (v && v.items && v.items.length) return v.items; } return null; }; let it = null; document.querySelectorAll('[ng-controller]').forEach((e) => { if (!it) it = findItems(window.angular.element(e).scope()); }); if (!it) return null; const L = {}; it.forEach((x) => { const k = (x.ListID && x.ListID.Value) || "?"; L[k] = (L[k] || 0) + 1; }); return { n: it.length, L, s: it.slice(0, 3).map((x) => (x.Title && x.Title.Value) + " | " + (x.TlvStartDate && x.TlvStartDate.Value) + " | " + (x.TlvPaymentCost && x.TlvPaymentCost.Value) + " | " + (x.TlvBenefitDescription && x.TlvBenefitDescription.Value || "").slice(0, 80)) }; } catch (e) { return "angErr " + e.message; } });
      const links = await p.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => /digitel|benefit|הטב|event|אירוע|calendar|show|performance/i.test(h)))].slice(0, 25));
      out += `\n\n===== ${u}\nfinal: ${p.url()} | title: ${await p.title()}\nLD events: ${ld.length}\n  ${ld.slice(0, 4).join("\n  ")}\nGENERIC: ${gen.length}\n  ${gen.slice(0, 4).map((e) => [e.d, e.t, e.ti, e.pr, e.ve].join(" | ")).join("\n  ")}\nANGULAR: ${JSON.stringify(ang)}\nLINKS:\n  ${links.join("\n  ")}`;
      await p.close(); continue;
    }
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
