// options.js
const $ = id => document.getElementById(id);

// ---------- 加载配置 ----------
chrome.storage.sync.get([
  'webdavUrl', 'username', 'password', 'syncPath', 'syncInterval', 'syncMode', 'retentionDays',
], (data) => {
  $('webdavUrl').value = data.webdavUrl || 'https://dav.jianguoyun.com/dav/';
  $('username').value = data.username || '';
  $('password').value = data.password || '';
  $('syncPath').value = data.syncPath || '书签备份';
  $('syncInterval').value = String(data.syncInterval ?? '60');
  $('retentionDays').value = String(data.retentionDays ?? '365');
  // 选中同步模式 radio
  const mode = data.syncMode || 'local_first';
  const radio = document.querySelector(`input[name="syncMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
});

// ---------- 保存 ----------
$('saveBtn').addEventListener('click', () => {
  const msg = $('msg');
  const data = {
    webdavUrl: $('webdavUrl').value.trim(),
    username: $('username').value.trim(),
    password: $('password').value.trim(),
    syncPath: $('syncPath').value.trim(),
    syncInterval: parseInt($('syncInterval').value, 10) || 0,
    retentionDays: parseInt($('retentionDays').value, 10) || 0,
    syncMode: document.querySelector('input[name="syncMode"]:checked')?.value || 'local_first',
  };

  if (!data.webdavUrl || !data.username || !data.password) {
    msg.className = 'error';
    msg.textContent = 'WebDAV 地址、用户名和密码为必填项';
    return;
  }

  chrome.storage.sync.set(data, () => {
    msg.className = 'success';
    msg.textContent = '设置已保存';
    loadHistory();
    setTimeout(() => { msg.className = ''; msg.style.display = 'none'; }, 2500);
  });
});

// ---------- 同步历史 ----------
function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function loadHistory() {
  chrome.storage.local.get('syncHistory', ({ syncHistory }) => {
    const history = syncHistory || [];
    const tbody = $('historyBody');
    const empty = $('historyEmpty');
    const wrap = $('historyTableWrap');

    if (!history || history.length === 0) {
      empty.style.display = 'block';
      if (wrap) wrap.style.display = 'none';
      return;
    }

    empty.style.display = 'none';
    if (wrap) wrap.style.display = 'block';

    tbody.innerHTML = history.map(h => {
      const cls = h.status === 'ok' ? 'ok' : 'err';
      const label = h.status === 'ok' ? '成功' : '失败';
      const errTip = h.error ? `<br><span style="color:#d93025;font-size:11px">${h.error}</span>` : '';
      const warnTip = h.warning ? `<br><span style="color:#e67e22;font-size:11px">${h.warning}</span>` : '';
      const modeLabel = h.mode || '-';
      return `<tr>
        <td>${fmtTime(h.time)}</td>
        <td class="${cls}">${label}${errTip}${warnTip}</td>
        <td>${modeLabel}</td>
        <td>${h.localCount ?? '-'}</td>
        <td>${h.remoteCount ?? '-'}</td>
        <td>${h.addedToLocal ?? '0'}</td>
        <td>${h.updatedToLocal ?? '0'}</td>
        <td>${h.deletedFromLocal ?? '0'}</td>
        <td>${h.removedCount ?? '0'}</td>
        <td>${h.cleanedBackups ?? '0'}</td>
      </tr>`;
    }).join('');
  });
}

loadHistory();
