// Find expiry dates in text read from a package photo (OCR output).
// Handles formats seen on medical supplies: 2027-05-31, 2027-05, 05/2027, 05/27,
// 31/05/2027, MAY 2027, 31 MAY 2027, 2027 MAY, MAY-27, and EXP YYMMDD.
(function (root) {
  const MONTHS = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
    JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
    // A few common non-English abbreviations on imported stock.
    JANV: 1, FEV: 2, MARS: 3, AVR: 4, MAI: 5, JUIN: 6, JUIL: 7, AOUT: 8, MRZ: 3, OKT: 10, DEZ: 12, ENE: 1, ABR: 4, AGO: 8, DIC: 12, GEN: 1, MAG: 5, GIU: 6, LUG: 7, SET: 9, OTT: 10,
  };
  const EXP_WORDS = /\b(EXP(?:IRY|IRES|IRATION)?|EXD|USE\s*BY|USE\s*BEFORE|BEST\s*BEFORE|BB|VAL(?:IDADE)?|CAD(?:UCIDAD)?|VERW(?:ENDBAR)?|SCAD(?:ENZA)?|PER|EXPIRATION\s*DATE)\b/;
  const MFG_WORDS = /\b(MFG|MFD|MFR|MAN(?:UF(?:ACTURED?)?)?|PROD(?:UCED)?|MADE|DOM|LOT|BATCH|STERILI[SZ]ED|HERG|FAB)\b/;

  function lastDay(y, m) { return new Date(y, m, 0).getDate(); }
  function fullYear(y) { return y < 100 ? 2000 + y : y; }
  function iso(y, m, d) {
    y = fullYear(y);
    if (y < 2000 || y > 2099 || m < 1 || m > 12) return null;
    if (d == null) d = lastDay(y, m); // month-only expiry = end of that month
    if (d < 1 || d > lastDay(y, m)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  /** Fix common OCR mix-ups inside things that look like numbers (O->0, I/l->1, S->5, B->8). */
  function cleanDigits(text) {
    return text.replace(/[0-9OoIlSB|]{2,}(?:[\/\-.][0-9OoIlSB|]{1,4}){0,2}/g, (tok) => {
      const digits = (tok.match(/\d/g) || []).length;
      if (digits < tok.replace(/[\/\-.]/g, '').length / 2) return tok; // mostly letters: leave it alone
      return tok.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/S/g, '5').replace(/B/g, '8');
    });
  }

  /**
   * @param {string} text OCR text
   * @param {{dayFirst?: boolean}} opts dayFirst: how to read 03/04/2027 (true = 3 April). Default from locale.
   * @returns {{date: string, raw: string, score: number}[]} best first
   */
  function extract(text, opts) {
    const dayFirst = opts && opts.dayFirst != null ? opts.dayFirst
      : !(typeof navigator !== 'undefined' && /^en-US|^en-PH|^es-US/i.test(navigator.language || ''));
    const src = cleanDigits(String(text || '')).toUpperCase().replace(/[‐-―]/g, '-');
    const found = [];
    const MON = '(' + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|') + ')\\.?';
    const SEP = '\\s*[\\/\\-.]\\s*';

    const patterns = [
      // 2027-05-31, 2027/05/31, 2027.05.31
      [new RegExp(`\\b(20\\d{2})${SEP}(\\d{1,2})${SEP}(\\d{1,2})\\b`, 'g'), (m) => iso(+m[1], +m[2], +m[3])],
      // 31/05/2027 or 05/31/2027 (also 2-digit years: 31/05/27)
      [new RegExp(`\\b(\\d{1,2})${SEP}(\\d{1,2})${SEP}(20\\d{2}|\\d{2})\\b`, 'g'), (m) => {
        let a = +m[1], b = +m[2];
        let d, mo;
        if (a > 12) { d = a; mo = b; } else if (b > 12) { d = b; mo = a; } else if (dayFirst) { d = a; mo = b; } else { d = b; mo = a; }
        return iso(+m[3], mo, d);
      }],
      // 2027-05, 2027/05
      [new RegExp(`\\b(20\\d{2})${SEP}(\\d{1,2})\\b(?!${SEP}\\d)`, 'g'), (m) => iso(+m[1], +m[2])],
      // 05/2027, 05-2027
      [new RegExp(`(?<![\\d\\/\\-.])(\\d{1,2})${SEP}(20\\d{2})\\b`, 'g'), (m) => iso(+m[2], +m[1])],
      // 05/27 (month/2-digit year) — only when not part of a longer date
      [new RegExp(`(?<![\\d\\/\\-.])(\\d{1,2})\\s*[\\/\\-]\\s*(\\d{2})(?![\\d\\/\\-.])`, 'g'), (m) => (+m[1] <= 12 ? iso(+m[2], +m[1]) : null)],
      // 31 MAY 2027, 31-MAY-27, 31MAY2027
      [new RegExp(`\\b(\\d{1,2})[\\s\\-./]*${MON}[\\s\\-./,]*(20\\d{2}|\\d{2})\\b`, 'g'), (m) => iso(+m[3], MONTHS[m[2]], +m[1])],
      // MAY 31, 2027
      [new RegExp(`\\b${MON}[\\s\\-./]*(\\d{1,2}),\\s*(20\\d{2})\\b`, 'g'), (m) => iso(+m[3], MONTHS[m[1]], +m[2])],
      // MAY 2027, MAY-27, MAY.2027
      [new RegExp(`\\b${MON}[\\s\\-./,]*(20\\d{2}|\\d{2})\\b`, 'g'), (m) => iso(+m[2], MONTHS[m[1]])],
      // 2027 MAY, 2027-MAY-31
      [new RegExp(`\\b(20\\d{2})[\\s\\-./]*${MON}(?:[\\s\\-./]*(\\d{1,2}))?\\b`, 'g'), (m) => iso(+m[1], MONTHS[m[2]], m[3] ? +m[3] : null)],
      // EXP 270531 / EXP 20270531 (compact, only trusted right after an expiry word)
      [new RegExp(`${EXP_WORDS.source}[\\s:.\\-]*(20\\d{6}|\\d{6})\\b`, 'g'), (m) => {
        const s = m[m.length - 1];
        return s.length === 8 ? iso(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)) : iso(+s.slice(0, 2), +s.slice(2, 4), +s.slice(4, 6));
      }],
    ];

    for (const [re, toISO] of patterns) {
      let m;
      while ((m = re.exec(src))) {
        const date = toISO(m);
        if (!date) continue;
        const start = m.index, end = m.index + m[0].length;
        // Ignore matches that overlap a more specific match already found (e.g. "05/2027" inside "31/05/2027").
        if (found.some((f) => start < f.end && end > f.start)) continue;
        const before = src.slice(Math.max(0, start - 25), start);
        const line = before.split('\n').pop();
        let score = 0;
        if (EXP_WORDS.test(m[0]) || EXP_WORDS.test(line)) score += 10;
        else if (MFG_WORDS.test(line)) score -= 10;
        found.push({ date, raw: m[0].trim(), score, start, end });
      }
    }

    // Merge duplicates (same date read twice), keep the best score.
    const byDate = new Map();
    for (const f of found) {
      const prev = byDate.get(f.date);
      if (!prev || f.score > prev.score) byDate.set(f.date, f);
    }
    // Best first: expiry keyword wins; otherwise the latest date (expiry comes after manufacture).
    return [...byDate.values()]
      .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
      .map(({ date, raw, score }) => ({ date, raw, score }));
  }

  const api = { extract };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExpiryDates = api;
})(typeof self !== 'undefined' ? self : this);
