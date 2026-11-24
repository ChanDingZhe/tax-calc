/* ============================================================
 * 离线文件扫描
 * 流程：拍照/选图 → 自动框选 + 放大镜微调 → 透视拉正 → 滤镜 → 保存
 * 对外接口：Scanner.init()
 *          Scanner.getCurrentImageDataUrl()  // 供 PDF 模块"加入列表"
 * 依赖：Saf（保存文件）
 * ============================================================ */
const Scanner = (() => {
  // DOM
  let scanInput, cropCanvas, cropCtx, resultCanvas, resultCtx;
  let detectHintEl, saveBtn;

  // 私有状态
  let rawImg = null;
  let displayScale = 1;
  let corners = [];
  let draggingIdx = -1;
  let warpedRawData = null;

  const STEP_UPLOAD = 'scan-step-upload';
  const STEP_CROP = 'scan-step-crop';
  const STEP_RESULT = 'scan-step-result';

  function showStep(id) {
    [STEP_UPLOAD, STEP_CROP, STEP_RESULT].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.display = s === id ? 'block' : 'none';
    });
  }

  /* ---------------- 入口 ---------------- */
  async function takePhoto() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera) {
        const { Camera } = window.Capacitor.Plugins;
        const photo = await Camera.getPhoto({
          quality: 90, allowEditing: false, resultType: 'dataUrl', source: 'CAMERA'
        });
        loadImage(photo.dataUrl);
      } else {
        scanInput.click();
      }
    } catch (err) {
      if (err.message && !err.message.includes('cancelled')) {
        alert('无法打开相机: ' + err.message);
      }
    }
  }

  function loadImage(dataUrl) {
    const img = new Image();
    img.onload = () => {
      rawImg = img;
      initCropCanvas();
      showStep(STEP_CROP);
    };
    img.src = dataUrl;
  }

  function initCropCanvas() {
    const maxW = Math.min(window.innerWidth - 60, 600);
    displayScale = maxW / rawImg.width;
    cropCanvas.width = rawImg.width * displayScale;
    cropCanvas.height = rawImg.height * displayScale;
    autoDetect(false);
  }

  /* ---------------- 自动检测四角 ---------------- */
  function autoDetect(isManualTrigger) {
    const targetW = 240;
    const scale = targetW / rawImg.width;
    const w = targetW;
    const h = Math.round(rawImg.height * scale);

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(rawImg, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    const gray = new Float32Array(w * h);
    let centerSum = 0, centerCnt = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const g = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        gray[y * w + x] = g;
        if (x > w * 0.3 && x < w * 0.7 && y > h * 0.3 && y < h * 0.7) {
          centerSum += g; centerCnt++;
        }
      }
    }
    const centerAvg = centerSum / (centerCnt || 1);

    const blur = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) s += gray[(y + dy) * w + (x + dx)];
        blur[y * w + x] = s / 9;
      }
    }

    const edgePts = [];
    const pad = Math.round(Math.min(w, h) * 0.03);
    for (let y = pad; y < h - pad; y++) {
      for (let x = pad; x < w - pad; x++) {
        const idx = y * w + x;
        const gx = -blur[idx - w - 1] + blur[idx - w + 1] - 2 * blur[idx - 1] + 2 * blur[idx + 1] - blur[idx + w - 1] + blur[idx + w + 1];
        const gy = -blur[idx - w - 1] - 2 * blur[idx - w] - blur[idx - w + 1] + blur[idx + w - 1] + 2 * blur[idx + w] + blur[idx + w + 1];
        const mag = Math.hypot(gx, gy);
        if (mag > 65) {
          const localBright = Math.max(blur[idx], blur[idx - 2] || 0, blur[idx + 2] || 0, blur[idx - w * 2] || 0, blur[idx + w * 2] || 0);
          if (centerAvg < 110 || localBright > centerAvg * 0.65) {
            edgePts.push({ x, y });
          }
        }
      }
    }

    let fallback = false;
    if (edgePts.length > 40) {
      let tl = edgePts[0], br = edgePts[0], tr = edgePts[0], bl = edgePts[0];
      let minSum = Infinity, maxSum = -Infinity, maxDiff = -Infinity, minDiff = Infinity;
      for (const p of edgePts) {
        const sum = p.x + p.y, diff = p.x - p.y;
        if (sum < minSum) { minSum = sum; tl = p; }
        if (sum > maxSum) { maxSum = sum; br = p; }
        if (diff > maxDiff) { maxDiff = diff; tr = p; }
        if (diff < minDiff) { minDiff = diff; bl = p; }
      }
      const area = 0.5 * Math.abs(
        tl.x * tr.y + tr.x * br.y + br.x * bl.y + bl.x * tl.y -
        (tr.x * tl.y + br.x * tr.y + bl.x * br.y + tl.x * bl.y)
      );
      const ratio = area / (w * h);
      if (ratio > 0.15 && ratio < 0.96) {
        corners = [
          { x: tl.x / scale, y: tl.y / scale },
          { x: tr.x / scale, y: tr.y / scale },
          { x: br.x / scale, y: br.y / scale },
          { x: bl.x / scale, y: bl.y / scale }
        ];
        detectHintEl.textContent = '✨ 已自动吸附纸张四角（按住绿点拖动可用放大镜微调）';
      } else {
        fallback = true;
      }
    } else {
      fallback = true;
    }

    if (fallback) {
      const padX = rawImg.width * 0.1;
      const padY = rawImg.height * 0.1;
      corners = [
        { x: padX, y: padY },
        { x: rawImg.width - padX, y: padY },
        { x: rawImg.width - padX, y: rawImg.height - padY },
        { x: padX, y: rawImg.height - padY }
      ];
      detectHintEl.textContent = isManualTrigger
        ? '背景对比度较低，请手动拖动 4 个绿点对齐纸角'
        : '请拖动 4 个绿色圆点对准纸张四角（支持放大镜微调）';
    }

    drawCropUI();
  }

  function selectFullImage() {
    if (!rawImg) return;
    corners = [
      { x: 0, y: 0 },
      { x: rawImg.width, y: 0 },
      { x: rawImg.width, y: rawImg.height },
      { x: 0, y: rawImg.height }
    ];
    drawCropUI();
  }

  /* ---------------- 画框选 UI ---------------- */
  function drawCropUI() {
    if (!rawImg) return;
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.drawImage(rawImg, 0, 0, cropCanvas.width, cropCanvas.height);

    cropCtx.fillStyle = 'rgba(0,0,0,0.45)';
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

    cropCtx.save();
    cropCtx.beginPath();
    corners.forEach((p, i) => {
      const sx = p.x * displayScale, sy = p.y * displayScale;
      if (i === 0) cropCtx.moveTo(sx, sy); else cropCtx.lineTo(sx, sy);
    });
    cropCtx.closePath();
    cropCtx.clip();
    cropCtx.drawImage(rawImg, 0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.restore();

    cropCtx.strokeStyle = '#69f0ae';
    cropCtx.lineWidth = 2.5;
    cropCtx.beginPath();
    corners.forEach((p, i) => {
      const sx = p.x * displayScale, sy = p.y * displayScale;
      if (i === 0) cropCtx.moveTo(sx, sy); else cropCtx.lineTo(sx, sy);
    });
    cropCtx.closePath();
    cropCtx.stroke();

    corners.forEach((p) => {
      const sx = p.x * displayScale, sy = p.y * displayScale;
      cropCtx.beginPath();
      cropCtx.arc(sx, sy, 14, 0, Math.PI * 2);
      cropCtx.fillStyle = 'rgba(105,240,174,0.35)';
      cropCtx.fill();
      cropCtx.beginPath();
      cropCtx.arc(sx, sy, 7, 0, Math.PI * 2);
      cropCtx.fillStyle = '#69f0ae';
      cropCtx.fill();
      cropCtx.strokeStyle = '#000';
      cropCtx.lineWidth = 1.5;
      cropCtx.stroke();
    });

    if (draggingIdx !== -1) {
      const activePt = corners[draggingIdx];
      const magRadius = 46;
      const magX = (activePt.x * displayScale < cropCanvas.width / 2)
        ? cropCanvas.width - magRadius - 12
        : magRadius + 12;
      const magY = magRadius + 12;

      cropCtx.save();
      cropCtx.beginPath();
      cropCtx.arc(magX, magY, magRadius, 0, Math.PI * 2);
      cropCtx.clip();
      cropCtx.fillStyle = '#000';
      cropCtx.fillRect(magX - magRadius, magY - magRadius, magRadius * 2, magRadius * 2);

      const zoom = 2.2;
      const srcSize = (magRadius * 2) / zoom / displayScale;
      cropCtx.drawImage(
        rawImg,
        activePt.x - srcSize / 2, activePt.y - srcSize / 2, srcSize, srcSize,
        magX - magRadius, magY - magRadius, magRadius * 2, magRadius * 2
      );

      cropCtx.strokeStyle = '#69f0ae';
      cropCtx.lineWidth = 1.5;
      cropCtx.beginPath();
      cropCtx.moveTo(magX - 14, magY); cropCtx.lineTo(magX + 14, magY);
      cropCtx.moveTo(magX, magY - 14); cropCtx.lineTo(magX, magY + 14);
      cropCtx.stroke();
      cropCtx.restore();

      cropCtx.beginPath();
      cropCtx.arc(magX, magY, magRadius, 0, Math.PI * 2);
      cropCtx.strokeStyle = '#69f0ae';
      cropCtx.lineWidth = 3;
      cropCtx.stroke();
    }
  }

  /* ---------------- 指针事件 ---------------- */
  function getPointerPos(e) {
    const rect = cropCanvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) / displayScale, y: (clientY - rect.top) / displayScale };
  }

  function onPointerDown(e) {
    if (!rawImg) return;
    const pos = getPointerPos(e);
    const hitRadius = 42 / displayScale;
    let minDist = hitRadius;
    draggingIdx = -1;
    corners.forEach((p, idx) => {
      const d = Math.hypot(p.x - pos.x, p.y - pos.y);
      if (d < minDist) { minDist = d; draggingIdx = idx; }
    });
    if (draggingIdx !== -1) drawCropUI();
  }

  function onPointerMove(e) {
    if (draggingIdx === -1 || !rawImg) return;
    e.preventDefault();
    const pos = getPointerPos(e);
    corners[draggingIdx].x = Math.max(0, Math.min(rawImg.width, pos.x));
    corners[draggingIdx].y = Math.max(0, Math.min(rawImg.height, pos.y));
    drawCropUI();
  }

  function onPointerUp() {
    if (draggingIdx !== -1) {
      draggingIdx = -1;
      drawCropUI();
    }
  }

  /* ---------------- 透视拉正 ---------------- */
  function computeHomography(srcPts, dstPts) {
    const A = [];
    for (let i = 0; i < 4; i++) {
      const sx = srcPts[i].x, sy = srcPts[i].y;
      const dx = dstPts[i].x, dy = dstPts[i].y;
      A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
      A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]];
      for (let k = i + 1; k < n; k++) {
        const factor = A[k][i] / A[i][i];
        for (let j = i; j <= n; j++) A[k][j] -= factor * A[i][j];
      }
    }
    const h = new Array(9);
    h[8] = 1;
    for (let i = n - 1; i >= 0; i--) {
      let sum = A[i][n];
      for (let j = i + 1; j < n; j++) sum -= A[i][j] * h[j];
      h[i] = sum / A[i][i];
    }
    return h;
  }

  function processPerspective() {
    if (!rawImg) return;
    const topW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const botW = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
    const leftH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    const rightH = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

    let outW = Math.round(Math.max(topW, botW));
    let outH = Math.round(Math.max(leftH, rightH));
    const maxDim = 1800;
    if (outW > maxDim || outH > maxDim) {
      const s = maxDim / Math.max(outW, outH);
      outW = Math.round(outW * s);
      outH = Math.round(outH * s);
    }

    const offCanvas = document.createElement('canvas');
    offCanvas.width = rawImg.width;
    offCanvas.height = rawImg.height;
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(rawImg, 0, 0);
    const srcData = offCtx.getImageData(0, 0, rawImg.width, rawImg.height).data;
    const srcW = rawImg.width, srcH = rawImg.height;

    const dstRect = [
      { x: 0, y: 0 }, { x: outW, y: 0 },
      { x: outW, y: outH }, { x: 0, y: outH }
    ];
    const H = computeHomography(dstRect, corners);

    resultCanvas.width = outW;
    resultCanvas.height = outH;
    const outImgData = resultCtx.createImageData(outW, outH);
    const dst = outImgData.data;

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const w = H[6] * x + H[7] * y + H[8];
        const sx = (H[0] * x + H[1] * y + H[2]) / w;
        const sy = (H[3] * x + H[4] * y + H[5]) / w;

        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const dstIdx = (y * outW + x) * 4;

        if (x0 >= 0 && x0 < srcW - 1 && y0 >= 0 && y0 < srcH - 1) {
          const dx = sx - x0, dy = sy - y0;
          const w00 = (1 - dx) * (1 - dy);
          const w10 = dx * (1 - dy);
          const w01 = (1 - dx) * dy;
          const w11 = dx * dy;

          const i00 = (y0 * srcW + x0) * 4;
          const i10 = i00 + 4;
          const i01 = i00 + srcW * 4;
          const i11 = i01 + 4;

          dst[dstIdx]     = srcData[i00]*w00 + srcData[i10]*w10 + srcData[i01]*w01 + srcData[i11]*w11;
          dst[dstIdx + 1] = srcData[i00+1]*w00 + srcData[i10+1]*w10 + srcData[i01+1]*w01 + srcData[i11+1]*w11;
          dst[dstIdx + 2] = srcData[i00+2]*w00 + srcData[i10+2]*w10 + srcData[i01+2]*w01 + srcData[i11+2]*w11;
          dst[dstIdx + 3] = 255;
        } else {
          dst[dstIdx] = dst[dstIdx+1] = dst[dstIdx+2] = 255;
          dst[dstIdx + 3] = 255;
        }
      }
    }

    warpedRawData = outImgData;
    applyFilter('enhance');
    showStep(STEP_RESULT);
  }

  /* ---------------- 滤镜 ---------------- */
  function applyFilter(type) {
    if (!warpedRawData) return;

    document.querySelectorAll('.filter-bar button').forEach(btn => {
      btn.classList.toggle('active', btn.id === 'flt-' + type);
    });

    const w = warpedRawData.width;
    const h = warpedRawData.height;
    const output = resultCtx.createImageData(w, h);
    const src = warpedRawData.data;
    const dst = output.data;

    let avg = 0;
    for (let i = 0; i < src.length; i += 4) {
      avg += src[i] * 0.299 + src[i+1] * 0.587 + src[i+2] * 0.114;
    }
    avg /= (src.length / 4);

    for (let i = 0; i < src.length; i += 4) {
      let r = src[i], g = src[i+1], b = src[i+2];

      if (type === 'orig') {
        dst[i] = r; dst[i+1] = g; dst[i+2] = b; dst[i+3] = 255;
        continue;
      }

      const gray = r * 0.299 + g * 0.587 + b * 0.114;

      if (type === 'enhance') {
        let v = (gray - avg) * 1.55 + 220;
        v = Math.max(0, Math.min(255, v));
        dst[i] = dst[i+1] = dst[i+2] = v;
        dst[i+3] = 255;
      } else if (type === 'hd') {
        const contrast = 1.8;
        r = ((r - 128) * contrast) + 128;
        g = ((g - 128) * contrast) + 128;
        b = ((b - 128) * contrast) + 128;
        r += 18; g += 18; b += 18;
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        dst[i] = r; dst[i+1] = g; dst[i+2] = b; dst[i+3] = 255;
      } else if (type === 'bw') {
        const threshold = avg > 160 ? avg - 10 : avg + 15;
        const v = gray > threshold ? 255 : 0;
        dst[i] = dst[i+1] = dst[i+2] = v;
        dst[i+3] = 255;
      }
    }

    resultCtx.putImageData(output, 0, 0);
  }

  /* ---------------- 步骤切换 ---------------- */
  function backToCrop() {
    showStep(STEP_CROP);
  }

  function resetScan() {
    rawImg = null;
    warpedRawData = null;
    corners = [];
    showStep(STEP_UPLOAD);
  }

  /* ---------------- 保存 ---------------- */
  async function saveScanFile() {
    if (!warpedRawData) return;
    saveBtn.disabled = true;
    saveBtn.textContent = '正在保存...';

    try {
      const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.92);
      const now = new Date();
      const fileName = `Scan_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.jpg`;
      const base64Data = dataUrl.split(',')[1];

      const res = await Saf.saveFile(fileName, 'image/jpeg', base64Data);
      if (!res.ok) {
        // 浏览器环境：直接下载
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        a.click();
        alert(`✅ 已下载：${fileName}`);
      } else {
        alert(`✅ 已保存至：\n${res.displayPath}`);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '存入文件夹';
    }
  }

  /* ---------------- 对外：给 PDF 模块用 ---------------- */
  function getCurrentImageDataUrl() {
    if (!warpedRawData) return null;
    return resultCanvas.toDataURL('image/jpeg', 0.92);
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    scanInput = document.getElementById('scanInput');
    cropCanvas = document.getElementById('cropCanvas');
    resultCanvas = document.getElementById('resultCanvas');
    if (!scanInput || !cropCanvas || !resultCanvas) return;

    cropCtx = cropCanvas.getContext('2d');
    resultCtx = resultCanvas.getContext('2d');
    detectHintEl = document.getElementById('detectHint');
    saveBtn = document.getElementById('saveScanBtn');

    // 拍照 / 选图
    document.querySelector('[data-action="take-photo"]')
      ?.addEventListener('click', takePhoto);
    document.querySelector('[data-action="pick-album"]')
      ?.addEventListener('click', () => scanInput.click());
    scanInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => loadImage(ev.target.result);
      reader.readAsDataURL(file);
      scanInput.value = '';
    });

    // 框选步骤按钮
    document.querySelector('[data-action="reset-scan"]')
      ?.addEventListener('click', resetScan);
    document.querySelector('[data-action="auto-detect"]')
      ?.addEventListener('click', () => autoDetect(true));
    document.querySelector('[data-action="select-full"]')
      ?.addEventListener('click', selectFullImage);
    document.querySelector('[data-action="process-perspective"]')
      ?.addEventListener('click', processPerspective);

    // 结果步骤按钮
    document.querySelectorAll('.filter-bar button').forEach(btn => {
      btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
    });
    document.querySelector('[data-action="back-to-crop"]')
      ?.addEventListener('click', backToCrop);
    saveBtn?.addEventListener('click', saveScanFile);
    document.querySelector('[data-action="add-scan-to-pdf"]')
      ?.addEventListener('click', () => {
        const dataUrl = getCurrentImageDataUrl();
        if (!dataUrl) { alert('请先完成扫描并预览结果'); return; }
        const now = new Date();
        const fakeName = `扫描_${now.getHours()}${now.getMinutes()}${now.getSeconds()}.jpg`;
        if (window.PdfModule && window.PdfModule.addImage) {
          window.PdfModule.addImage(dataUrl, fakeName);
          alert('✅ 已加入 PDF 列表，可继续扫描或直接生成 PDF');
        } else {
          alert('PDF 模块未就绪');
        }
      });

    // Canvas 指针事件
    cropCanvas.addEventListener('touchstart', onPointerDown, { passive: false });
    cropCanvas.addEventListener('touchmove', onPointerMove, { passive: false });
    cropCanvas.addEventListener('touchend', onPointerUp);
    cropCanvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
  }

  return {
    init,
    getCurrentImageDataUrl
  };
})();