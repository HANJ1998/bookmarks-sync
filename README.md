<div align="center">

# 一键书签同步

**将浏览器书签通过 WebDAV 同步至私有云存储，支持定时自动备份与双向同步**

[![GitHub Release](https://img.shields.io/github/v/release/HANJ1998/bookmarks-sync?style=flat-square&logo=github&color=1a73e8)](https://github.com/HANJ1998/bookmarks-sync/releases)
[![GitHub License](https://img.shields.io/github/license/HANJ1998/bookmarks-sync?style=flat-square&color=1a73e8)](LICENSE)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/HANJ1998/bookmarks-sync?style=flat-square&color=1a73e8)](https://github.com/HANJ1998/bookmarks-sync/commits/main)
[![GitHub Stars](https://img.shields.io/github/stars/HANJ1998/bookmarks-sync?style=flat-square&color=1a73e8)](https://github.com/HANJ1998/bookmarks-sync/stargazers)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge-1a73e8?style=flat-square)](#兼容性)

</div>

---

## 目录

- [功能亮点](#功能亮点)
- [截图](#截图)
- [快速开始](#快速开始)
- [同步模式](#同步模式)
- [备份策略](#备份策略)
- [兼容性](#兼容性)
- [常见问题](#常见问题)
- [开发](#开发)
- [隐私](#隐私)
- [许可证](#许可证)

---

## 功能亮点

| 功能 | 说明 |
|---|---|
| 一键同步 | 点击工具栏图标即可将书签备份到云端 |
| 定时自动备份 | 支持每小时 / 每6小时 / 每12小时 / 每天 |
| 三种同步模式 | 本地优先、双向同步、云端优先 |
| 增量对比 | 书签无变化时不上传任何文件，避免版本堆积 |
| 备份自动清理 | 可配置保留天数，过期备份自动删除 |
| 同步历史 | 记录最近 20 次同步详情 |
| 多浏览器支持 | Chrome / Edge 均可使用 |
| 数据私有 | 书签仅保存在你自己的 WebDAV 服务器 |

## 截图

> 扩展弹窗 &nbsp;·&nbsp; 设置页面 &nbsp;·&nbsp; 同步历史

```
┌──────────────────────┐   ┌──────────────────────────────┐
│ ▌ 书签同步            │   │  设置                        │
│                      │   │  一键书签同步 · WebDAV         │
│  上次同步    刚刚      │   │                              │
│  书签数量    236 个    │   │  ┌ WebDAV 连接 ─────────────┐ │
│                      │   │  │ 服务器地址    [input]      │ │
│  ┌──────────────────┐│   │  │ 用户名        [input]      │ │
│  │    立即同步       ││   │  │ 密码          [input]      │ │
│  └──────────────────┘│   │  └───────────────────────────┘ │
│                      │   │  ┌ 备份设置 ─────────────────┐ │
│  最近同步             │   │  │ 保存目录      [书签备份]   │ │
│  00:15  成功          │   │  │ 自动同步      [每小时 ▾]   │ │
│  00:00  成功          │   │  │ 备份保留      [365天 ▾]   │ │
│  23:45  失败          │   │  │ 同步模式      ○ 本地为准   │ │
│                      │   │  │               ○ 双向同步   │ │
│             高级设置  │   │  │               ○ 云端为准   │ │
└──────────────────────┘   │  │           [保存设置]       │ │
                           │  └───────────────────────────┘ │
                           │  ┌ 同步历史 ─────────────────┐ │
                           │  │  时间   结果  模式  书签   │ │
                           │  │  00:15  成功  本地  236   │ │
                           │  └───────────────────────────┘ │
                           └──────────────────────────────┘
```

## 快速开始

### 从 Release 安装

1. 前往 [Releases](https://github.com/HANJ1998/bookmarks-sync/releases) 下载最新版 `bookmarks-sync-v*.zip`
2. 解压到本地目录
3. 打开 Chrome 或 Edge 浏览器
4. 进入扩展管理页：`chrome://extensions` 或 `edge://extensions`
5. 开启右上角的「开发者模式」
6. 点击「加载解压缩的扩展」→ 选择解压后的文件夹

### 首次配置

1. 点击浏览器工具栏的扩展图标
2. 点击「高级设置」
3. 填写 WebDAV 连接信息

   | 字段 | 说明 | 示例 |
   |---|---|---|
   | 服务器地址 | WebDAV 服务地址 | `https://dav.jianguoyun.com/dav/` |
   | 用户名 | WebDAV 账号（坚果云为注册邮箱） | `user@example.com` |
   | 密码 | WebDAV 密码（坚果云需用应用密码） | — |

4. 选择同步间隔和模式
5. 点击「保存设置」
6. 返回弹窗点击「立即同步」

> 坚果云用户：坚果云 → 设置 → 第三方应用管理 → **添加应用密码**，用生成的密码填入上述密码字段。

## 同步模式

| 模式 | 适用场景 | 行为 |
|---|---|---|
| 以本地为准（推荐） | 日常使用，仅将浏览器书签备份到云端 | 上传覆盖云端，不考虑云端更改 |
| 双向同步 | 多台设备共用，需要云端与浏览器互相合并 | 基于快照对比增量，可加可减 |
| 以云端为准 | 新设备恢复 / 回滚 | 清空浏览器书签，从云端重建 |

## 备份策略

每次同步遵循以下流程：

```
读取浏览器书签 → 检测是否有变化
  ├─ 无变化 → 不上传任何文件（避免坚果云版本堆积）
  └─ 有变化 → 创建备份 → 同步 → 上传数据 → 清理过期备份
```

云端文件结构：

```
书签备份/
├── Edge书签_数据.json           ← 机器可读的同步数据（双向同步用）
├── Edge书签_最新.html           ← 最新书签，可直接导入浏览器
├── Edge书签_2026-06-28.html    ← 按日归档的历史快照
└── Edge书签_备份_*.json         ← 同步前的安全备份（过期自动清理）
```

## 兼容性

| 浏览器 | 支持情况 |
|---|---|
| Google Chrome | ✅ Manifest V3 |
| Microsoft Edge | ✅ Manifest V3（Chromium 版） |
| 其他 Chromium 浏览器 | ✅ 理论兼容（未严格测试） |

## 常见问题

**Q：备份文件会越来越多吗？**

不会。每次同步前会检查书签是否有变化，无变化时不产生任何文件。同时可以设置保留天数，超过期限的备份文件在下次同步时自动清理。

**Q：可以和其他浏览器共用吗？**

目前支持 Chrome 和 Edge。只要配置同一个 WebDAV 目录，多台设备的书签可以通过双向同步模式合并。

**Q：数据安全吗？**

书签数据直接传输到你自己的 WebDAV 服务器，扩展本身不经过任何第三方服务器。代码完全开源。

**Q：同步失败怎么办？**

检查网络连接和 WebDAV 配置是否正确。坚果云用户请确认使用的是「应用密码」而非登录密码。同步历史中会记录失败原因。

## 开发

```bash
# 克隆仓库
git clone https://github.com/HANJ1998/bookmarks-sync.git

# 加载扩展
# Chrome: chrome://extensions → 加载解压缩的扩展 → 选择文件夹
# Edge:   edge://extensions   → 加载解压缩的扩展 → 选择文件夹

# 打包
cd src && zip -r ../extension.zip ./*
```

提交代码后，GitHub Actions 会自动构建 Release。

## 隐私

本扩展**不会**收集、存储或传输任何个人数据。

- 书签数据通过 WebDAV 协议直接传输到用户指定的服务器，**不经任何第三方**
- 配置信息存储在浏览器本地 `chrome.storage`
- 无第三方分析、广告或追踪服务

## 许可证

[MIT](LICENSE) © 2026 [HANJ1998](https://github.com/HANJ1998)

---

<div align="center">

如果这个项目对你有帮助，欢迎点亮 ⭐

</div>
