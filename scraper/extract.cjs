// פונקציות חילוץ שרצות בתוך הדפדפן (page.evaluate).
// הן לא תלויות במבנה HTML מסוים: מחפשות כותרות עם קישור, שעה ומחיר בטקסט של כל כרטיס.

/* eslint-disable no-undef */
function extractGeneric(opts) {
  const imgOf = (el) => { if (!el) return null; const im = el.querySelector("img"); let s = im && (im.currentSrc || im.getAttribute("data-src") || im.getAttribute("data-lazy-src") || im.src); if (!s) { const bg = [el, ...el.querySelectorAll("*")].map((x) => getComputedStyle(x).backgroundImage).find((b) => b && b.startsWith("url(")); if (bg) s = bg.slice(4, -1).replace(/["']/g, ""); } if (!s || /^data:|logo|icon|avatar|placeholder|\.svg/i.test(s)) return null; try { return new URL(s, location.href).href; } catch (e) { return null; } };
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
    out.push({ d, t, ti: title, ve: opts.forceVenue || ve, pr, or: or && pr !== null && or > pr ? or : null, c, dg, u: a.href, age, mem, ds, img: imgOf(card) });
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
      const ogi = doc.querySelector('meta[property="og:image"]'); c.img = ogi ? ogi.content : null;
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
    out.push({ d: c.d, t, ti: c.ti, ve: /hamartef/.test(location.href) ? "בית רדיקל – המרתף" : "בית רדיקל", pr, or: null, c: cat, dg: false, u: c.u, age: null, mem, ds, img: c.img || null });
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
      age, mem: null, ds: sum.slice(0, 220) || null, org: "עיריית תל אביב־יפו", img: (() => { const raw = String((x.TlvMainPicture && x.TlvMainPicture.Value) || ""); const m = raw.match(/src=["']([^"']+)/i) || raw.match(/(https?:\/\/[^\s,"']+\.(?:jpe?g|png|webp)[^\s,"']*)/i) || raw.match(/^(\/[^,\s]+\.(?:jpe?g|png|webp))/i); return m ? new URL(m[1].replace(/&amp;/g, "&"), "https://www.tel-aviv.gov.il").href : null; })(), end: b && b[0] !== a[0] ? b[0] : null,
    });
  }
  return out;
}

// Coing: עמודי האירועים של המרכזים הקהילתיים של העירייה (www.coing.co/TLV_...).
// כל אירוע הוא קישור /שם-הקהילה/מספר; בכרטיס: מארגן, כותרת, תגיות, כתובת, DD/MM/YYYY, שעות, מחיר.
function extractCoing() {
  const imgOf = (el) => { if (!el) return null; const im = el.querySelector("img"); let s = im && (im.currentSrc || im.getAttribute("data-src") || im.getAttribute("data-lazy-src") || im.src); if (!s) { const bg = [el, ...el.querySelectorAll("*")].map((x) => getComputedStyle(x).backgroundImage).find((b) => b && b.startsWith("url(")); if (bg) s = bg.slice(4, -1).replace(/["']/g, ""); } if (!s || /^data:|logo|icon|avatar|placeholder|\.svg/i.test(s)) return null; try { return new URL(s, location.href).href; } catch (e) { return null; } };
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
      pr, or: null, c, dg: false, u: a.href, age: null, mem: null, ds: null, org: orgName, img: imgOf(el) });
  }
  return { events: out, groups };
}

// אתרי מקומות: הרבה אתרים שומרים את האירועים כנתונים מובנים (JSON-LD מסוג Event) – הכי אמין
function extractLD(opts) {
  opts = opts || {};
  const out = [];
  const tz = (s) => { const m = String(s || "").match(/(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/); return m ? [m[1], m[2] || "20:00"] : null; };
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    const ty = [].concat(o["@type"] || []).join(",");
    if (/Event/.test(ty) && o.name && o.startDate) {
      const dt = tz(o.startDate);
      if (dt) {
        const off = [].concat(o.offers || []);
        const prices = off.map((x) => +(x.lowPrice ?? x.price)).filter((n) => !isNaN(n));
        const loc = [].concat(o.location || [])[0] || {};
        const img = [].concat(o.image || [])[0];
        const name = String(o.name).replace(/&amp;/g, "&").replace(/&#039;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
        let c = opts.defaultCat || "c";
        const blob = name + " " + (o.description || "");
        if (/הקרנ|סרט|קולנוע|film|screening/i.test(blob)) c = "f";
        else if (/סטנדאפ|stand.?up/i.test(blob)) c = "s";
        else if (/מסיבה|party|DJ|רייב/i.test(blob)) c = "p";
        else if (/סדנ|workshop/i.test(name)) c = "w";
        else if (/הופעה|קונצרט|concert|live|להקה/i.test(blob) && c === "c") c = "m";
        if (/ילדים|לכל המשפחה|kids|family/i.test(blob)) c = "k";
        out.push({ d: dt[0], t: dt[1], ti: name, ve: opts.forceVenue || loc.name || "", pr: prices.length ? Math.min(...prices) : (/free|חינם|חופשית/i.test(JSON.stringify(off)) ? 0 : null),
          or: null, c, dg: false, u: o.url ? new URL(o.url, location.href).href : location.href, age: null, mem: null,
          ds: o.description ? String(o.description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220) : null,
          img: typeof img === "string" ? img : img && img.url ? img.url : null });
      }
    }
    Object.values(o).forEach(walk);
  };
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(s.textContent)); } catch (e) {} }
  const seen = new Set();
  return out.filter((e) => { const k = e.d + e.t + e.ti; if (seen.has(k)) return false; seen.add(k); return true; });
}

// עמוד של אירוע/הצגה בודדת: כותרת, כל התאריכים+שעות שמופיעים, מחיר, תמונה ותיאור
function extractDetail(opts) {
  opts = opts || {};
  const pad = (n) => String(n).padStart(2, "0");
  const meta = (p) => { const m = document.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return m ? m.content : ""; };
  const h1 = document.querySelector("h1") && document.querySelector("h1").innerText.trim();
  if (h1 && /^(מופעים|לוח|אירועים|הצגות|כרטיסים)/.test(h1)) opts = { ...opts, titleSel: opts.titleSel || "meta-og" };
  let ti = (opts.titleSel === "meta-og" && meta("og:title")) || (opts.titleSel && document.querySelector(opts.titleSel) && document.querySelector(opts.titleSel).innerText) || (document.querySelector("h1") && document.querySelector("h1").innerText) || meta("og:title") || document.title;
  ti = String(ti).replace(/\s+/g, " ").replace(/\s*[|\-–—]\s*(תיאטרון|סינמטק|צוותא|לבונטין|levontin|הבימה|בית ליסין|תמונע|סוזן|הסימטה|בארבי|מוזיאון|קומדי|comedy|הקאמרי).*$/i, "").replace(/\s*צוותא – הבית לתרבות ישראלית$/, "").trim().slice(0, 120);
  const cands = [...document.querySelectorAll(opts.mainSel || "main, article, #content, .content")].filter((x) => (x.innerText || "").length > 200);
  const main = cands.sort((a, b) => b.innerText.length - a.innerText.length)[0] || document.body;
  const txt = (main ? main.innerText : document.body.innerText).replace(/[ \t]+/g, " ");
  const MON = { "ינואר": 1, "פברואר": 2, "מרץ": 3, "מרס": 3, "אפריל": 4, "מאי": 5, "יוני": 6, "יולי": 7, "אוגוסט": 8, "ספטמבר": 9, "אוקטובר": 10, "נובמבר": 11, "דצמבר": 12 };
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), lim = new Date(today.getTime() + 100 * 864e5);
  const found = [];
  const add = (dd, mm, yy, idx, len) => {
    let y = yy ? (+yy < 100 ? 2000 + +yy : +yy) : now.getFullYear();
    let dt = new Date(y, mm - 1, dd);
    if (!yy && dt < new Date(today.getTime() - 60 * 864e5)) dt = new Date(++y, mm - 1, dd);
    if (isNaN(dt) || dt < today || dt > lim || dd > 31 || mm > 12) return;
    const near = txt.slice(Math.max(0, idx - 40), idx + len + 60);
    const tm = near.slice(near.indexOf(txt.substr(idx, len)) + len).match(/([01]?\d|2[0-3]):([0-5]\d)/) || near.match(/([01]?\d|2[0-3]):([0-5]\d)/);
    found.push({ d: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, t: tm ? `${pad(+tm[1])}:${tm[2]}` : null });
  };
  for (const m of txt.matchAll(/(?<![\d/.])(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?![\d/.])/g)) add(+m[1], +m[2], m[3], m.index, m[0].length);
  for (const m of txt.matchAll(/(\d{1,2})\s+(?:ב|ל)?(ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)(?:\s+(\d{4}))?/g)) add(+m[1], MON[m[2]], m[3], m.index, m[0].length);
  const seen = new Set();
  const dates = found.filter((x) => x.t).filter((x) => { const k = x.d + x.t; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, opts.maxDates || 12);
  // מחיר
  let pr = null;
  if (/כניסה חופשית|הכניסה חופשית|ללא תשלום|ללא עלות|כניסה חינם|free entry/i.test(txt)) pr = 0;
  else { const n = [...txt.matchAll(/(?:₪\s?(\d{2,4})|(\d{2,4})(?:\.00)?\s?(?:₪|ש"ח|ש״ח|שח\b|NIS))/g)].map((m) => +(m[1] || m[2])).filter((x) => x >= 15 && x <= 600); if (n.length) pr = Math.min(...n); }
  const img = meta("og:image") || null;
  const ds = (meta("og:description") || meta("description") || "").replace(/\s+/g, " ").trim().slice(0, 220) || null;
  return { ti, dates, pr, img: img && !/logo/i.test(img) ? new URL(img, location.href).href : null, ds };
}

// הטבות דיגיתל (Benefits.aspx): מחפשים בתוך Angular את הרשימה הגדולה של האירועים; אם לא – קוראים את הכרטיסים מהדף
async function extractDigitel() {
  const pad = (n) => String(n).padStart(2, "0");
  const BASE = "https://www.tel-aviv.gov.il/Pages/MainItemPage.aspx?WebID=";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jerusalem" });
  const val = (x, k) => String((x && x[k] && (x[k].Value ?? x[k])) || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
  const parsePrice = (s) => { if (/חינם|ללא תשלום|כניסה חופשית/.test(s)) return { pr: 0, or: null }; const n = (s.match(/\d+/g) || []).map(Number).filter((x) => x < 2000); const m = s.match(/במקום\s*(\d+)/); return { pr: n.length ? n[0] : null, or: m ? +m[1] : null }; };
  let items = null;
  for (let i = 0; i < 30 && !items; i++) {
    try {
      const seen = new Set();
      const scan = (s, depth) => { if (!s || seen.has(s) || depth > 6) return; seen.add(s);
        for (const k in s) { if (k[0] === "$") continue; const v = s[k];
          if (Array.isArray(v) && v.length > 20 && v[0] && v[0].Title) { if (!items || v.length > items.length) items = v; }
          else if (v && typeof v === "object" && !Array.isArray(v)) for (const k2 in v) { const v2 = v[k2]; if (Array.isArray(v2) && v2.length > 20 && v2[0] && v2[0].Title && (!items || v2.length > items.length)) items = v2; } }
        let c = s.$$childHead; while (c) { scan(c, depth + 1); c = c.$$nextSibling; } };
      document.querySelectorAll("[ng-controller],[ng-app]").forEach((el) => scan(window.angular.element(el).scope(), 0));
    } catch (e) {}
    if (!items) await new Promise((r) => setTimeout(r, 500));
  }
  const out = [];
  if (items) {
    for (const x of items) {
      const st = val(x, "TlvStartDate").match(/(\d\d)\.(\d\d)\.(\d\d), (\d\d:\d\d)/), en = val(x, "TlvEndDate").match(/(\d\d)\.(\d\d)\.(\d\d)/);
      if (!st) continue;
      let d = `20${st[3]}-${st[2]}-${st[1]}`; const e = en ? `20${en[3]}-${en[2]}-${en[1]}` : d;
      if (e < today) continue; if (d < today) d = today;
      const ptxt = [val(x, "TlvSearchContentForLobbyBenefitStickerDescription"), val(x, "TlvBenefitStickerDescription"), val(x, "TlvPaymentCost"), val(x, "TlvBenefitDescription")].find((s) => /\d|חינם/.test(s)) || "";
      const { pr, or } = parsePrice(ptxt);
      const raw = val(x, "TlvMainPicture"); const im = raw.match(/src=["']([^"']+)/i) || raw.match(/(\/[^,\s"']+\.(?:jpe?g|png|webp))/i);
      const ti = val(x, "Title"), sm = val(x, "TlvSummary");
      let c = "c";
      if (/סינמטק|הקרנ|סרט|קולנוע/.test(ti)) c = "f"; else if (/תיאטרון|הצגה|בהבימה|בקאמרי|בית ליסין|מחזמר|קומדיה/.test(ti)) c = "t";
      else if (/סטנדאפ|סטנד אפ/.test(ti)) c = "s"; else if (/בהופעה|הופעה|קונצרט|מופע|ג'אז|תזמורת|אופרה/.test(ti)) c = "m"; else if (/סדנ/.test(ti)) c = "w";
      if (/ילדים|לילדים|לכל המשפחה|הצגת ילדים|חנוכה לילדים|שעת סיפור/.test(ti + " " + sm.slice(0, 80))) c = "k";
      out.push({ d, t: st[4] === "00:00" ? "10:00" : st[4], ti, ve: val(x, "TlvAddress1") || val(x, "TlvInstitution"), pr, or, c, dg: true,
        u: BASE + val(x, "WebID") + "&ListID=" + val(x, "ListID") + "&ItemID=" + val(x, "ListItemID"), age: null, mem: null, ds: val(x, "TlvSummary").slice(0, 220) || null,
        img: im ? new URL(im[1], "https://www.tel-aviv.gov.il").href : null, end: e !== d ? e : null, org: "עיריית תל אביב־יפו (הטבת דיגיתל)" });
    }
    return out;
  }
  // גיבוי: כרטיסים בדף
  for (const a of document.querySelectorAll('a[href*="MainItemPage"]')) {
    let el = a; for (let i = 0; i < 4 && el.parentElement && !/הטבה לדיגיתל/.test(el.innerText); i++) el = el.parentElement;
    const L = (el.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const dm = (el.innerText || "").match(/(?:(\d{1,2}:\d{2})\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2})/);
    if (!dm || L.length < 3) continue;
    let d = `20${dm[4]}-${pad(dm[3])}-${pad(dm[2])}`; if (d < today) d = today;
    const pl = L.find((l) => /₪|חינם/.test(l)) || ""; const { pr, or } = parsePrice(pl);
    out.push({ d, t: dm[1] || "10:00", ti: L[0], ve: L.find((l) => l !== L[0] && l !== pl && !/\d\.\d/.test(l)) || "", pr, or, c: "c", dg: true, u: a.href, age: null, mem: null, ds: null, img: null });
  }
  return out;
}

// בארבי: רשימת ההופעות בעמוד הבית – "שם / דלתות: HH:MM / DD/MM יום"
function extractBarby() {
  const pad = (n) => String(n).padStart(2, "0"); const now = new Date(); const out = []; const seen = new Set();
  for (const el of document.querySelectorAll("a, div, li")) {
    const tx = el.innerText || ""; if (tx.length > 300 || !/דלתות:/.test(tx)) continue;
    const dm = tx.match(/(\d{1,2})\/(\d{1,2})/), tm = tx.match(/דלתות:\s*(\d{1,2}:\d{2})/); if (!dm || !tm) continue;
    const L = tx.split("\n").map((s) => s.trim()).filter((l) => l && !/דלתות|כרטיס|^\d{1,2}\/\d{1,2}/.test(l));
    const ti = L[0]; if (!ti) continue;
    let y = now.getFullYear(); if (+dm[2] < now.getMonth() + 1 - 2) y++;
    const d = `${y}-${pad(+dm[2])}-${pad(+dm[1])}`; const k = d + ti; if (seen.has(k)) continue; seen.add(k);
    const a = el.tagName === "A" ? el : el.querySelector("a[href]") || el.closest("a");
    const im = el.querySelector("img");
    let c = "m"; if (/מסיבה|מסיבת/.test(ti)) c = "p";
    const href = a && a.href && a.href.replace(/[#?].*$/, "") !== location.href.replace(/[#?].*$/, "") ? a.href : location.origin + "/?show=" + d + "-" + encodeURIComponent(ti.slice(0, 30));
    out.push({ d, t: tm[1].padStart(5, "0"), ti, ve: "בארבי", pr: null, or: null, c, dg: false, u: href, age: null, mem: null, ds: /אזלו/.test(tx) ? "כרטיסים אזלו" : null, img: im ? im.currentSrc || im.src : null });
  }
  return out;
}

// השלמת מחיר מעמוד האירוע עצמו (לאירועים שהגיעו בלי מחיר)
function findPrice() {
  const ogImg = (() => { const m = document.querySelector('meta[property="og:image"],meta[name="twitter:image"]'); const s = m && m.content; return s && !/logo|icon/i.test(s) ? new URL(s, location.href).href : null; })();
  // 1) נתונים מובנים (JSON-LD / itemprop) – הכי אמין
  const ld = [];
  for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { const walk = (o) => { if (!o || typeof o !== "object") return; if (o.price !== undefined || o.lowPrice !== undefined) ld.push(+(o.lowPrice ?? o.price)); Object.values(o).forEach(walk); }; walk(JSON.parse(sc.textContent)); } catch (e) {}
  }
  document.querySelectorAll('[itemprop="price"],[itemprop="lowPrice"]').forEach((m) => ld.push(+(m.getAttribute("content") || m.textContent.replace(/[^\d.]/g, ""))));
  const okLd = ld.filter((n) => !isNaN(n) && n >= 0 && n <= 600);
  if (okLd.length) return { pr: Math.min(...okLd), img: ogImg };
  // 2) טקסט העמוד
  const txt = (document.body.innerText || "").replace(/\s+/g, " ");
  if (/כניסה חופשית|הכניסה חופשית|ללא תשלום|ללא עלות|free entry|כניסה חינם|האירוע חינמי|אירוע חינמי/i.test(txt) && !/חינם לחברי/.test(txt)) return { pr: 0, img: ogImg };
  const nums = [...txt.matchAll(/(?:₪\s?(\d{2,4})|(\d{2,4})(?:\.00)?\s?(?:₪|ש"ח|ש״ח|שח\b|NIS|ILS))/g)].map((m) => +(m[1] || m[2])).filter((n) => n >= 10 && n <= 600);
  if (nums.length) return { pr: Math.min(...nums), img: ogImg };
  // 3) עמוד של הרדאר / אגרגטור: קישור החוצה לעמוד הכרטיסים
  let next = null;
  if (/radartlv\.co\.il|secrettelaviv/.test(location.host)) {
    const a = [...document.querySelectorAll("a[href^='http']")].find((x) => !x.href.includes(location.host) && /כרטיס|לרכישה|הזמנ|לפרטים|לאתר|tickets|buy/i.test((x.innerText || "") + x.href) && !/facebook|instagram|whatsapp|twitter|google|waze/.test(x.href));
    if (a) next = a.href;
  }
  return { pr: null, next, img: ogImg };
}

module.exports = { extractDigitel, extractBarby, extractDetail, extractLD, extractGeneric, extractRadical, extractTLV, extractCoing, findPrice };
