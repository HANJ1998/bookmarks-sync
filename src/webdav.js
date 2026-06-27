/**
 * WebDAV 客户端 — PUT（上传）、GET（下载）、MKCOL（建目录）、LIST、DELETE
 */
class WebDAVClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.auth = btoa(`${username}:${password}`);
  }

  _headers(extra = {}) {
    return {
      Authorization: `Basic ${this.auth}`,
      ...extra,
    };
  }

  _url(filePath) {
    return `${this.baseUrl}/${filePath.replace(/^\/+/, '')}`;
  }

  /** 创建目录 */
  async mkcol(path) {
    const res = await fetch(this._url(path), {
      method: 'MKCOL',
      headers: this._headers(),
    });
    if (res.status === 405) return;
    if (!res.ok && res.status !== 201) {
      throw new Error(`MKCOL 失败: ${res.status}`);
    }
  }

  /** 上传文件 */
  async putFile(filePath, content, contentType = 'text/html; charset=utf-8') {
    const res = await fetch(this._url(filePath), {
      method: 'PUT',
      headers: this._headers({ 'Content-Type': contentType }),
      body: content,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`上传失败 (${res.status}): ${text.slice(0, 200)}`);
    }
    return res;
  }

  /** 下载文件，不存在返回 null */
  async getFile(filePath) {
    const res = await fetch(this._url(filePath), {
      method: 'GET',
      headers: this._headers(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`下载失败 (${res.status})`);
    return res.text();
  }

  /** 删除文件 */
  async deleteFile(filePath) {
    const res = await fetch(this._url(filePath), {
      method: 'DELETE',
      headers: this._headers(),
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`删除失败 (${res.status})`);
    return true;
  }

  /** 列出目录下所有文件（PROPFIND），返回 [{ name, modified }] */
  async listFiles(dirPath) {
    const url = this._url(dirPath);
    const res = await fetch(url, {
      method: 'PROPFIND',
      headers: this._headers({ Depth: '1' }),
    });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`列出目录失败 (${res.status})`);

    const xml = await res.text();
    const files = [];

    // 兼容不同命名空间前缀（D:/d:/无前缀）的 XML 解析
    const ns = '(?:\\w+:)?';
    const responseRe = new RegExp(`<${ns}response>([\\s\\S]*?)<\\/${ns}response>`, 'gi');
    let match;
    while ((match = responseRe.exec(xml)) !== null) {
      const block = match[1];

      const hrefRe = new RegExp(`<${ns}href>(.*?)<\\/${ns}href>`, 'i');
      const hrefMatch = block.match(hrefRe);
      if (!hrefMatch) continue;
      const href = decodeURIComponent(hrefMatch[1].trim());
      if (href.endsWith('/')) continue;

      const name = href.split('/').pop();
      if (!name || name === dirPath.split('/').pop()) continue;

      const lmRe = new RegExp(`<${ns}getlastmodified>(.*?)<\\/${ns}getlastmodified>`, 'i');
      const lmMatch = block.match(lmRe);
      const modified = lmMatch ? new Date(lmMatch[1].trim()) : null;

      files.push({ name, modified, href });
    }

    return files;
  }
}
