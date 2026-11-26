// סקריפט העדכון היומי של "הרדאר שלנו".
// פותח את האתרים בדפדפן אמיתי (Playwright), אוסף אירועים, ממזג עם הקיים ושומר ל-data/events.json
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { extractDigitel, extractBarby, extractDetail, extractLD, extractGeneric, extractRadical, extractTLV, extractCoing, findPrice } = require("./extract.cjs");
const VENUES = (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "venues.json"), "utf8")); } catch (e) { return []; } })();
const COING = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "coing-groups.json"), "utf8"));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data", "events.json");
const DAYS_AHEAD = 75;

const tz = "Asia/Jerusalem";
const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: tz });
const plusDays = (d, n) => { const [y, m, dd] = d.split("-").map(Number); const o = new Date(Date.UTC(y, m - 1, dd + n)); return o.toISOString().slice(0, 10); };
const lastDay = plusDays(todayStr, DAYS_AHEAD);
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const curM = new Date().getMonth();
const monthPages = [0, 1, 2].map((i) => `https://radartlv.co.il/${MONTHS_EN[(curM + i) % 12]}/`);

// סדר העדיפויות: קודם המקורות עצמם (עירייה, רדיקל, קולנוע יפו, סיקרט ת"א), ורק אחר כך הרדאר – כגיבוי
// לאירועים מהמקומות שאין לנו להם שליפה ישירה (בארבי, צוותא, הקאמרי וכו').
const TEST = process.env.TEST_SOURCES ? JSON.parse(fs.readFileSync(process.env.TEST_SOURCES, "utf8")).map((v) => ({ url: v.url, kind: v.kind || "auto", direct: true, opts: { forceVenue: v.name, defaultCat: v.cat, ...(v.opts || {}) }, name: v.name })) : null;
const SOURCES = TEST || (process.env.SOURCES_JSON ? JSON.parse(process.env.SOURCES_JSON) : [
  { url: "https://www.tel-aviv.gov.il/Visitors/Events/Pages/Events.aspx", kind: "tlv", direct: true },
  ...COING.map((url) => ({ url, kind: "coing", direct: true })),   // המרכזים הקהילתיים של העירייה
  { url: "https://radical.org.il/", kind: "radical", direct: true },
  { url: "https://radical.org.il/calendar/hamartef/", kind: "radical", direct: true },
  { url: "https://radical.org.il/calendar/movies/", kind: "radical", direct: true },
  { url: "https://www.jaffacinema.com/", kind: "generic", direct: true, opts: { forceVenue: "קולנוע יפו", defaultCat: "f" } },
  ...VENUES.map((v) => ({ url: v.url, kind: v.kind || "auto", direct: true, opts: { forceVenue: v.name, defaultCat: v.cat, ...(v.opts || {}) }, name: v.name })),
]);
const PRICE_LOOKUPS = 160; // כמה עמודי אירוע לבדוק בכל ריצה כדי להשלים מחירים חסרים

async function loadAll(page) {
  // גלילה עד הסוף + לחיצה על כפתורי "עוד" (רק כפתורים שלא מעבירים לעמוד אחר)
  const start = page.url();
  let lastH = 0;
  for (let i = 0; i < 25; i++) {
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button, a:not([href]), a[href='#'], a[href^='javascript']")].find((x) => /^(הצג|טען|ראו|עוד)\s*(עוד|אירועים|את כל)?/.test((x.innerText || "").trim()) && (x.innerText || "").trim().length < 25 && x.offsetParent);
      if (b) { b.click(); return true; } return false;
    }).catch(() => false);
    await page.waitForTimeout(clicked ? 1200 : 400);
    if (page.url() !== start) { await page.goto(start, { waitUntil: "domcontentloaded" }).catch(() => {}); break; }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
    await page.waitForTimeout(700);
    const h = await page.evaluate(() => document.body.scrollHeight).catch(() => lastH);
    if (h === lastH && !clicked) break;
    lastH = h;
  }
}

