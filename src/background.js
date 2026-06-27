// background.js — Service Worker
// 真双向同步（可加可减）+ 定时同步 + 同步历史
// 核心思路：记录上次同步快照 lastSyncItems，对比增量
importScripts('webdav.js');

/** 同步锁，防止并发 sync 导致 lastSyncItems 读取到过期值 */
let _syncing = false;// ============================================================
//  书签数据转换
// ============================================================

function flattenBookmarks(nodes, parentPath = []) {
  const items = [];
  for (const node of nodes) {
    if (node.url) {
      items.push({
        url: node.url,
        title: node.title || '',
        dateAdded: node.dateAdded || 0,
        folderPath: [...parentPath],
      });
    }
    if (node.children) {
      const name = node.title || '';
      const subPath = name ? [...parentPath, name] : parentPath;
      items.push(...flattenBookmarks(node.children, subPath));
    }
  }
  return items;
}

function buildUrlMap(items) {
  const m = new Map();
  for (const it of items) {
    if (it.url && !m.has(it.url)) m.set(it.url, it);
  }
  return m;
}

function buildSyncJSON(items) {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  }, null, 2);
}

function bookmarksToHTML(nodes, depth = 0) {
  let html = '';
  const indent = '  '.repeat(depth);
  for (const node of nodes) {
    if (node.url) {
      const t = (node.title || '').replace(/"/g, '&quot;');
      html += `${indent}<DT><A HREF="${node.url}" ADD_DATE="${Math.floor((node.dateAdded || 0) / 1000)}">${t}</A>\n`;
    } else if (node.children) {
      const t = (node.title || '未命名').replace(/"/g, '&quot;');
      html += `${indent}<DT><H3>${t}</H3>\n${indent}<DL><p>\n`;
      html += bookmarksToHTML(node.children, depth + 1);
      html += `${indent}</DL><p>\n`;
    }
  }
  return html;
}

function exportBookmarkHTML(tree) {
  const now = new Date();
  const ds = now.toISOString().replace(/T/, ' ').slice(0, 19);
  const body = bookmarksToHTML(tree);
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Edge 书签 - ${ds}</TITLE>
<H1>Edge 书签</H1>
<DL><p>
${body}</DL><p>
`;
}

// ============================================================
//  浏览器操作（添加 / 删除 / 更新）
// ============================================================

/** 确保文件夹路径存在，返回最终文件夹 id */
async function ensureFolderPath(rootId, segments) {
  let parentId = rootId;
  for (const seg of segments) {
    const children = await chrome.bookmarks.getChildren(parentId);
    let found = children.find(c => !c.url && c.title === seg);
    if (!found) found = await chrome.bookmarks.create({ parentId, title: seg });
    parentId = found.id;
  }
  return parentId;
}

/** 将一条远程书签写入本地浏览器 */
async function addBookmarkToLocal(item, rootMap) {
  if (!item.url) return false;
  const [rootName, ...sub] = item.folderPath || [];
  const rootId = rootMap[rootName];
  if (!rootId) return false;
  try {
    const parentId = sub.length > 0 ? await ensureFolderPath(rootId, sub) : rootId;
    await chrome.bookmarks.create({ parentId, title: item.title || '', url: item.url });
    return true;
  } catch (_) {
    return false;
  }
}

/** 更新本地书签标题（取 dateAdded 较新的） */
async function updateBookmarkTitle(url, newTitle, remoteDateAdded) {
  try {
    const results = await chrome.bookmarks.search({ url });
    if (results.length === 0) return false;
    const local = results[0];
    // 只更新如果远程 dateAdded 更新
    if (remoteDateAdded > (local.dateAdded || 0)) {
      await chrome.bookmarks.update(local.id, { title: newTitle });
      return true;
    }
  } catch (_) {}
  return false;
}

/** 从浏览器删除指定 URL 的书签（首条） */
async function deleteBookmarkByUrl(url) {
  try {
    const results = await chrome.bookmarks.search({ url });
    let deleted = 0;
    for (const bm of results) {
      await chrome.bookmarks.remove(bm.id);
      deleted++;
    }
    return deleted;
  } catch (_) {
    return 0;
  }
}

/** 清空所有书签（保留根目录，删其下所有子节点） */
async function clearAllBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  for (const root of tree[0].children || []) {
    const children = await chrome.bookmarks.getChildren(root.id);
    for (const child of children) {
      await chrome.bookmarks.removeTree(child.id);
    }
  }
}

/** 从坚果云下载远程书签数据 */
async function fetchRemoteItems(client, syncPath) {
  try {
    const raw = await client.getFile(`${syncPath}/Edge书签_数据.json`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version && Array.isArray(parsed.items)) {
        return parsed.items.filter(i => i.url);
      }
    }
  } catch (_) {}
  return [];
}

/** 清理超过 retentionDays 的备份文件 */
async function cleanOldBackups(client, syncPath, retentionDays) {
  if (retentionDays <= 0) return;
  try {
    const files = await client.listFiles(syncPath);
    const cutoff = Date.now() - retentionDays * 86400000;
    let cleaned = 0;
    for (const f of files) {
      if (!f.name.startsWith('Edge书签_备份_')) continue;
      if (f.modified && f.modified.getTime() < cutoff) {
        await client.deleteFile(`${syncPath}/${f.name}`);
        cleaned++;
      }
    }
    return cleaned;
  } catch (_) {
    return 0; // 清理失败不影响主流程
  }
}

// ============================================================
//  定时同步
// ============================================================

async function setupAlarm() {
  const { syncInterval } = await chrome.storage.sync.get('syncInterval');
  const min = syncInterval || 0;
  await chrome.alarms.clear('bookmarkSync');
  if (min > 0) {
    chrome.alarms.create('bookmarkSync', { periodInMinutes: min });
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'bookmarkSync') runFullSync();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.syncInterval) setupAlarm();
});

setupAlarm();

// ============================================================
//  核心同步
// ============================================================

async function runFullSync() {
  if (_syncing) return { success: false, error: '同步正在进行中，请稍后再试' };
  _syncing = true;
  const history = { status: 'ok' };
  try {
    // ---- 0. 加载配置 ----
    const config = await chrome.storage.sync.get([
      'webdavUrl', 'username', 'password', 'syncPath', 'syncMode', 'retentionDays',
    ]);
    if (!config.webdavUrl || !config.username || !config.password) {
      throw new Error('请先在设置页中配置 WebDAV 连接信息');
    }

    const syncMode = config.syncMode || 'local_first';
    const syncPath = (config.syncPath || '书签备份').replace(/^\/+|\/+$/g, '');
    const retentionDays = config.retentionDays ?? 365;
    const client = new WebDAVClient(config.webdavUrl, config.username, config.password);

    // ---- 1. 读取本地书签 ----
    const tree = await chrome.bookmarks.getTree();
    const localItems = flattenBookmarks(tree);
    history.localCount = localItems.length;

    // 根目录映射
    const rootFolders = tree[0].children || [];
    const rootMap = {};
    for (const rf of rootFolders) rootMap[rf.title] = rf.id;

    // ---- 2. 备份当前状态到坚果云（仅书签有变化时才备份）----
    const { lastSyncItems } = await chrome.storage.local.get('lastSyncItems');
    const hasChanged = !lastSyncItems || JSON.stringify(localItems) !== JSON.stringify(lastSyncItems);
    if (hasChanged) {
      const backupTS = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      await client.putFile(
        `${syncPath}/Edge书签_备份_${backupTS}.json`,
        buildSyncJSON(localItems),
        'application/json; charset=utf-8'
      );
    }

    // ---- 3. 按模式执行同步 ----
    if (syncMode === 'local_first') {
      // 4a. 以本地为准：只上传，不下载远程
      history.mode = '本地为准';

    } else if (syncMode === 'cloud_first') {
      // 4b. 以云端为准：清空浏览器，从远程重建
      history.mode = '云端为准';
      const remoteItems = await fetchRemoteItems(client, syncPath);
      history.remoteCount = remoteItems.length;
      if (remoteItems.length > 0) {
        await clearAllBookmarks();
        let added = 0;
        for (const ri of remoteItems) {
          if (await addBookmarkToLocal(ri, rootMap)) added++;
        }
        history.addedToLocal = added;
        history.removedCount = localItems.length;
      } else {
        history.warning = '远程数据为空，本次同步未作任何更改';
      }

    } else {
      // 4c. 双向同步（默认）
      history.mode = '双向同步';
      const remoteItems = await fetchRemoteItems(client, syncPath);
      history.remoteCount = remoteItems.length;
      const hasSnapshot = Array.isArray(lastSyncItems) && lastSyncItems.length > 0;

      if (!hasSnapshot) {
        // 首次同步 / 快照丢失 → add-only
        const localByUrl = buildUrlMap(localItems);
        let added = 0, updated = 0;
        for (const ri of remoteItems) {
          if (!localByUrl.has(ri.url)) {
            if (await addBookmarkToLocal(ri, rootMap)) added++;
          } else if (ri.title !== localByUrl.get(ri.url).title) {
            if (await updateBookmarkTitle(ri.url, ri.title, ri.dateAdded)) updated++;
          }
        }
        history.addedToLocal = added;
        history.updatedToLocal = updated;
        if (!hasSnapshot && lastSyncItems !== undefined) {
          history.warning = '本地快照丢失，暂仅合并新增条目，不执行删除操作';
        }

      } else if (remoteItems.length === 0) {
        // 远程数据为空 → 数据异常，仅上传不删除
        const localByUrl = buildUrlMap(localItems);
        const lastByUrl = buildUrlMap(lastSyncItems);
        let added = 0, updated = 0;
        for (const ri of lastSyncItems) {
          if (!localByUrl.has(ri.url)) {
            if (await addBookmarkToLocal(ri, rootMap)) added++;
          }
        }
        for (const ri of remoteItems) {
          if (!localByUrl.has(ri.url)) {
            if (await addBookmarkToLocal(ri, rootMap)) added++;
          }
        }
        history.addedToLocal = added;
        history.updatedToLocal = updated;
        history.warning = '远程数据为空，暂仅恢复本地缺失条目，不执行删除操作';

      } else {
        // 真双向同步（可加可减）
        const localByUrl = buildUrlMap(localItems);
        const remoteByUrl = buildUrlMap(remoteItems);
        const lastByUrl = buildUrlMap(lastSyncItems);

        let added = 0, updated = 0, deleted = 0;

        for (const [url] of lastByUrl) {
          if (!remoteByUrl.has(url) && localByUrl.has(url)) {
            deleted += await deleteBookmarkByUrl(url);
          }
        }
        for (const [url, ri] of remoteByUrl) {
          if (!lastByUrl.has(url) && !localByUrl.has(url)) {
            if (await addBookmarkToLocal(ri, rootMap)) added++;
          }
        }
        for (const [url, ri] of remoteByUrl) {
          const loc = localByUrl.get(url);
          if (loc && ri.title !== loc.title) {
            if (await updateBookmarkTitle(url, ri.title, ri.dateAdded)) updated++;
          }
        }

        let localDeletedCount = 0;
        for (const [url] of lastByUrl) {
          if (!localByUrl.has(url)) localDeletedCount++;
        }

        history.addedToLocal = added;
        history.updatedToLocal = updated;
        history.deletedFromLocal = deleted;
        history.deletedFromRemote = localDeletedCount;
      }
    }

    // ---- 5. 读取合并后的书签，上传 ----
    const mergedTree = await chrome.bookmarks.getTree();
    const mergedItems = flattenBookmarks(mergedTree);
    const jsonStr = buildSyncJSON(mergedItems);
    const htmlStr = exportBookmarkHTML(mergedTree);
    const dateStr = new Date().toISOString().slice(0, 10);

    await client.putFile(`${syncPath}/Edge书签_数据.json`, jsonStr, 'application/json; charset=utf-8');
    await client.putFile(`${syncPath}/Edge书签_最新.html`, htmlStr, 'text/html; charset=utf-8');
    await client.putFile(`${syncPath}/Edge书签_${dateStr}.html`, htmlStr, 'text/html; charset=utf-8');

    // ---- 6. 清理过期备份 ----
    const cleaned = await cleanOldBackups(client, syncPath, retentionDays);
    history.cleanedBackups = cleaned || 0;

    // ---- 7. 保存快照 + 状态（原子写入，单次 set 避免 SW 被终止）----
    history.mergedCount = mergedItems.length;

    const prev = await chrome.storage.local.get('syncHistory');
    const sh = prev.syncHistory || [];
    sh.unshift({
      time: Date.now(),
      status: 'ok',
      mode: history.mode || '',
      localCount: history.localCount,
      remoteCount: history.remoteCount,
      addedToLocal: history.addedToLocal ?? 0,
      updatedToLocal: history.updatedToLocal ?? 0,
      deletedFromLocal: history.deletedFromLocal ?? 0,
      removedCount: history.removedCount ?? 0,
      cleanedBackups: history.cleanedBackups ?? 0,
      error: '',
      warning: history.warning || '',
    });
    if (sh.length > 20) sh.length = 20;

    await chrome.storage.local.set({
      lastSyncItems: mergedItems,
      lastSyncTime: Date.now(),
      lastSyncCount: mergedItems.length,
      syncHistory: sh,
    });
    _syncing = false;
    return { success: true, count: mergedItems.length, ...history };

  } catch (e) {
    _syncing = false;
    // 错误时也尝试保存历史（失败不抛出，避免 SW 崩溃）
    try {
      const prev = await chrome.storage.local.get('syncHistory');
      const sh = prev.syncHistory || [];
      sh.unshift({
        time: Date.now(),
        status: 'error',
        mode: history.mode || '',
        localCount: history.localCount || 0,
        remoteCount: history.remoteCount || 0,
        addedToLocal: 0,
        updatedToLocal: 0,
        deletedFromLocal: 0,
        removedCount: 0,
        cleanedBackups: 0,
        error: e.message,
        warning: '',
      });
      if (sh.length > 20) sh.length = 20;
      await chrome.storage.local.set({
        lastSyncTime: Date.now(),
        syncHistory: sh,
      });
    } catch (_) { /* 历史写入失败也不影响主流程 */ }
    throw e;
  }
}

// ============================================================
//  消息处理
// ============================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sync') {
    runFullSync()
      .then(r => sendResponse(r))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (request.action === 'getStatus') {
    chrome.storage.local.get(['lastSyncTime', 'lastSyncCount'])
      .then(d => sendResponse(d));
    return true;
  }
  if (request.action === 'getHistory') {
    chrome.storage.local.get('syncHistory')
      .then(({ syncHistory }) => sendResponse(syncHistory || []));
    return true;
  }
});
