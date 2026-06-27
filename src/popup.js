// popup.js
const $ = id => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return '尚未同步';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function setStatusVal(id, text, empty) {
  const el = $(id);
  el.textContent = text;
  el.className = 'status-val' + (empty ? ' muted' : '');
}

async function loadStatus() {
  const data = await chrome.storage.local.get(['lastSyncTime', 'lastSyncCount']);
  const hasSync = !!data.lastSyncTime;
  setStatusVal('time', fmtTime(data.lastSyncTime), !hasSync);
  setStatusVal('count', data.lastSyncCount != null ? `${data.lastSyncCount} 个` : '无数据', !data.lastSyncCount);
}

async function loadHistory() {
  const { syncHistory } = await chrome.storage.local.get('syncHistory');
  const history = syncHistory || [];
  const el = $('historyList');
  const empty = $('historyEmpty');

  if (!history || history.length === 0) {
    empty.style.display = 'block';
    el.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  const items = history.slice(0, 3).map(h => {
    const cls = h.status === 'ok' ? 'hist-ok' : 'hist-err';
    const label = h.status === 'ok' ? '成功' : '失败';
    const detail = h.addedToLocal ? ` +${h.addedToLocal}` : '';
    return `<div class="hist-item"><span>${fmtTime(h.time)}</span><span class="${cls}">${label}${detail}</span></div>`;
  }).join('');
  el.innerHTML = items;
}

// 检查 WebDAV 配置是否完整
async function checkConfig() {
  const config = await chrome.storage.sync.get(['webdavUrl', 'username', 'password']);
  const ok = !!(config.webdavUrl && config.username && config.password);
  $('configHint').style.display = ok ? 'none' : 'block';
  $('syncBtn').disabled = !ok;
  $('status').style.display = ok ? 'block' : 'none';
  $('historyEmpty').style.display = ok ? '' : 'none';
  $('historyList').style.display = ok ? '' : 'none';
}

checkConfig().then(configured => {
  if (configured) {
    loadStatus();
    loadHistory();
  }
});

$('syncBtn').addEventListener('click', async () => {
  const btn = $('syncBtn');
  const errEl = $('error');
  const prog = $('progress');
  btn.disabled = true;
  errEl.style.display = 'none';
  prog.style.display = 'block';

  const result = await chrome.runtime.sendMessage({ action: 'sync' });
  prog.style.display = 'none';

  if (result.success) {
    await loadStatus();
    await loadHistory();
  } else {
    errEl.textContent = result.error || '同步失败，请检查配置';
    errEl.style.display = 'block';
  }
  btn.disabled = false;
});

$('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

$('goSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
