/* ============================================================
 * 照片转 PDF
 * 对外接口：PdfModule.init()
 *          PdfModule.addImage(dataUrl, name)  // 供 Scanner 调用
 * 依赖：Saf（保存文件）、window.jspdf（jsPDF）
 * ============================================================ */
const PdfModule = (() => {
  let selectedImages = [];
  let fileInput, imgListEl, genPdfBtn, pdfNameEl;

  function readFileAsDataURL(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  }

  function loadImageObj(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = src;
    });
  }

  /* ---------------- 渲染列表 ---------------- */
  function renderImageList() {
    if (!imgListEl) return;
    imgListEl.innerHTML = '';

    selectedImages.forEach((img, index) => {
      const div = document.createElement('div');
      div.className = 'img-item';
      div.innerHTML = `
        <img src="${img.dataUrl}" />
        <div class="img-info">第 ${index + 1} 页 · ${img.name}</div>
        <div class="img-actions">
          ${index > 0 ? '<button data-action="move-up" type="button">↑</button>' : ''}
          ${index < selectedImages.length - 1 ? '<button data-action="move-down" type="button">↓</button>' : ''}
          <button class="del" data-action="remove" type="button">✕</button>
        </div>
      `;
      div.querySelector('[data-action="move-up"]')
        ?.addEventListener('click', () => moveImg(index, -1));
      div.querySelector('[data-action="move-down"]')
        ?.addEventListener('click', () => moveImg(index, 1));
      div.querySelector('[data-action="remove"]')
        ?.addEventListener('click', () => removeImg(index));
      imgListEl.appendChild(div);
    });

    if (genPdfBtn) {
      genPdfBtn.disabled = selectedImages.length === 0;
      genPdfBtn.textContent = `生成并存入文件夹 (${selectedImages.length} 张)`;
    }
  }

  function moveImg(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= selectedImages.length) return;
    [selectedImages[index], selectedImages[target]] =
      [selectedImages[target], selectedImages[index]];
    renderImageList();
  }

  function removeImg(index) {
    selectedImages.splice(index, 1);
    renderImageList();
  }

  function clearImages() {
    selectedImages = [];
    renderImageList();
  }

  /* ---------------- 供 Scanner 调用 ---------------- */
  function addImage(dataUrl, name) {
    selectedImages.push({ name, dataUrl });
    renderImageList();
  }

  /* ---------------- 生成 PDF ---------------- */
  async function generatePDF() {
    if (selectedImages.length === 0) return;
    genPdfBtn.disabled = true;
    genPdfBtn.textContent = '正在合成 PDF...';

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageW = 210, pageH = 297, margin = 10;
      const maxW = pageW - margin * 2, maxH = pageH - margin * 2;

      for (let i = 0; i < selectedImages.length; i++) {
        if (i > 0) doc.addPage();
        const imgObj = await loadImageObj(selectedImages[i].dataUrl);
        const ratio = Math.min(maxW / imgObj.width, maxH / imgObj.height);
        const drawW = imgObj.width * ratio;
        const drawH = imgObj.height * ratio;
        doc.addImage(
          selectedImages[i].dataUrl, 'JPEG',
          (pageW - drawW) / 2, (pageH - drawH) / 2,
          drawW, drawH
        );
      }

      let fileName = pdfNameEl ? pdfNameEl.value.trim() : '';
      if (!fileName) {
        const now = new Date();
        fileName = `PDF_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
      }
      if (!fileName.toLowerCase().endsWith('.pdf')) fileName += '.pdf';

      const base64Data = doc.output('datauristring').split(',')[1];
      const res = await Saf.saveFile(fileName, 'application/pdf', base64Data);

      if (!res.ok) {
        // 浏览器：走本地下载
        doc.save(fileName);
        alert(`✅ PDF 已下载：${fileName}`);
      } else {
        alert(`✅ PDF 已保存至：\n${res.displayPath}`);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      genPdfBtn.disabled = false;
      genPdfBtn.textContent = `生成并存入文件夹 (${selectedImages.length} 张)`;
    }
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    fileInput = document.getElementById('fileInput');
    imgListEl = document.getElementById('imgList');
    genPdfBtn = document.getElementById('genPdfBtn');
    pdfNameEl = document.getElementById('pdfName');
    if (!fileInput || !imgListEl) return;

    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      for (const file of files) {
        const dataUrl = await readFileAsDataURL(file);
        selectedImages.push({ name: file.name, dataUrl });
      }
      fileInput.value = '';
      renderImageList();
    });

    document.querySelector('[data-action="pick-pdf-images"]')
      ?.addEventListener('click', () => fileInput.click());

    document.querySelector('[data-action="generate-pdf"]')
      ?.addEventListener('click', generatePDF);

    document.querySelector('[data-action="clear-pdf-images"]')
      ?.addEventListener('click', clearImages);

    renderImageList();
  }

  return {
    init,
    addImage
  };
})();

// 方便 Scanner 模块引用
window.PdfModule = PdfModule;