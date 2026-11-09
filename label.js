// Pull a likely product name and lot number out of text read from a package label.
// Input: OCR lines with their text height, e.g. [{ text: 'Sodium Chloride 0.9%', height: 42 }, ...]
(function (root) {
  // Lines that are labels/codes rather than the product name.
  const NOT_NAME = /\b(EXP|EXPIRY|USE\s*BY|MFG|MFD|LOT|BATCH|REF|CAT|SN|SERIAL|GTIN|STERILE|RX\s*ONLY|MADE\s*IN|MANUFACTURED|DISTRIBUTED|WWW\.|HTTP|STORE|KEEP|DO\s*NOT|CAUTION|WARNING|SINGLE\s*USE|LATEX|QTY)\b/i;
  const LOT_RE = /\b(?:LOT(?:\s*(?:NO|NUMBER|#))?|BATCH(?:\s*(?:NO|#))?|B\/N|CH\.?-?B\.?|LOTE|CHARGE)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,19})\b/i;

  function clean(s) {
    return String(s || '')
      .replace(/[|_~`^*<>{}\[\]\\"]+/g, ' ')    // OCR noise characters
      .replace(/^[^A-Za-z0-9(]+|[^A-Za-z0-9%)]+$/g, '') // junk at the ends
      .replace(/\s+/g, ' ')
      .trim();
  }
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9%]+/g, ' ').trim();

  function looksLikeName(t) {
    if (t.length < 3 || t.length > 60) return false;
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || letters / t.replace(/\s/g, '').length < 0.55) return false;
    if (NOT_NAME.test(t)) return false;
    // Lone short "words" are usually OCR garbage from logos/graphics.
    const words = t.split(' ').filter((w) => /[A-Za-z]{2,}/.test(w));
    if (!words.length || (words.length === 1 && words[0].length < 4)) return false;
    return true;
  }

  /**
   * @param {{text:string, height:number}[]} lines
   * @param {string[]} knownNames product names already saved (matched first)
   * @returns {{names: string[], lot: string|null}}
   */
  function extract(lines, knownNames) {
    const all = (lines || []).map((l) => ({ text: clean(l.text), height: l.height || 0 })).filter((l) => l.text);
    const fullText = norm(all.map((l) => l.text).join(' '));

    // 1. A product we already know whose name appears on the label.
    const known = (knownNames || [])
      .filter((n) => norm(n).length >= 4 && fullText.includes(norm(n)))
      .sort((a, b) => b.length - a.length);

    // 2. Biggest text that looks like a product name.
    const cands = all.filter((l) => looksLikeName(l.text)).sort((a, b) => b.height - a.height);
    const guessed = [];
    if (cands.length) {
      // Names often wrap over 2–3 lines of the same size ("Sodium Chloride" / "0.9% Injection"):
      // grow a block of neighbouring same-size lines around the biggest one.
      const top = cands[0];
      const idx = all.indexOf(top);
      const same = (l) => l && Math.abs(l.height - top.height) <= top.height * 0.2 &&
        !NOT_NAME.test(l.text) && /[A-Za-z0-9]/.test(l.text) && l.text.length <= 40;
      let a = idx, b = idx;
      while (b - a < 2 && same(all[a - 1]) && all.slice(a - 1, b + 1).map((l) => l.text).join(' ').length <= 60) a--;
      while (b - a < 2 && same(all[b + 1]) && all.slice(a, b + 2).map((l) => l.text).join(' ').length <= 60) b++;
      if (b > a) guessed.push(all.slice(a, b + 1).map((l) => l.text).join(' '));
      cands.slice(0, 3).forEach((c) => guessed.push(c.text));
    }

    const names = [];
    [...known, ...guessed].forEach((n) => { if (!names.some((x) => norm(x) === norm(n))) names.push(n); });

    let lot = null;
    for (const l of all) {
      const m = l.text.match(LOT_RE);
      if (m && /\d/.test(m[1])) { lot = m[1].toUpperCase(); break; }
    }
    return { names: names.slice(0, 4), lot };
  }

  const api = { extract };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LabelText = api;
})(typeof self !== 'undefined' ? self : this);
