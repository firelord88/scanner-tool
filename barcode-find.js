// Find and decode a barcode anywhere in a phone photo.
//
// Decoders (ZXing) want the code roughly centred and filling much of the image, with decent contrast.
// Phone photos of supplies are the opposite: a small, faint, slightly blurry code somewhere among
// hands, text and background. So we:
//   1. try the whole photo as-is (fast path for close-ups);
//   2. boost contrast area-by-area, find "busy" patches (dense black/white like a barcode),
//      and try a few windows centred on each patch, enlarged and contrast-boosted.
// Needs the ZXing UMD build (global `ZXing`).
(function (root) {
  'use strict';

  /** In-place black/white against local average brightness. g = greyscale Float32Array. */
  function localThreshold(g, W, H, radius, offset) {
    const S = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += g[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
    }
    const out = new Uint8Array(W * H); // 1 = ink
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - radius), y1 = Math.min(H, y + radius + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - radius), x1 = Math.min(W, x + radius + 1);
        const mean = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
        out[y * W + x] = g[y * W + x] < mean - offset ? 1 : 0;
      }
    }
    return out;
  }

  function grey(ctx, W, H) {
    const d = ctx.getImageData(0, 0, W, H).data, g = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
    return g;
  }

  function makeReader() {
    const Z = root.ZXing, F = Z.BarcodeFormat, hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
      F.DATA_MATRIX, F.QR_CODE, F.CODE_128, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_39, F.ITF,
      F.RSS_14, F.RSS_EXPANDED, F.CODABAR, F.AZTEC, F.PDF_417,
    ].filter((f) => f !== undefined));
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const r = new Z.MultiFormatReader();
    r.setHints(hints);
    return r;
  }

  function decodeCanvas(reader, canvas, binarizer) {
    const Z = root.ZXing;
    try {
      const src = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const bin = binarizer === 'global' ? new Z.GlobalHistogramBinarizer(src) : new Z.HybridBinarizer(src);
      return reader.decode(new Z.BinaryBitmap(bin)).getText();
    } catch (e) {
      return null;
    } finally {
      reader.reset();
    }
  }

  /**
   * Find "busy" patches: grid cells with lots of black/white changes, joined into blobs.
   * Returns boxes {x, y, w, h} in the coordinates of the analysed (downscaled) image, best first.
   */
  function busyPatches(ink, W, H, cell) {
    const cw = Math.floor(W / cell), ch = Math.floor(H / cell);
    const busy = new Uint8Array(cw * ch);
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        let flips = 0, black = 0;
        for (let y = cy * cell; y < (cy + 1) * cell; y++) {
          for (let x = cx * cell; x < (cx + 1) * cell; x++) {
            const v = ink[y * W + x];
            black += v;
            if (x > cx * cell && v !== ink[y * W + x - 1]) flips++;
            if (y > cy * cell && v !== ink[(y - 1) * W + x]) flips++;
          }
        }
        const area = cell * cell, ratio = black / area;
        if (flips / area > 0.08 && ratio > 0.12 && ratio < 0.75) busy[cy * cw + cx] = 1;
      }
    }
    // Join neighbouring busy cells (8-connected) into blobs.
    const seen = new Uint8Array(cw * ch), boxes = [];
    for (let i = 0; i < cw * ch; i++) {
      if (!busy[i] || seen[i]) continue;
      let minX = cw, minY = ch, maxX = 0, maxY = 0, n = 0;
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop(), x = j % cw, y = (j / cw) | 0;
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, k = ny * cw + nx;
          if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && busy[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      if (n < 3) continue;
      const fill = n / (bw * bh);                         // barcodes are solid blocks, text is ragged
      const square = Math.min(bw, bh) / Math.max(bw, bh); // 2-D codes are square; 1-D codes are wide
      boxes.push({ x: minX * cell, y: minY * cell, w: bw * cell, h: bh * cell, score: fill * (0.5 + square) * Math.sqrt(n) });
    }
    return boxes.sort((a, b) => b.score - a.score);
  }

  /**
   * @param {ImageBitmap|HTMLImageElement|HTMLCanvasElement} img
   * @param {{maxTries?: number}} opts
   * @returns {string|null}
   */
  function find(img, opts) {
    if (!root.ZXing) throw new Error('barcode reader not loaded');
    const maxTries = (opts && opts.maxTries) || 40;
    const reader = makeReader();
    const W0 = img.width, H0 = img.height;
    const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });

    // 1. Whole photo (good for close-ups).
    const fullScale = Math.min(1, 1600 / Math.max(W0, H0));
    c.width = Math.round(W0 * fullScale); c.height = Math.round(H0 * fullScale);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let text = decodeCanvas(reader, c);
    if (text) return text;

    // 2. Locate barcode-like patches on a smaller copy.
    const aScale = Math.min(1, 1000 / Math.max(W0, H0));
    const W = Math.round(W0 * aScale), H = Math.round(H0 * aScale);
    c.width = W; c.height = H;
    ctx.drawImage(img, 0, 0, W, H);
    const ink = localThreshold(grey(ctx, W, H), W, H, 12, 6);
    const patches = busyPatches(ink, W, H, Math.max(6, Math.round(Math.max(W, H) / 120)));

    // 3. Try windows centred on each patch, enlarged and contrast-boosted — first level, then (for the
    //    most promising patches) turned a few angles, since hand-held photos are rarely straight.
    let tries = 0;
    const tryWindow = (p, pad, angle) => {
      const cx = (p.x + p.w / 2) / aScale, cy = (p.y + p.h / 2) / aScale;
      const pw = p.w / aScale, ph = p.h / aScale;
      const wide = ph > pw * 2.5 || pw > ph * 2.5;
      // Square-ish window for 2-D codes; keep the shape for wide 1-D barcodes.
      const side = Math.max(pw, ph) * pad;
      const ww = wide && !angle ? pw * pad : side, wh = wide && !angle ? ph * pad : side;
      const target = 600 / Math.max(ww, wh); // decode at ~600 px: enough detail, still fast
      c.width = Math.round(ww * target); c.height = Math.round(wh * target);
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.scale(target, target);
      ctx.drawImage(img, -cx, -cy);
      ctx.restore();
      let t = decodeCanvas(reader, c);
      if (t) return t;
      // Contrast-boosted copy for faint grey print.
      const g = grey(ctx, c.width, c.height);
      const bw = localThreshold(g, c.width, c.height, Math.round(Math.max(c.width, c.height) / 20), 6);
      const im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
      for (let i = 0; i < bw.length; i++) d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = bw[i] ? 0 : 255;
      ctx.putImageData(im, 0, 0);
      return decodeCanvas(reader, c, 'global');
    };
    for (const p of patches) {
      for (const pad of [1.5, 2.2]) {
        if (tries++ >= maxTries) break;
        if ((text = tryWindow(p, pad, 0))) return text;
      }
    }
    for (const p of patches.slice(0, (opts && opts.anglePatches) || 6)) {
      for (const angle of [15, -15, 30, -30, 45]) {
        if ((text = tryWindow(p, 1.6, angle))) return text;
      }
    }
    return null;
  }

  root.BarcodeFinder = { find };
})(typeof self !== 'undefined' ? self : this);
