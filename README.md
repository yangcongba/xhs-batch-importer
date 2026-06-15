# XHS Batch Importer for Obsidian

Batch import your Xiaohongshu (小红书 / RED) favorites into Obsidian with deduplication, categorization, and incremental sync.

> **Prerequisite:** This plugin requires [OpenCLI](https://github.com/nicepkg/opencli) (with the Browser Bridge extension installed and a logged-in XHS session in Chrome).

## Features

- **Batch import** — fetch your entire XHS favorites list via OpenCLI and select which notes to import
- **Deduplication** — automatically detects already-imported notes by matching the `source` field in frontmatter
- **Incremental sync** — only fetches new favorites since the last run (stops scrolling when it encounters the previously latest note)
- **Category folders** — choose a category for each batch; notes are saved to `XHS Notes/{category}/`
- **Paste JSON fallback** — if OpenCLI is unavailable, paste the extracted JSON manually
- **Video support** — video notes are prefixed with `[V]` in the filename
- **Compatible output** — generates the same frontmatter format as the original `xiaohongshu-importer` plugin

## How It Works

1. Click the 📕 ribbon icon (or run the command `XHS Batch Importer: Import from XHS favorites`)
2. The plugin uses OpenCLI to open your XHS profile in Chrome, scrolls through your favorites, and extracts note metadata from Pinia store
3. A modal shows all favorites with deduplication status — select which ones to import and pick a category
4. Each selected note is fetched via `requestUrl` (no browser needed for this step), parsed, and saved as a Markdown file

Alternative: use `Import from pasted JSON` to manually paste favorites data extracted from your browser console.

## Installation

### Manual

1. Install [OpenCLI](https://github.com/nicepkg/opencli) and the Browser Bridge Chrome extension
2. Make sure you're logged into XHS in Chrome
3. Download the latest release from GitHub
4. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/xhs-batch-importer/`
5. Enable the plugin in Obsidian settings

### Build from source

```bash
git clone https://github.com/yangfan/xhs-batch-importer.git
cd xhs-batch-importer
npm install
npm run build
# Copy output to your vault:
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/xhs-batch-importer/
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Import mode | Incremental | `Full` — scroll through all favorites; `Incremental` — stop when a previously-seen note is found |
| Default folder | `XHS Notes` | Root folder for imported notes |
| Categories | AI, 美术, 旅行, 美食, 知识, 娱乐 | Categories for organizing notes into subfolders |
| XHS User ID | _(auto-detected)_ | Your XHS user ID; auto-detected if empty |
| Download media | Off | Whether to download images (currently frontmatter only) |
| Auto scroll delay | 1500 ms | Delay between scroll actions when loading favorites |
| Request delay | 1000 ms | Delay between importing each note |
| opencli path | `/Users/yangfan/.npm-global/bin/opencli` | Path to the `opencli` binary |

## Output Format

```markdown
---
title: "Note Title"
source: https://www.xiaohongshu.com/explore/abc123?xsec_token=xxx
date: 2026-06-15
Imported At: 2026-06-15T10:30:00.000Z
category: AI
author: Author Name
likes: 42
collects: 10
comments: 5
---

# Note Title

Note content...

#tag1 #tag2

![Image](https://...)
```

## Deduplication

The plugin scans all Markdown files under the configured folder and extracts the note ID from the `source` frontmatter field. It supports both URL formats:

- `https://www.xiaohongshu.com/explore/{id}`
- `https://www.xiaohongshu.com/discovery/item/{id}`

## Cache & Incremental Mode

Favorites data is cached in `.obsidian/plugins/xhs-batch-importer/cached-favorites.json`. In incremental mode, the plugin:

1. Reads the first note ID from cache (your most recent favorite)
2. Scrolls through the favorites page, checking each batch of IDs
3. Stops as soon as it encounters the cached note
4. Merges new data with cached data (preserving XHS ordering) and updates the cache

## License

MIT

---

# 小红书批量导入 Obsidian 插件

批量将小红书收藏导入 Obsidian，支持去重、分类和增量同步。

> **前置条件：** 需要安装 [OpenCLI](https://github.com/nicepkg/opencli) 及 Browser Bridge Chrome 扩展，并在 Chrome 中登录小红书。

## 功能

- **批量导入** — 通过 OpenCLI 获取小红书收藏列表，勾选要导入的笔记
- **自动去重** — 通过 frontmatter 中的 `source` 字段检测已导入笔记
- **增量同步** — 仅获取上次运行之后的新收藏（遇到上次最新的收藏即停止滚动）
- **分类存储** — 每次批量导入选择一个分类，笔记保存到 `XHS Notes/{分类}/` 子文件夹
- **手动粘贴备选** — OpenCLI 不可用时，可手动粘贴 JSON 数据
- **视频支持** — 视频笔记文件名前缀 `[V]`
- **格式兼容** — 输出格式与原有 `xiaohongshu-importer` 插件完全兼容

## 工作原理

1. 点击侧边栏 📕 图标（或运行命令 `XHS Batch Importer: Import from XHS favorites`）
2. 插件通过 OpenCLI 在 Chrome 中打开你的小红书主页，自动滚动加载全部收藏，从 Pinia store 提取数据
3. 弹出 Modal 显示所有收藏（已导入的会标记），勾选要导入的笔记并选择分类
4. 对每条选中笔记通过 `requestUrl` 抓取公开页面，解析生成 Markdown 文件

备选方式：使用 `Import from pasted JSON` 命令手动粘贴浏览器控制台提取的数据。

## 安装

### 手动安装

1. 安装 [OpenCLI](https://github.com/nicepkg/opencli) 和 Browser Bridge Chrome 扩展
2. 确保 Chrome 中已登录小红书
3. 从 GitHub 下载最新 release
4. 将 `main.js`、`manifest.json`、`styles.css` 复制到 `<vault>/.obsidian/plugins/xhs-batch-importer/`
5. 在 Obsidian 设置中启用插件

### 从源码构建

```bash
git clone https://github.com/yangfan/xhs-batch-importer.git
cd xhs-batch-importer
npm install
npm run build
# 复制输出到 vault：
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/xhs-batch-importer/
```

## 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| 导入模式 | 增量 | 「完整」滚动加载所有收藏；「增量」遇到上次已知的收藏即停止 |
| 默认文件夹 | `XHS Notes` | 导入笔记的根目录 |
| 分类 | AI, 美术, 旅行, 美食, 知识, 娱乐 | 用于分类存储的子文件夹名 |
| 小红书用户 ID | _(自动检测)_ | 自动从浏览器获取，也可手动填写 |
| 下载媒体 | 关闭 | 是否下载图片（目前仅 frontmatter） |
| 滚动间隔 | 1500 毫秒 | 滚动加载收藏时的间隔 |
| 请求间隔 | 1000 毫秒 | 每条笔记导入间的延迟 |
| opencli 路径 | `/Users/yangfan/.npm-global/bin/opencli` | opencli 可执行文件路径 |

## 输出格式

```markdown
---
title: "笔记标题"
source: https://www.xiaohongshu.com/explore/abc123?xsec_token=xxx
date: 2026-06-15
Imported At: 2026-06-15T10:30:00.000Z
category: AI
author: 作者名
likes: 42
collects: 10
comments: 5
---

# 笔记标题

正文内容...

#标签1 #标签2

![Image](https://...)
```

## 去重机制

插件扫描配置文件夹下的所有 Markdown 文件，提取 `source` 字段中的笔记 ID。支持两种 URL 格式：

- `https://www.xiaohongshu.com/explore/{id}`
- `https://www.xiaohongshu.com/discovery/item/{id}`

## 缓存与增量模式

收藏数据缓存在 `.obsidian/plugins/xhs-batch-importer/cached-favorites.json` 中。增量模式下：

1. 从缓存读取最新一条收藏的 ID
2. 滚动加载时检查当前加载的 ID 列表
3. 遇到缓存中的最新收藏即停止
4. 合并新数据和缓存数据（保持小红书排序），更新缓存

## 许可证

MIT