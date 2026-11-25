// פונקציות חילוץ שרצות בתוך הדפדפן (page.evaluate).
// הן לא תלויות במבנה HTML מסוים: מחפשות כותרות עם קישור, שעה ומחיר בטקסט של כל כרטיס.

/* eslint-disable no-undef */
function extractGeneric(opts) {
  const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
  const now = new Date();
  const curY = now.getFullYear();
  const pad = (n) => String(n).padStart(2, "0");
  const mkDate = (d, m, y) => {
    let yy = y || curY;
    if (!y) {
      // תאריך בלי שנה: אם עבר לפני יותר מחודשיים – כנראה השנה הבאה
      const cand = new Date(yy, m - 1, d);
      if (cand < new Date(now.getFullYear(), now.getMonth() - 2, 1)) yy++;
    }
    return `${yy}-${pad(m)}-${pad(d)}`;
  };
  const findDate = (txt) => {
    if (!txt) return null;
    let m = txt.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (m) {
      const d = +m[1], mo = +m[2];
      let y = m[3] ? +m[3] : null;
      if (y && y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return mkDate(d, mo, y);
    }
    m = txt.match(new RegExp("(\\d{1,2})\\s*ב?(" + HEB_MONTHS.join("|") + ")(?:\\s+(\\d{4}))?"));
    if (m) return mkDate(+m[1], HEB_MONTHS.indexOf(m[2]) + 1, m[3] ? +m[3] : null);
    return null;
  };
  const TIME = /(?:^|[^\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/;
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

  // 1. כל הכותרות שיש בהן קישור = מועמדות לכרטיס אירוע
  const heads = [...document.querySelectorAll("h2 a[href], h3 a[href], h4 a[href], a[href] h2, a[href] h3, a[href] h4")]
    .map((el) => (el.tagName === "A" ? el : el.closest("a")))
    .filter((a, i, arr) => a && arr.indexOf(a) === i);
  const headSet = new Set(heads.map((a) => a.closest("h2,h3,h4") || a));

  const cardOf = (a) => {
    let el = a.closest("h2,h3,h4") || a;
    let best = el;
    while (el.parentElement && el.parentElement !== document.body) {
      const p = el.parentElement;
      const hs = [...p.querySelectorAll("h2,h3,h4")].filter((h) => headSet.has(h) || h.querySelector("a[href]"));
      if (hs.length > 1) break;
      best = p;
      el = p;
      if (TIME.test(p.innerText) && /₪|חינם|מחיר/.test(p.innerText)) break;
    }
    return best;
  };

  // 2. מעבר לפי סדר המסמך כדי לשייך כל כרטיס לכותרת התאריך שלפניו
  const out = [];
  let curDate = opts.defaultDate || null;
  const dateHeads = [...document.querySelectorAll("h1,h2,h3,[class*=date],[class*=day]")]
    .filter((h) => !h.querySelector("a[href]") && findDate(h.innerText) && h.innerText.length < 60);
  const all = [...dateHeads.map((h) => ({ type: "date", el: h })), ...heads.map((a) => ({ type: "ev", el: a }))];
  all.sort((x, y) => (x.el.compareDocumentPosition(y.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

  for (const it of all) {
    if (it.type === "date") { curDate = findDate(it.el.innerText) || curDate; continue; }
    const a = it.el;
    const card = cardOf(a);
    const text = card.innerText || "";
    const lines = text.split("\n").map(clean).filter(Boolean);
    const title = clean((a.closest("h2,h3,h4") || a).innerText);
    if (!title || title.length < 2) continue;
    const tm = text.match(TIME);
    const ownDate = findDate(lines.find((l) => /\d{1,2}[./]\d{1,2}/.test(l) && l.length < 40) || "");
    const d = ownDate || curDate;
    if (!d || !tm) continue;
    const t = `${pad(+tm[1])}:${tm[2]}`;
    // מחירים
    const nums = [...text.matchAll(/(?:₪\s?(\d{1,4}(?:\.\d+)?)|(\d{1,4}(?:\.\d+)?)\s?₪)/g)].map((m) => Math.round(+(m[1] || m[2])));
    let pr = nums.length ? nums[0] : null, or = null;
    const instead = text.match(/במקום\s*₪?\s?(\d{1,4})/);
    if (instead) { or = +instead[1]; if (nums.length && nums[0] === or && nums[1] != null) pr = nums[1]; }
    const freeAll = /(^|\s)(חינם|כניסה חופשית|ללא תשלום)(\s|$)/.test(text) && !/חינם לחברי/.test(text);
    if (freeAll && pr === null) pr = 0;
    const dg = /דיגיתל/.test(text);
    let mem = null;
    if (/חינם לחברי/.test(text)) mem = "free"; else if (/הנחה לחברי|לחברי רדיקל/.test(text)) mem = "disc";
    // קטגוריה
    const tag = lines.slice(0, 6).join(" ") + " " + title;
    let c = opts.defaultCat || "c";
    if (/פעוטות|תינוקות|זחילה|לידה עד/.test(tag)) c = "b";
    else if (/גיל הזהב|ותיקים|אזרח הותיק/.test(tag)) c = "o";
    else if (/ילדים|משפחה|לכל המשפחה|לילדים|הצגת ילדים/.test(tag)) c = "k";
    else if (/סטנד ?אפ|stand ?up|במה פתוחה/i.test(tag)) c = "s";
    else if (/מסיבה|רייב|party|DJ/i.test(tag)) c = "p";
    else if (/הופעה|קונצרט|ג'אז|להקה|concert/i.test(tag)) c = "m";
    else if (/הצגה|תיאטרון|מחזמר|מחול|מופע/.test(tag)) c = "t";
    else if (/הקרנ|סרט|קולנוע|סינמה|טרום בכורה|screening|film/i.test(tag)) c = "f";
    else if (/תרבות|הרצאה|סיור|תערוכה/.test(tag)) c = "c";
    const age = (text.match(/גיל(?:אי|י)?\s*(\d{1,2}\s*[-–]\s*\d{1,2})/) || [])[1] || null;
    // מקום: שורה קצרה אחרי הכותרת שאינה שעה/מחיר/תגית
    const ti = lines.indexOf(title);
    const after = lines.slice(ti >= 0 ? ti + 1 : 0);
    const isMeta = (l) => TIME.test(l) || /₪|Google|Apple|Outlook|ליומן|כרטיסים|דיגיתל|^חינם|^הטבת|מקור|^\(|https?:/.test(l);
    const veLine = after.find((l) => !isMeta(l) && l.length < 80) || opts.defaultVenue || "";
    const ve = clean(veLine.split("·")[0]);
    const ds = after.filter((l) => !isMeta(l) && l !== veLine && l !== ve && !/·/.test(l) && l.length >= 30 && l.length <= 260)[0] || null;
    out.push({ d, t, ti: title, ve: opts.forceVenue || ve, pr, or: or && pr !== null && or > pr ? or : null, c, dg, u: a.href, age, mem, ds });
  }
  return out;
}

// בית רדיקל: כל אירוע הוא קישור /product/ עם "כותרת / יום X, DD/MM / HH:MM".
// מחיר ומנוי לא מופיעים ברשימה, אז נכנסים לעמוד של כל אירוע ("חינם לחברי רדיקל" / "מחיר לחברים").
async function extractRadical() {
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const seen = new Set(), cards = [];
  for (const a of document.querySelectorAll('a[href*="/product/"]')) {
    const txt = (a.innerText || "").trim();
    const dm = txt.match(/(\d{1,2})\/(\d{1,2})/);
    if (!dm) continue;
    const tm = txt.match(/([01]?\d|2[0-3]):([0-5]\d)/);
    let y = now.getFullYear();
    if (new Date(y, +dm[2] - 1, +dm[1]) < new Date(y, now.getMonth() - 2, 1)) y++;
    const d = `${y}-${pad(+dm[2])}-${pad(+dm[1])}`;
    const title = txt.split("\n").map((s) => s.trim()).find((l) => l && !/\d{1,2}\/\d{1,2}|^\d{1,2}:\d{2}$/.test(l)) || "";
    if (!title || seen.has(a.href + d)) continue;
    seen.add(a.href + d);
    cards.push({ d, t: tm ? `${pad(+tm[1])}:${tm[2]}` : "20:00", ti: title, u: a.href });
  }
  const out = [];
  for (const c of cards.slice(0, 60)) {
    let mem = null, pr = null, ds = null, t = c.t;
    try {
      const html = await fetch(c.u).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("style,script,header,footer").forEach((x) => x.remove());
      const s = (doc.querySelector("main") || doc.body).textContent.replace(/\s+/g, " ");
      const k = s.indexOf(c.ti);
      const zone = k >= 0 ? s.slice(k, k + 1200) : s;
      if (/חינם לחברי/.test(zone)) mem = "free"; else if (/מחיר לחברים|הנחה לחברי/.test(zone)) mem = "disc";
      const tk = zone.match(/התחלה:\s*(\d{1,2}:\d{2})\s*₪\s?(\d{1,4})/);
      if (tk) { t = tk[1].padStart(5, "0"); pr = +tk[2]; }
      else { const m = zone.match(/₪\s?([1-9]\d{0,3})/); if (m) pr = +m[1]; else if (/חינם|כניסה חופשית/.test(zone)) pr = 0; }
      const og = doc.querySelector('meta[property="og:description"],meta[name="description"]');
      ds = og ? og.content.slice(0, 220) : null;
    } catch (e) {}
    const blob = c.ti + " " + (ds || "") + " " + location.href;
    let cat = "c";
    if (/movies|קולנוע|סרט|הקרנ/.test(blob)) cat = "f";
    else if (/hamartef|מרתף|הופעה|לייב|להקה|ג'אז|קונצרט/.test(blob)) cat = "m";
    if (/מסיבה|רייב|קרנבל|DJ/i.test(blob)) cat = "p";
    if (/סטנד/.test(blob)) cat = "s";
    if (/בוק קלאב|מועדון קריאה|סאונה/.test(c.ti)) cat = "c";
    out.push({ d: c.d, t, ti: c.ti, ve: /hamartef/.test(location.href) ? "בית רדיקל – המרתף" : "בית רדיקל", pr, or: null, c: cat, dg: false, u: c.u, age: null, mem, ds });
  }
  return out;
}

// אתר עיריית תל אביב: הדף Events.aspx טוען את כל האירועים (כ־1,100) לתוך אובייקט Angular בשם eab.items.
// קוראים משם ישירות – כולל מחיר (TlvPaymentCost), האם בתשלום, הטבת דיגיתל וקהל יעד.
async function extractTLV() {
  const BASE = "https://www.tel-aviv.gov.il/Pages/MainItemPage.aspx?WebID=";
  let items = null;
  for (let i = 0; i < 40 && !items; i++) {
    try {
      const el = document.querySelector('[ng-controller*="eabCtrl"]');
      const sc = el && window.angular ? window.angular.element(el).scope() : null;
      const it = sc && sc.eab && sc.eab.items;
      if (it && it.length) items = it;
    } catch (e) {}
    if (!items) await new Promise((r) => setTimeout(r, 500));
  }
  if (!items) return [];
  const v = (x, k) => String((x[k] && x[k].Value) || "").replace(/&amp;(amp;)*/g, "&").replace(/&#39;|&;?39;/g, "'").replace(/\s+/g, " ").trim();
  const pd = (s) => { const m = s.match(/(\d\d)\.(\d\d)\.(\d\d), (\d\d:\d\d)/); return m ? ["20" + m[3] + "-" + m[2] + "-" + m[1], m[4]] : null; };
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  const out = [];
  for (const x of items) {
    const a = pd(v(x, "TlvStartDate")), b = pd(v(x, "TlvEndDate"));
    if (!a) continue;
    const ti = v(x, "Title"), ad = v(x, "TlvAddress1"), req = v(x, "TlvPaymentRequired"), cost = v(x, "TlvPaymentCost");
    const ints = v(x, "TlvFieldsOfInterests"), sum = v(x, "TlvSummary");
    const span = b ? (new Date(b[0]) - new Date(a[0])) / 864e5 : 0;
    if (b && b[0] < today) continue;
    if (span > 14) continue;                                   // תערוכות קבע וחוגים ארוכים
    if (/בוטל|מבוטל|הרשמה נסגרה|קול קורא/.test(ti)) continue;
    if (/מפגש מקוון|זום/.test(ad + " " + ti)) continue;
    const A = v(x, "TlvAudienceId").split(";");
    const kids = A.some((k) => ["1", "15", "16", "17"].includes(k));
    const adult = A.some((k) => ["3", "5", "18"].includes(k));
    if (!kids && !adult) continue;                             // רק טף/ותיקים/נוער
    if (/ספורט ובריאות/.test(ints) && !/מחול|אירועי חוצות|קהילות|תאטרון|מופעים/.test(ints)) continue;
    if (/^(חינוך והורות[^;]*;?)+$/.test(ints) && !kids) continue;
    const isWork = /סדנ|workshop/i.test(ti);
    if (/קורס|השתלמות|פילאטיס|יוגה|אימון|לרקדנים|בלט קלאסי|פלור בר|קבוצת ריצה/.test(ti)) continue;
    if (!isWork && /קבוצת |חוג |סדרת מפגשים|שיעור /.test(ti + " " + sum.slice(0, 80))) continue;
    // מחיר
    const nums = (cost.match(/\d+/g) || []).map(Number).filter((n) => n < 2000);
    let pr = null;
    if (/^לא בתשלום/.test(req) || /ללא (תשלום|עלות)|כניסה חופשית|הכניסה חופשית|^חינם/.test(cost)) pr = 0;
    else if (nums.length) pr = Math.min(...nums);
    if (pr !== null && pr > 200) continue;
    // קטגוריה
    let c = "c";
    if (kids && !adult) c = "k";
    else if (/וקולנוע\s+קולנוע/.test(ints) || /הקרנ|סרט|סינמה|קולנוע/.test(ti)) c = "f";
    else if (/וקולנוע\s+תאטרון|\)\s+מחול/.test(ints) || /הצגה|מחול/.test(ti)) c = "t";
    else if (/מוזיקה/.test(ints) || /הופעה|קונצרט|מופע/.test(ti)) c = "m";
    else if (/מסיבה|הרקדה/.test(ti)) c = "p";
    else if (/סטנדאפ|סטנד אפ/.test(ti)) c = "s";
    if (isWork && c !== "k") c = "w";
    if (kids && adult && /שעת סיפור|לילדים|לכל המשפחה|הצגת ילדים/.test(ti + " " + sum)) c = "k";
    const ageM = (sum + " " + ti).match(/(?:לגילי|גילאי|לגיל|גיל)\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/);
    const age = ageM ? (Math.min(+ageM[1], +ageM[2]) + "–" + Math.max(+ageM[1], +ageM[2])) : ((sum.match(/מגיל \d{1,2}/) || [])[0] || null);
    const d = a[0] < today ? today : a[0];
    out.push({
      d, t: a[1] === "00:00" ? "10:00" : a[1], ti, ve: ad.replace(/ 1$/, "") || "תל אביב־יפו", pr, or: null, c,
      dg: v(x, "TlvIsBenefit") === "True", u: BASE + v(x, "WebID") + "&ListID=" + v(x, "ListID") + "&ItemID=" + v(x, "ListItemID"),
      age, mem: null, ds: sum.slice(0, 220) || null, org: "עיריית תל אביב־יפו", end: b && b[0] !== a[0] ? b[0] : null,
    });
  }
  return out;
}

// Coing: עמודי האירועים של המרכזים הקהילתיים של העירייה (www.coing.co/TLV_...).
// כל אירוע הוא קישור /שם-הקהילה/מספר; בכרטיס: מארגן, כותרת, תגיות, כתובת, DD/MM/YYYY, שעות, מחיר.
function extractCoing() {
  const pad = (n) => String(n).padStart(2, "0");
  const out = [], seen = new Set();
  const groups = [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href.replace(/[?#].*/, ""))
    .filter((h) => /^https:\/\/www\.coing\.co\/[A-Za-z][\w-]+$/.test(h)))];
  const orgName = (document.title || "").trim();
  for (const a of document.querySelectorAll('a[href*="coing.co/"]')) {
    if (!/coing\.co\/[\w-]+\/\d+/.test(a.href)) continue;
    let el = a;
    for (let i = 0; i < 5 && el.parentElement && !/\d{2}\/\d{2}\/\d{4}/.test(el.innerText); i++) el = el.parentElement;
    const text = el.innerText || "";
    const dm = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!dm || /אירוע שחלף|בוטל/.test(text)) continue;
    const d = `${dm[3]}-${dm[2]}-${dm[1]}`;
    const tm = text.match(/(\d{1,2}):(\d{2})/);
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    const isMeta = (l) => /\d{2}\/\d{2}\/\d{4}|^\d{1,2}:\d{2}|ש"ח|ש״ח|₪|בתשלום|^רחוב |^\d+$/.test(l);
    const cand = lines.filter((l) => !isMeta(l));
    const title = (cand.length > 1 ? cand[1] : cand[0]) || "";
    if (!title || seen.has(a.href)) continue;
    seen.add(a.href);
    const addr = lines.find((l) => /^רחוב |^דרך |^שדרות |, \d+$/.test(l)) || "";
    const prm = text.match(/(\d{1,4})\s*ש["״]ח/);
    let pr = prm ? +prm[1] : /בתשלום/.test(text) ? null : 0;
    if (pr !== null && pr > 200) continue;
    const blob = title + " " + text;
    let c = "c";
    if (/הצגה|שעת סיפור|לילדים|ילדים|בספרייה|גיל הרך|הורים וילדים|הורה וילד|להורה|משפחה|ג.ימבורי/.test(blob) && !/18\+|למבוגרים/.test(blob)) c = "k";
    else if (/סדנ|workshop/i.test(title)) c = "w";
    else if (/הקרנ|סרט|קולנוע/.test(title)) c = "f";
    else if (/הופעה|קונצרט|ג'אם|מוזיק/.test(title)) c = "m";
    else if (/מסיבה|הרקדה/.test(title)) c = "p";
    else if (/הצגה|תיאטרון/.test(title)) c = "t";
    if (/פילאטיס|יוגה|אימון|ספורט לנשים|לימודי שחייה|חל"ד|לידה|תינוק/.test(title)) continue;
    out.push({ d, t: tm ? `${pad(+tm[1])}:${tm[2]}` : "17:00", ti: title, ve: (cand[0] && cand[0] !== title ? cand[0] : orgName) + (addr ? " · " + addr.replace(/^רחוב /, "") : ""),
      pr, or: null, c, dg: false, u: a.href, age: null, mem: null, ds: null, org: orgName });
  }
  return { events: out, groups };
}

// השלמת מחיר מעמוד האירוע עצמו (לאירועים שהגיעו בלי מחיר)
function findPrice() {
  // 1) נתונים מובנים (JSON-LD / itemprop) – הכי אמין
  const ld = [];
  for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const walk = (o) => { if (!o || typeof o !== "object") return; if (o.price !== undefined || o.lowPrice !== undefined) ld.push(+(o.lowPrice ?? o.price)); Object.values(o).forEach(walk); }; walk(JSON.parse(sc.textContent)); } catch (e) {}
  }
  document.querySelectorAll('[itemprop="price"],[itemprop="lowPrice"]').forEach((m) => ld.push(+(m.getAttribute("content") || m.textContent.replace(/[^\d.]/g, ""))));
  const okLd = ld.filter((n) => !isNaN(n) && n >= 0 && n <= 600);
  if (okLd.length) return { pr: Math.min(...okLd) };
  // 2) טקסט העמוד
  const txt = (document.body.innerText || "").replace(/\s+/g, " ");
  if (/כניסה חופשית|הכניסה חופשית|ללא תשלום|ללא עלות|free entry|כניסה חינם|האירוע חינמי|אירוע חינמי/i.test(txt) && !/חינם לחברי/.test(txt)) return { pr: 0 };
  const nums = [...txt.matchAll(/(?:₪\s?(\d{2,4})|(\d{2,4})(?:\.00)?\s?(?:₪|ש"ח|ש״ח|שח\b|NIS|ILS))/g)].map((m) => +(m[1] || m[2])).filter((n) => n >= 10 && n <= 600);
  if (nums.length) return { pr: Math.min(...nums) };
  // 3) עמוד של הרדאר / אגרגטור: קישור החוצה לעמוד הכרטיסים
  let next = null;
  if (/radartlv\.co\.il|secrettelaviv/.test(location.host)) {
    const a = [...document.querySelectorAll("a[href^='http']")].find((x) => !x.href.includes(location.host) && /כרטיס|לרכישה|הזמנ|לפרטים|לאתר|tickets|buy/i.test((x.innerText || "") + x.href) && !/facebook|instagram|whatsapp|twitter|google|waze/.test(x.href));
    if (a) next = a.href;
  }
  return { pr: null, next };
}

module.exports = { extractGeneric, extractRadical, extractTLV, extractCoing, findPrice };
