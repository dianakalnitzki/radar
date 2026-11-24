// מוצא את כל עמודי Coing של המרכזים הקהילתיים: עובר על עמודי המרכזים באתר העירייה ואוסף קישורים ל-coing.co
import { chromium } from "playwright";
import fs from "node:fs";
const b = await chromium.launch();
const ctx = await b.newContext({ locale: "he-IL" });
const p = await ctx.newPage();
const found = new Set(), centers = new Set();
const grab = async () => (await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.href))).forEach((h) => {
  if (/coing\.co\/[A-Za-z]/.test(h)) found.add(h.replace(/^https?:\/\/(www\.)?coing\.co\//, "https://www.coing.co/").replace(/[?#].*/, "").split("/").slice(0, 4).join("/"));
  if (/\/Residents\/CommunityAndSports\/Pages\/[^/]+\.aspx/i.test(h) && !/default\.aspx/i.test(h)) centers.add(h.replace(/[?#].*/, ""));
});
for (const u of ["https://www.tel-aviv.gov.il/Residents/CommunityAndSports/Pages/default.aspx", "https://www.tel-aviv.gov.il/Residents/CommunityAndSports/Pages/CommunityCenters.aspx"]) {
  try { await p.goto(u, { waitUntil: "domcontentloaded", timeout: 40000 }); await p.waitForTimeout(4000); await grab(); } catch (e) {}
}
for (const c of [...centers].slice(0, 120)) {
  try { await p.goto(c, { waitUntil: "domcontentloaded", timeout: 30000 }); await p.waitForTimeout(2500); await grab(); } catch (e) {}
}
// גם מעמודי Coing עצמם: קישורים לעמודים אחים
const seeds = ["https://www.coing.co/TLV_NeveOfer", "https://www.coing.co/TLV_TelBaruch_events", "https://www.coing.co/Kehila-NorthEast", "https://www.coing.co/TLV_Social_Services_Health_Pockets"];
seeds.forEach((s) => found.add(s));
for (const s of [...found].slice(0, 80)) {
  try { await p.goto(s, { waitUntil: "domcontentloaded", timeout: 30000 }); await p.waitForTimeout(2500); await grab(); } catch (e) {}
}
await b.close();
const groups = [...found].filter((u) => u.split("/").length === 4).sort();
fs.mkdirSync("debug", { recursive: true });
fs.writeFileSync("debug/probe.txt", `centers: ${centers.size}\n${[...centers].join("\n")}\n\ncoing groups: ${groups.length}\n${groups.join("\n")}`);
