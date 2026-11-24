/* ============================================================
 * SAF 系统文件夹选择 + 历史记录 + 统一写入
 * 对外接口：Saf.init() / Saf.saveFile(name, mime, base64)
 *          Saf.getActiveFolder() / Saf.openModal()
 * ============================================================ */
const Saf = (() => {
  let folderHistory = [];
  let activeFolder = null;

  try {
    folderHistory = JSON.parse(localStorage.getItem('toolbox_saf_history')) || [];
  } catch (e) { folderHistory = []; }
  try {
    activeFolder = JSON.parse(localStorage.getItem('toolbox_saf_active')) || null;
  } catch (e) { activeFolder = null; }

  function getActiveFolder() { return activeFolder; }

  function syncFolderUI() {
    const text = activeFolder ? activeFolder.path : '未选择（点击选择手机文件夹）';
    // 所有带 data-path-display 属性的元素都会同步显示
    document.querySelectorAll('[data-path-display]').forEach(el => {
      el.textContent = text;
    });
    localStorage.setItem('toolbox_saf_active', JSON.stringify(activeFolder));
    localStorage.setItem('toolbox_saf_history', JSON.stringify(folderHistory));
  }

  function openModal() {
    renderFolderHistory();
    const modal = document.getElementById('pathModal');
    if (modal) modal.classList.add('show');
  }

  function closeModal() {
    const modal = document.getElementById('pathModal');
    if (modal) modal.classList.remove('show');
  }

  function triggerNativePickDir() {
    if (window.NativeSAF && window.NativeSAF.pickDirectory) {
      window.NativeSAF.pickDirectory();
    } else {
      alert('当前环境不支持原生系统目录选择器，请在手机 APK 中使用。');
    }
  }

  // 供 Android 原生调用的全局回调
  window.onNativeDirPicked = function (treeUri, readablePath) {
    const now = new Date();
    const timeStr = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const idx = folderHistory.findIndex(item => item.uri === treeUri);

    let targetItem;
    if (idx !== -1) {
      targetItem = folderHistory.splice(idx, 1)[0];
      targetItem.path = readablePath;
      targetItem.lastUsed = `最近选择: ${timeStr}`;
    } else {
      targetItem = { uri: treeUri, path: readablePath, count: 0, lastUsed: `授权于 ${timeStr}` };
    }
    folderHistory.unshift(targetItem);
    activeFolder = targetItem;
    syncFolderUI();
    renderFolderHistory();
    closeModal();
  };

  function selectHistoryFolder(idx) {
    activeFolder = folderHistory[idx];
    syncFolderUI();
    closeModal();
  }

  function deleteHistoryFolder(e, idx) {
    if (e) e.stopPropagation();
    const removed = folderHistory.splice(idx, 1)[0];
    if (activeFolder && activeFolder.uri === removed.uri) {
      activeFolder = folderHistory[0] || null;
    }
    syncFolderUI();
    renderFolderHistory();
  }

  function renderFolderHistory() {
    const listEl = document.getElementById('pathHistoryList');
    if (!listEl) return;
    listEl.innerHTML = '';
    if (folderHistory.length === 0) {
      listEl.innerHTML = '<div class="hint-text" style="padding:16px 0;">暂无记录，请点击上方绿色按钮选择你的文件夹（例如 -日常保险箱）</div>';
      return;
    }
    folderHistory.forEach((item, idx) => {
      const isSelected = activeFolder && activeFolder.uri === item.uri;
      const div = document.createElement('div');
      div.className = 'history-item' + (isSelected ? ' selected' : '');
      div.onclick = () => selectHistoryFolder(idx);
      div.innerHTML = `
        <div class="history-item-info">
          <div class="history-item-name">📁 ${item.path}</div>
          <div class="history-item-sub">${item.lastUsed} · 已存 ${item.count || 0} 次</div>
        </div>
        <button class="history-del" type="button">✕</button>
      `;
      div.querySelector('.history-del').addEventListener('click', (e) => {
        deleteHistoryFolder(e, idx);
      });
      listEl.appendChild(div);
    });
  }

  /* 统一写入。返回 Promise<{ ok, displayPath }>
   * - 原生环境：写入成功返回 { ok:true, displayPath:'/xxx/yyy' }
   * - 浏览器环境：返回 { ok:false, displayPath:fileName }，调用方走 a.download */
  async function saveFile(fileName, mimeType, base64Data) {
    if (window.NativeSAF && window.NativeSAF.writeFileToTree) {
      if (!activeFolder || !activeFolder.uri) {
        openModal();
        throw new Error('请先点击上方绿色按钮选择一个保存文件夹！');
      }
      const res = window.NativeSAF.writeFileToTree(activeFolder.uri, fileName, mimeType, base64Data);
      if (typeof res === 'string' && res.startsWith('OK:')) {
        const savedFullPath = res.substring(3);
        const now = new Date();
        const timeStr = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        const idx = folderHistory.findIndex(f => f.uri === activeFolder.uri);
        if (idx !== -1) {
          folderHistory[idx].count = (folderHistory[idx].count || 0) + 1;
          folderHistory[idx].lastUsed = `最近保存: ${timeStr}`;
          activeFolder = folderHistory[idx];
          syncFolderUI();
        }
        return { ok: true, displayPath: savedFullPath };
      }
      throw new Error(typeof res === 'string' ? res.substring(4) : '原生写入返回异常');
    }
    return { ok: false, displayPath: fileName };
  }

  function bindUI() {
    // 所有 .path-bar 点击 → 打开弹窗
    document.querySelectorAll('.path-bar').forEach(el => {
      el.addEventListener('click', openModal);
    });
    // 点背景关闭
    const modal = document.getElementById('pathModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }
    // data-action 按钮
    document.querySelectorAll('[data-action="pick-dir"]').forEach(el => {
      el.addEventListener('click', triggerNativePickDir);
    });
    document.querySelectorAll('[data-action="close-path-modal"]').forEach(el => {
      el.addEventListener('click', closeModal);
    });
    syncFolderUI();
  }

  return {
    init: bindUI,
    saveFile,
    getActiveFolder,
    openModal,
    closeModal,
    deleteHistoryFolder,
    syncFolderUI
  };
})();