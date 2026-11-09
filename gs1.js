// GS1 barcode parser (GS1-128, GS1 DataMatrix, GS1 QR).
// Medical supplies commonly encode GTIN (01), expiry (17), lot (10), serial (21).
(function (root) {
  const GS = '\x1d';

  // Fixed-length AIs: AI -> data length (excluding the AI itself).
  const FIXED = {
    '00': 18, '01': 14, '02': 14, '03': 14, '04': 16,
    '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6, '18': 6, '19': 6,
    '20': 2, '31': 10, '32': 10, '33': 10, '34': 10, '35': 10, '36': 10, '41': 16,
  };
  // Variable-length AIs we know about (max lengths); anything else is read until GS.
  const VARIABLE = {
    '10': 20, '21': 20, '22': 20, '30': 8, '37': 8, '240': 30, '241': 30,
    '250': 30, '251': 30, '400': 30, '710': 20, '711': 20, '712': 20, '713': 20, '714': 20,
  };

  function aiLength(data, i) {
    const two = data.substr(i, 2);
    if (two in FIXED) return 2;
    const three = data.substr(i, 3);
    if (three in VARIABLE) return 3;
    if (two in VARIABLE) return 2;
    // GS1 AIs starting 23x-27x, 39x-4xx, 7xxx etc. Approximate: 3 digits for 2xx/4xx, 4 for 3xxx/7xxx/8xxx.
    const first = data[i];
    if (first === '3' || first === '7' || first === '8') return 4;
    return 3;
  }

  /** Convert GS1 YYMMDD into ISO YYYY-MM-DD. DD=00 means last day of month. */
  function gs1Date(yymmdd) {
    if (!/^\d{6}$/.test(yymmdd)) return null;
    let yy = +yymmdd.slice(0, 2), mm = +yymmdd.slice(2, 4), dd = +yymmdd.slice(4, 6);
    if (mm < 1 || mm > 12) return null;
    // GS1 sliding century window.
    const nowYY = new Date().getFullYear() % 100;
    const century = Math.floor(new Date().getFullYear() / 100) * 100;
    const diff = yy - nowYY;
    let year = century + yy;
    if (diff >= 51) year -= 100;
    else if (diff <= -50) year += 100;
    if (dd === 0) dd = new Date(year, mm, 0).getDate();
    return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  function parseParenthesized(text) {
    const out = {};
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m, any = false;
    while ((m = re.exec(text))) { out[m[1]] = m[2].trim(); any = true; }
    return any ? out : null;
  }

  function parseRaw(text) {
    const out = {};
    let i = 0;
    while (i < text.length) {
      if (text[i] === GS) { i++; continue; }
      if (!/\d/.test(text[i])) return null;
      const alen = aiLength(text, i);
      const ai = text.substr(i, alen);
      i += alen;
      let value;
      if (ai in FIXED) {
        value = text.substr(i, FIXED[ai]);
        i += FIXED[ai];
      } else {
        const end = text.indexOf(GS, i);
        const max = VARIABLE[ai] || 90;
        const stop = end === -1 ? text.length : end;
        value = text.slice(i, Math.min(stop, i + max));
        i += value.length;
      }
      if (!value) return null;
      out[ai] = value;
    }
    return out;
  }

  /**
   * Parse a scanned string. Returns null if it doesn't look like GS1,
   * otherwise { gtin, expiry, lot, serial, ais }.
   */
  function parse(input) {
    if (!input) return null;
    let text = String(input).trim();
    // Strip AIM symbology identifiers (]C1 = GS1-128, ]d2 = GS1 DataMatrix, ]Q3 = GS1 QR, ]e0 = DataBar).
    text = text.replace(/^\][A-Za-z]\d/, '');
    // Some scanners emit FNC1 as a literal "<GS>" or "~1"/"^" style escape — normalise common ones.
    text = text.replace(/<GS>|\{GS\}|\\x1d|\\u001d/gi, GS);

    let ais = text.includes('(') ? parseParenthesized(text) : null;
    if (!ais) {
      // A plain 8/12/13/14-digit retail barcode is not GS1 element string data.
      if (/^\d{8}$|^\d{12,13}$/.test(text)) return null;
      if (!/^(00|01|02|10|11|17|21)/.test(text.replace(/^\x1d/, ''))) return null;
      ais = parseRaw(text);
    }
    if (!ais || !Object.keys(ais).length) return null;
    // Require at least one meaningful AI to avoid false positives.
    if (!('01' in ais || '17' in ais || '10' in ais || '00' in ais)) return null;

    return {
      gtin: ais['01'] || ais['02'] || null,
      expiry: ais['17'] ? gs1Date(ais['17']) : null,
      lot: ais['10'] || null,
      serial: ais['21'] || null,
      ais,
    };
  }

  const api = { parse, gs1Date };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GS1 = api;
})(typeof self !== 'undefined' ? self : this);