function inKidsRange(age) {
  if (!age) return true;
  const m = String(age).match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (!m) return true;
  return +m[1] <= 7 && +m[2] >= 4;
}
const norm = (s) => String(s || "").replace(/[\"'״׳“”:\-–—.,!?()]/g, "").replace(/^(תיאטרון|התיאטרון)\s+\S+\s*/, "").replace(/\s+/g, " ").trim();
const isOwn = (u) => !/radartlv\.co\.il/.test(u || "");
const better = (a, b) => {
  // מחזיר את האירוע העדיף מבין שני כפילים
  const sc = (x) => [x.src === "direct" ? 1 : 0, x.dg ? 1 : 0, x.pr !== null && x.pr !== undefined ? 1 : 0, isOwn(x.u) ? 1 : 0, -(x.pr ?? 999)];
  const A = sc(a), B = sc(b);
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) return A[i] > B[i] ? a : b;
  return (a.ti || "").length >= (b.ti || "").length ? a : b;
};

async function main() {
  const old = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, "utf8")) : { days: {} };
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] } : {});
  const ctx = await browser.newContext({ locale: "he-IL", timezoneId: tz, userAgent: "Mozilla/5.0 (personal events digest; radar-shelanu)" });
  const found = [];
  const report = {};
  for (const s of SOURCES) {
    const page = await ctx.newPage();
    try {
      await page.goto(s.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      let evs = [];
      if (!["tlv", "coing", "digitel"].includes(s.kind)) await loadAll(page);
      if (s.kind === "digitel") evs = await page.evaluate(`(${extractDigitel.toString()})()`);
      else if (s.kind === "barby") evs = await page.evaluate(`(${extractBarby.toString()})()`);
      else
      if (s.kind === "coing") { await page.waitForTimeout(2500); evs = (await page.evaluate(`(${extractCoing.toString()})()`)).events; }
      else if (s.kind === "tlv") evs = await page.evaluate(`(${extractTLV.toString()})()`);
      else if (s.kind === "auto" || s.kind === "ld") {
        evs = await page.evaluate(`(${extractLD.toString()})(${JSON.stringify(s.opts || {})})`);
        if (!evs.length && s.kind === "auto") evs = await page.evaluate(`(${extractGeneric.toString()})(${JSON.stringify(s.opts || {})})`);
      }
      else if (s.kind === "crawl") {
        // דף רשימה → נכנסים לכל עמוד אירוע ומוציאים ממנו תאריכים, מחיר ותמונה
        const re = new RegExp(s.opts.link);
        const links = [...new Set((await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href.split("#")[0]))).filter((h) => re.test(h)))].slice(0, s.opts.max || 30);
        const queue = [...links];
        await Promise.all([0, 1, 2].map(async () => {
          while (queue.length) {
            const u = queue.shift(); const dp = await ctx.newPage();
            try {
              await dp.route(/\.(png|jpe?g|webp|gif|woff2?|mp4)(\?|$)/i, (r) => r.abort());
              await dp.goto(u, { waitUntil: "domcontentloaded", timeout: 30000 });
              await dp.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
              const r = await dp.evaluate(`(${extractDetail.toString()})(${JSON.stringify(s.opts)})`);
              const blob = r.ti + " " + (r.ds || "");
              let c = s.opts.defaultCat || "c";
              if (/הקרנ|סרט|קולנוע|film/i.test(blob) && c !== "t") c = "f";
              if (/סדנ|workshop/i.test(r.ti)) c = "w";
              if (/ילדים|לכל המשפחה|הצגת ילדים|kids/i.test(blob)) c = "k";
              for (const x of r.dates) evs.push({ d: x.d, t: x.t, ti: r.ti, ve: s.opts.forceVenue || "", pr: r.pr, or: null, c, dg: false, u, age: null, mem: null, ds: r.ds, img: r.img });
            } catch (e) {} finally { await dp.close(); }
          }
        }));
      }
      else if (s.kind === "radical") evs = await page.evaluate(`(${extractRadical.toString()})()`);
      else evs = await page.evaluate(`(${extractGeneric.toString()})(${JSON.stringify(s.opts || {})})`);
      report[s.url] = evs.length;
      found.push(...evs.map((e) => ({ ...e, _src: s.kind, src: s.direct ? "direct" : "radar" })));
    } catch (e) {
      report[s.url] = "error: " + e.message.slice(0, 80);
    } finally { await page.close(); }
  }
  console.log(JSON.stringify(report, null, 1));
  if (TEST) {
    const by = {}; found.forEach((e) => { (by[e.ve] = by[e.ve] || []).push(e); });
    let o = JSON.stringify(report, null, 1) + "\n";
    for (const [v, arr] of Object.entries(by)) o += `\n## ${v} (${arr.length})\n` + arr.slice(0, 6).map((e) => [e.d, e.t, e.ti, e.pr, e.c, e.img ? "img" : "-", e.u.slice(0, 70)].join(" | ")).join("\n");
    fs.mkdirSync("debug", { recursive: true }); fs.writeFileSync("debug/probe.txt", o); await browser.close(); return;
  }

  const radarCount = found.filter((e) => e._src === "radar").length;
  // ניקוי
  const clean = found.filter((e) => e.d >= todayStr && e.d <= lastDay && e.c !== "b" && e.c !== "o" && e.ti && e.t)
    .filter((e) => e.c !== "k" || inKidsRange(e.age))
    .map(({ _src, ...e }) => ({ ...e, pr: e.pr ?? null, or: e.or ?? null, age: e.age ?? null, mem: e.mem ?? null }));

  // מיזוג עם הקיים (לא מוחקים מידע – רק מוסיפים ומעדכנים), ומוחקים ימים שעברו
  const days = {};
  // שומרים מהנתונים הקודמים רק אירועים ממקורות ישירים (לא מהרדאר / סיקרט ת"א)
  for (const [d, arr] of Object.entries(old.days || {})) if (d >= todayStr) days[d] = arr.filter((x) => x.src === "direct" && !/radartlv|secrettelaviv/.test(x.u || ""));
  for (const e of clean) {
    const { d, ...o } = e;
    const arr = (days[d] = days[d] || []);
    const i = arr.findIndex((x) => x.t === o.t && (x.u === o.u || norm(x.ti) === norm(o.ti) || (norm(x.ti).includes(norm(o.ti)) && norm(o.ti).length > 5) || (norm(o.ti).includes(norm(x.ti)) && norm(x.ti).length > 5)));
    if (i < 0) { arr.push(o); continue; }
    const keep = better(o, arr[i]);
    const other = keep === o ? arr[i] : o;
    arr[i] = { ...keep, ve: keep.src === "direct" && /\d$/.test(keep.ve || "") && other.ve && !/\d$/.test(other.ve) ? other.ve : keep.ve, pr: keep.pr ?? other.pr ?? null, dg: keep.dg || other.dg, ds: keep.ds || other.ds || null, lg: keep.lg || other.lg, dur: keep.dur || other.dur, mem: keep.mem || other.mem || null, age: keep.age || other.age || null, img: keep.img || other.img || null };
  }
  for (const d of Object.keys(days)) days[d].sort((a, b) => a.t.localeCompare(b.t));

  // השלמת מחירים: נכנסים לעמוד של אירועים בלי מחיר (הקרובים קודם) ומחפשים ₪ / "כניסה חופשית"
  let looked = 0, filled = 0;
  const todayN = Date.now();
  const missing = Object.keys(days).sort().flatMap((d) => days[d].filter((e) => (e.pr === null || e.pr === undefined) && e.u && (!e._pl || todayN - e._pl > 4 * 864e5)));
  const lookup = async (e) => {
    const page = await ctx.newPage();
    try {
      let url = e.u;
      for (let hop = 0; hop < 2 && url; hop++) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(1500);
        const r = await page.evaluate(`(${findPrice.toString()})()`);
        if (!e.img && r.img && hop === 0) e.img = r.img;
        if (r.pr !== null && r.pr !== undefined) { e.pr = r.pr; filled++; break; }
        url = r.next;
      }
      looked++;
    } catch (err) { /* דילוג */ } finally { e._pl = todayN; await page.close(); }
  };
  const queue = missing.slice(0, PRICE_LOOKUPS);
  await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length) await lookup(queue.shift()); }));
  // תמונות: לאירועים בלי תמונה – og:image מעמוד האירוע (עד 250 בכל ריצה, 6 במקביל)
  let imgDone = 0;
  const noImg = Object.keys(days).sort().flatMap((d) => days[d].filter((e) => !e.img && e.u && !e._im)).slice(0, 250);
  const imgLook = async (e) => {
    const page = await ctx.newPage();
    try {
      await page.route(/\.(png|jpe?g|webp|gif|css|woff2?|mp4)(\?|$)/i, (r) => r.abort());
      await page.goto(e.u, { waitUntil: "domcontentloaded", timeout: 20000 });
      const s = await page.evaluate(() => { const m = document.querySelector('meta[property="og:image"],meta[name="twitter:image"]'); const v = m && m.content; return v && !/logo|icon|default/i.test(v) ? new URL(v, location.href).href : null; });
      if (s) { e.img = s; imgDone++; }
    } catch (err) {} finally { e._im = 1; await page.close(); }
  };
  await Promise.all([0, 1, 2, 3, 4, 5].map(async () => { while (noImg.length) await imgLook(noImg.shift()); }));
  report.images = imgDone;
  report.priceLookups = `${filled}/${looked}`;
  await browser.close();

  const total = Object.values(days).reduce((n, a) => n + a.length, 0);
  if (found.length < 30) console.warn(`אזהרה: נאספו רק ${found.length} אירועים – ייתכן שמבנה האתר השתנה. הנתונים הקיימים נשמרו.`);
  const updated = new Date().toLocaleString("he-IL", { timeZone: tz, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "").replace(/\.(?=\d{2}:)/, " ");
  const outObj = { updated: found.length >= 30 ? updated : (old.updated || updated), count: total, report, days: Object.fromEntries(Object.keys(days).sort().map((d) => [d, days[d]])) };
  fs.writeFileSync(DATA, JSON.stringify(outObj));
  console.log(`נשמרו ${total} אירועים ב-${Object.keys(days).length} ימים (חדשים מהיום: ${clean.length}).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
