(function () {
  'use strict';

  // ---------- Storage ----------
  const KEY_ITEMS = 'expiry.items.v1';
  const KEY_CATALOG = 'expiry.catalog.v1';
  const KEY_SETTINGS = 'expiry.settings.v1';

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { toast('Could not save — storage is full or blocked.'); }
  }

  let items = load(KEY_ITEMS, []);           // [{id, barcode, name, expiry, qty, lot, location, notes, addedAt, updatedAt}]
  let catalog = load(KEY_CATALOG, {});       // barcodeKey -> {name, location}
  let settings = Object.assign({ warnDays: 30 }, load(KEY_SETTINGS, {}));

  const persist = () => { save(KEY_ITEMS, items); save(KEY_CATALOG, catalog); };

  // Ask the browser not to evict our data.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function daysUntil(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const [ty, tm, td] = todayISO().split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
  }
  function status(item) {
    const n = daysUntil(item.expiry);
    if (n < 0) return 'expired';
    if (n <= settings.warnDays) return 'soon';
    return 'ok';
  }
  function fmtDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function daysLabel(n) {
    if (n < 0) return `Expired ${-n}d ago`;
    if (n === 0) return 'Expires today';
    if (n === 1) return '1 day left';
    return `${n} days left`;
  }
  /** Key used to remember product names: GTIN for GS1 codes, otherwise the raw barcode. */
  function catalogKey(barcode) {
    if (!barcode) return '';
    const g = GS1.parse(barcode);
    return g && g.gtin ? g.gtin : barcode.replace(/\x1d/g, '').trim();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ---------- Tabs ----------
  function showView(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    if (name !== 'scan') stopCamera();
    if (name === 'inventory') render();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showView(b.dataset.view)));

  // ---------- Inventory ----------
  function render() {
    const q = $('search').value.trim().toLowerCase();
    const f = $('filter').value;
    const loc = $('location-filter').value;

    const counts = { expired: 0, soon: 0, ok: 0 };
    items.forEach((it) => counts[status(it)]++);
    $('summary').innerHTML = [
      ['expired', 'Expired'], ['soon', `≤ ${settings.warnDays} days`], ['ok', 'OK'],
    ].map(([k, label]) => `<div class="stat ${k}" data-filter="${k}"><b>${counts[k]}</b><span>${label}</span></div>`).join('');

    const locations = [...new Set(items.map((i) => i.location).filter(Boolean))].sort();
    $('location-filter').innerHTML = '<option value="">All locations</option>' +
      locations.map((l) => `<option ${l === loc ? 'selected' : ''}>${esc(l)}</option>`).join('');
    $('location-list').innerHTML = locations.map((l) => `<option value="${esc(l)}">`).join('');
    $('name-list').innerHTML = [...new Set(Object.values(catalog).map((c) => c.name))].map((n) => `<option value="${esc(n)}">`).join('');

    const shown = items
      .filter((it) => f === 'all' || status(it) === f)
      .filter((it) => !loc || it.location === loc)
      .filter((it) => !q || [it.name, it.lot, it.location, it.barcode, it.notes].some((v) => v && v.toLowerCase().includes(q)))
      .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.name.localeCompare(b.name));

    $('list').innerHTML = shown.map((it) => {
      const n = daysUntil(it.expiry);
      const meta = [
        it.qty != null && it.qty !== '' ? `Qty ${esc(it.qty)}` : '',
        it.location ? esc(it.location) : '',
        it.lot ? `Lot ${esc(it.lot)}` : '',
        it.notes ? esc(it.notes) : '',
      ].filter(Boolean).join(' · ');
      return `<li class="item ${status(it)}">
        <div class="name">${esc(it.name)}</div>
        <div class="badge">${daysLabel(n)}<small>${fmtDate(it.expiry)}</small></div>
        <div class="meta">${meta || '&nbsp;'}</div>
        <div class="item-actions">
          <button data-act="edit" data-id="${it.id}">Edit</button>
          <button data-act="dup" data-id="${it.id}">Replace stock</button>
          <button data-act="del" data-id="${it.id}">Remove</button>
        </div>
      </li>`;
    }).join('');
    $('empty').hidden = items.length > 0;
    if (items.length && !shown.length) {
      $('empty').hidden = false;
      $('empty').textContent = 'No items match this filter.';
    } else {
      $('empty').innerHTML = 'No items yet. Tap <b>Scan</b> to add your first item.';
    }
  }

  $('search').addEventListener('input', render);
  $('filter').addEventListener('change', render);
  $('location-filter').addEventListener('change', render);
  $('summary').addEventListener('click', (e) => {
    const s = e.target.closest('.stat');
    if (!s) return;
    $('filter').value = $('filter').value === s.dataset.filter ? 'all' : s.dataset.filter;
    render();
  });

  $('list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const it = items.find((i) => i.id === btn.dataset.id);
    if (!it) return;
    if (btn.dataset.act === 'edit') {
      fillForm(it, true);
      showView('scan');
    } else if (btn.dataset.act === 'dup') {
      // Replace an expired/used item with new stock: keep name/location, ask for new expiry.
      fillForm({ ...it, id: it.id, expiry: '', lot: '' }, true);
      $('form-title').textContent = 'Replace stock — scan new item';
      showView('scan');
      toast('Scan the new item or enter its expiry date.');
    } else if (btn.dataset.act === 'del') {
      if (confirm(`Remove "${it.name}" (expires ${fmtDate(it.expiry)})?`)) {
        items = items.filter((i) => i.id !== it.id);
        persist(); render();
        toast('Item removed');
      }
    }
  });

  // ---------- Form ----------
  function fillForm(it, editing) {
    $('f-id').value = editing ? it.id : '';
    $('f-barcode').value = it.barcode || '';
    $('f-name').value = it.name || '';
    $('f-expiry').value = it.expiry || '';
    $('f-qty').value = it.qty ?? 1;
    $('f-lot').value = it.lot || '';
    $('f-location').value = it.location || '';
    $('f-notes').value = it.notes || '';
    $('form-title').textContent = editing ? 'Edit item' : 'Add item';
    $('btn-save').textContent = editing ? 'Save changes' : 'Save item';
    $('f-expiry').classList.remove('needs-check');
    $('ocr-chips').hidden = true;
  }
  function clearForm() {
    const keepLocation = $('f-location').value; // usually scanning a whole bag/compartment in a row
    fillForm({ location: keepLocation }, false);
  }
  $('btn-clear').addEventListener('click', () => { fillForm({}, false); });

  $('item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      barcode: $('f-barcode').value.trim(),
      name: $('f-name').value.trim(),
      expiry: $('f-expiry').value,
      qty: $('f-qty').value === '' ? '' : Number($('f-qty').value),
      lot: $('f-lot').value.trim(),
      location: $('f-location').value.trim(),
      notes: $('f-notes').value.trim(),
    };
    if (!data.name || !data.expiry) { toast('Name and expiry date are required.'); return; }

    const key = catalogKey(data.barcode);
    if (key) catalog[key] = { name: data.name, location: data.location };

    const id = $('f-id').value;
    const now = new Date().toISOString();
    if (id) {
      const it = items.find((i) => i.id === id);
      if (it) Object.assign(it, data, { updatedAt: now });
      toast('Item updated');
    } else {
      // Same product, lot, expiry and location already logged? Just add to the quantity.
      const match = items.find((i) => catalogKey(i.barcode) === key && key &&
        i.expiry === data.expiry && (i.lot || '') === data.lot && (i.location || '') === data.location);
      if (match) {
        match.qty = (Number(match.qty) || 0) + (Number(data.qty) || 1);
        match.updatedAt = now;
        toast(`Added to existing — now qty ${match.qty}`);
      } else {
        items.push({ id: uid(), ...data, addedAt: now, updatedAt: now });
        toast(`Saved: ${data.name}`);
      }
    }
    persist();
    clearForm();
    render();
    $('scan-status').textContent = 'Saved. Scan the next item.';
  });

  // ---------- Handling a scanned code ----------
  function handleCode(text) {
    if (!text) return;
    const g = GS1.parse(text);
    const key = catalogKey(text);
    const known = catalog[key];
    const editingId = $('f-id').value;

    $('f-barcode').value = text.replace(/\x1d/g, ' ').trim();
    if (known) {
      if (!editingId || !$('f-name').value) $('f-name').value = known.name;
      if (!$('f-location').value && known.location) $('f-location').value = known.location;
    }
    const found = [];
    if (g && g.expiry) { $('f-expiry').value = g.expiry; found.push('expiry'); }
    if (g && g.lot) { $('f-lot').value = g.lot; found.push('lot'); }

    if (navigator.vibrate) navigator.vibrate(80);
    const parts = [known ? `Recognised: ${known.name}` : 'New product — enter a name'];
    if (found.length) parts.push(`${found.join(' & ')} read from barcode`);
    else parts.push('enter the expiry date from the package');
    $('scan-status').textContent = parts.join('. ') + '.';

    const next = !$('f-name').value ? 'f-name' : !$('f-expiry').value ? 'f-expiry' : 'btn-save';
    $(next).focus();
    $('item-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Hardware / Bluetooth scanners act as keyboards: typing into the barcode field + Enter.
  $('f-barcode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCode($('f-barcode').value); }
  });
  $('f-barcode').addEventListener('change', () => handleCode($('f-barcode').value));

  // ---------- Camera scanning ----------
  let scanner = null;
  let scanning = false;

  function formats() {
    const F = window.Html5QrcodeSupportedFormats;
    return [F.DATA_MATRIX, F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E,
      F.CODE_39, F.ITF, F.RSS_14, F.RSS_EXPANDED, F.CODABAR, F.AZTEC, F.PDF_417].filter((x) => x !== undefined);
  }
  function getScanner() {
    if (!window.Html5Qrcode) { toast('Scanner library failed to load — check your internet connection.'); return null; }
    if (!scanner) {
      scanner = new Html5Qrcode('reader', {
        formatsToSupport: formats(),
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
    }
    return scanner;
  }

  async function startCamera() {
    const s = getScanner();
    if (!s) return;
    try {
      await s.start(
        { facingMode: 'environment' },
        { fps: 12, qrbox: (w, h) => { const m = Math.floor(Math.min(w, h) * 0.8); return { width: m, height: Math.floor(m * 0.75) }; } },
        async (text) => { await stopCamera(); handleCode(text); },
        () => {}
      );
      scanning = true;
      $('btn-camera').textContent = 'Stop camera';
      $('scan-status').textContent = 'Scanning… hold the barcode steady inside the box.';
    } catch (err) {
      $('scan-status').textContent = 'Camera unavailable (' + (err && err.message ? err.message : err) +
        '). Allow camera access, use "Scan photo", or type the barcode.';
    }
  }
  async function stopCamera() {
    if (scanner && scanning) {
      scanning = false;
      try { await scanner.stop(); scanner.clear(); } catch (e) { /* already stopped */ }
    }
    $('btn-camera').textContent = 'Start camera';
  }
  $('btn-camera').addEventListener('click', () => (scanning ? stopCamera() : startCamera()));

  $('photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const s = getScanner();
    if (!s) return;
    await stopCamera();
    try {
      const text = await s.scanFile(file, false);
      handleCode(text);
    } catch (err) {
      $('scan-status').textContent = 'No barcode found in that photo. Try again closer, with good light.';
    }
  });

  // ---------- Read printed expiry date from a photo (OCR) ----------
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  let ocrWorkerPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('could not download text reader'));
      document.head.appendChild(s);
    });
  }
  function getOcrWorker(onProgress) {
    if (!ocrWorkerPromise) {
      ocrWorkerPromise = (window.Tesseract ? Promise.resolve() : loadScript(TESSERACT_URL))
        .then(() => Tesseract.createWorker('eng', 1, {
          logger: (m) => onProgress && onProgress(m),
        }))
        .catch((e) => { ocrWorkerPromise = null; throw e; });
    }
    return ocrWorkerPromise;
  }

  /** Shrink, greyscale and boost contrast so small printed/embossed text reads better. */
  async function prepareImage(file, invert) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = g; if (g < min) min = g; if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < d.length; i += 4) {
      let g = ((d[i] - min) / range) * 255;
      if (invert) g = 255 - g;
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  let ocrCurrentFile = null;
  function setOcrStatus(msg) { $('ocr-status').textContent = msg; }

  function showDateChoices(cands) {
    const box = $('ocr-chips');
    box.innerHTML = cands.slice(0, 5).map((c, i) =>
      `<button type="button" class="chip${i === 0 ? ' selected' : ''}" data-date="${c.date}">${fmtDate(c.date)}<small>“${esc(c.raw)}”</small></button>`).join('');
    box.hidden = cands.length < 2;
  }
  $('ocr-chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    $('f-expiry').value = b.dataset.date;
    $('ocr-chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('selected', x === b));
  });
  $('f-expiry').addEventListener('input', () => $('f-expiry').classList.remove('needs-check'));

  $('ocr-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    ocrCurrentFile = file;
    await stopCamera();
    const btn = $('btn-ocr');
    btn.classList.add('busy');
    $('ocr-chips').hidden = true;
    try {
      setOcrStatus('Getting text reader ready… (first time needs internet, ~10 MB)');
      const worker = await getOcrWorker((m) => {
        if (m.status === 'recognizing text') setOcrStatus(`Reading text… ${Math.round(m.progress * 100)}%`);
      });
      setOcrStatus('Reading text…');
      let text = (await worker.recognize(await prepareImage(file, false))).data.text;
      let cands = ExpiryDates.extract(text);
      if (!cands.length) {
        // Embossed/light-on-dark print often reads better inverted.
        text += '\n' + (await worker.recognize(await prepareImage(file, true))).data.text;
        cands = ExpiryDates.extract(text);
      }
      if (file !== ocrCurrentFile) return; // a newer photo was taken meanwhile
      if (!cands.length) {
        setOcrStatus('Couldn’t find a date. Try again closer, in good light, holding the phone straight — or type it in.');
        return;
      }
      $('f-expiry').value = cands[0].date;
      $('f-expiry').classList.add('needs-check');
      showDateChoices(cands);
      setOcrStatus(cands.length > 1
        ? `Found ${cands.length} dates — picked ${fmtDate(cands[0].date)}. Tap another if that’s wrong. Check against the package.`
        : `Found ${fmtDate(cands[0].date)} (read as “${cands[0].raw}”). Check it against the package.`);
      if (navigator.vibrate) navigator.vibrate(80);
      $('f-expiry').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      setOcrStatus('Couldn’t read the photo: ' + (err && err.message ? err.message : err) + '. Type the date in instead.');
    } finally {
      btn.classList.remove('busy');
    }
  });

  // ---------- Settings ----------
  $('s-warn').value = settings.warnDays;
  $('s-warn').addEventListener('change', () => {
    const v = Math.max(1, Math.min(365, parseInt($('s-warn').value, 10) || 30));
    settings.warnDays = v; $('s-warn').value = v;
    save(KEY_SETTINGS, settings);
    toast(`Warning threshold set to ${v} days`);
  });

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

  $('btn-csv').addEventListener('click', () => {
    const header = ['Name', 'Expiry', 'Days left', 'Status', 'Quantity', 'Lot', 'Location', 'Barcode', 'Notes'];
    const rows = [...items].sort((a, b) => a.expiry.localeCompare(b.expiry)).map((it) =>
      [it.name, it.expiry, daysUntil(it.expiry), status(it), it.qty, it.lot, it.location, it.barcode, it.notes]);
    download(`expiry-${todayISO()}.csv`, [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
  });

  $('btn-backup').addEventListener('click', () => {
    download(`expiry-backup-${todayISO()}.json`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items, catalog, settings }, null, 2),
      'application/json');
  });

  $('restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw new Error('not a backup file');
      if (!confirm(`Restore ${data.items.length} items? This replaces the items currently on this device.`)) return;
      items = data.items.filter((i) => i && i.name && /^\d{4}-\d{2}-\d{2}$/.test(i.expiry));
      catalog = Object.assign({}, catalog, data.catalog || {});
      if (data.settings) { settings = Object.assign(settings, data.settings); save(KEY_SETTINGS, settings); $('s-warn').value = settings.warnDays; }
      persist(); render();
      toast(`Restored ${items.length} items`);
    } catch (err) {
      toast('Could not read that file: ' + err.message);
    }
  });

  $('btn-report').addEventListener('click', () => {
    const sorted = [...items].filter((it) => status(it) !== 'ok').sort((a, b) => a.expiry.localeCompare(b.expiry));
    const rows = sorted.map((it) => `<tr><td>${esc(it.name)}</td><td>${fmtDate(it.expiry)}</td><td>${daysLabel(daysUntil(it.expiry))}</td>
      <td>${esc(it.qty)}</td><td>${esc(it.location)}</td><td>${esc(it.lot)}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to print the report.'); return; }
    w.document.write(`<!doctype html><title>Expiry report ${todayISO()}</title>
      <style>body{font:14px system-ui,sans-serif;padding:16px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#eee}</style>
      <h2>Expired &amp; expiring within ${settings.warnDays} days</h2><p>Generated ${new Date().toLocaleString()}</p>
      ${sorted.length ? `<table><tr><th>Item</th><th>Expiry</th><th>Status</th><th>Qty</th><th>Location</th><th>Lot</th></tr>${rows}</table>` : '<p>Nothing expired or expiring soon.</p>'}`);
    w.document.close();
    w.focus();
    w.print();
  });

  $('btn-wipe').addEventListener('click', () => {
    if (!items.length) return toast('Nothing to delete.');
    if (confirm(`Delete all ${items.length} items? Make a backup first if unsure.`) && confirm('Are you sure? This cannot be undone.')) {
      items = []; persist(); render(); toast('All items deleted');
    }
  });

  // ---------- Boot ----------
  render();
  // Recalculate days-left when the app comes back to the foreground on a new day.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Expose for tests / debugging.
  window.__expiry = { handleCode, daysUntil };
})();
