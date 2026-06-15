# XHS Batch Importer — Obsidian 插件开发计划

## 1. 背景与目标

将小红书收藏夹内容批量导入 Obsidian，支持去重、分类选择，替代手动逐条导入。

### 核心需求

- 从小红书收藏夹批量获取笔记列表
- 自动检测已导入笔记，只列出未导入的
- 用户可手动勾选要导入的笔记
- 用户可选择分类（对应插件现有类别体系），笔记导入到对应分类子文件夹
- 轻量，不占过多系统资源和磁盘空间

## 2. 技术架构

### 插件 ID

`xhs-batch-importer`（与现有 `xiaohongshu-importer` 共存）

### 技术栈

- TypeScript + Obsidian API
- 构建工具：esbuild（Obsidian 插件标准方案）
- 不依赖额外 npm 包

### 数据流

```
用户点击侧边栏图标 →
  1. shell 调 opencli 获取收藏列表（一次性）→ JSON
  2. 扫描 vault 中 XHS Notes/**/*.md 的 frontmatter.source → 已导入集合
  3. 过滤：收藏列表 - 已导入 = 未导入列表
  4. 弹出 Modal：未导入笔记列表（复选框 + 分类下拉 + 是否下载媒体）
  5. 用户确认后，对每条选中笔记调 requestUrl 抓取公开页面
  6. 解析 HTML → 生成 .md 文件 → 写入 vault
```

### 关键设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 获取收藏列表 | 调 opencli browser eval | 需要 XHS 登录态，直接调 API 被签名拦截（300011） |
| 获取笔记详情 | `requestUrl` 直接请求公开页面 | 不打开浏览器标签页，零额外磁盘占用，不发 opencli |
| 去重依据 | frontmatter 中的 `source` 字段 | 可靠，不依赖文件名 |
| 分类存储 | vault 内 `XHS Notes/{category}/` 子文件夹 | 与现有插件格式兼容 |
| 媒体下载 | 默认不下载 | 省磁盘空间（之前 223MB 就这么来的） |

## 3. 功能模块详细设计

### 3.1 获取收藏列表

**方式**：通过 opencli browser eval 执行 JS，从 XHS 页面的 Pinia store 中提取

```javascript
// 在 XHS 收藏页执行
var p = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;
var t = p.state.value.user.notes['1'];  // '1' = 收藏 tab
var result = [];
for (var k in t) {
  var n = t[k];
  if (n && n.noteCard) {
    var nc = n.noteCard;
    result.push({
      id: nc.noteId || n.id,
      title: nc.displayTitle || '',
      type: nc.type || 'normal',
      coverUrl: nc.cover ? nc.cover.urlDefault : '',
      nickname: nc.user ? nc.user.nickname : '',
      xsecToken: nc.xsecToken || n.xsecToken || ''
    });
  }
}
JSON.stringify(result);
```

**滚动加载**：收藏数据按需加载（每页约20-30条），需要滚动页面让更多数据进入 store：

```bash
# 循环滚动直到不增长
opencli browser xhs scroll down
sleep 1.5
# 重复检查 store 中的笔记数量
```

**调用流程**：

```typescript
async function fetchFavorites(): Promise<XHSNote[]> {
  // 1. 确保 opencli 可用
  exec('opencli doctor');
  
  // 2. 打开收藏页
  exec('opencli browser xhs open https://www.xiaohongshu.com/user/profile/{userId}');
  exec('opencli browser xhs click 71'); // 点击收藏 tab
  
  // 3. 循环滚动加载所有收藏
  while (!stable) {
    exec('opencli browser xhs scroll down');
    await sleep(1500);
  }
  
  // 4. 提取数据
  const json = exec('opencli browser xhs eval <extract-js>');
  return JSON.parse(json);
}
```

**备选方案（如果 opencli 不可用）**：手动导出 — 用户在浏览器 Console 中执行上述 JS，将结果粘贴到插件输入框。

### 3.2 去重检测

```typescript
async function getExistingSources(vault: Vault, folder: string): Promise<Set<string>> {
  const existing = new Set<string>();
  const files = vault.getFiles().filter(f => f.path.startsWith(folder));
  
  for (const file of files) {
    const content = await vault.read(file);
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (match) {
      const sourceMatch = match[1].match(/source:\s*(.+)/);
      if (sourceMatch) {
        // 提取笔记ID：https://www.xiaohongshu.com/explore/6a2xxx?xsec_token=xxx → 6a2xxx
        const idMatch = sourceMatch[1].match(/explore\/([a-zA-Z0-9]+)/);
        if (idMatch) existing.add(idMatch[1]);
      }
    }
  }
  
  return existing;
}
```

### 3.3 批量选择 UI（Modal）

```
┌─────────────────────────────────────────┐
│  📕 小红书收藏批量导入                    │
├─────────────────────────────────────────┤
│  找到 1359 条收藏，其中 70 条已导入       │
│  以下 1289 条未导入：                     │
│                                         │
│  [全选] [取消全选]  分类: [AI ▼]         │
│                                         │
│  ☑ 即将上线❗️我们纯AI制作的美式暗黑学院剧    │
│  ☑ 比 CC-Switch 更全能的 AI 工具          │
│  ☐ 一觉醒来就到了"汴京"站                 │
│  ☐ 灵岫                                  │
│  ...                                    │
│                                         │
│  下载媒体: ☐ (默认不下载，节省空间)        │
│                                         │
│  已选 2 条  [开始导入]  [取消]            │
└─────────────────────────────────────────┘
```

### 3.4 笔记详情抓取与解析

使用 Obsidian 的 `requestUrl` API（不打开浏览器，纯 HTTP）：

```typescript
async function fetchNoteDetail(noteId: string, xsecToken: string): Promise<NoteDetail> {
  const url = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${xsecToken}`;
  const response = await requestUrl({ url });
  const html = response.text;
  
  return {
    title: extractTitle(html),
    content: extractContent(html),
    images: extractImages(html),
    videoUrl: extractVideoUrl(html),
    tags: extractTags(html),
    isVideo: isVideoNote(html),
  };
}
```

**解析逻辑**（从现有插件移植，已验证可行）：

```typescript
function extractTitle(html: string): string {
  const match = html.match(/<title>(.*?)<\/title>/);
  return match ? match[1].replace(' - 小红书', '') : 'Untitled';
}

function extractContent(html: string): string {
  // 1. 尝试从 __INITIAL_STATE__ JSON 解析
  const stateMatch = html.match(/window\.__INITIAL_STATE__=(.*?)<\/script>/s);
  if (stateMatch) {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, 'null');
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    return state.note.noteDetailMap[key].note.desc || '';
  }
  // 2. Fallback: 从 HTML desc div 解析
  const descMatch = html.match(/<div id="detail-desc" class="desc">([\s\S]*?)<\/div>/);
  return descMatch ? descMatch[1].replace(/<[^>]+>/g, '') : '';
}

function extractImages(html: string): string[] {
  const stateMatch = html.match(/window\.__INITIAL_STATE__=(.*?)<\/script>/s);
  if (!stateMatch) return [];
  const jsonStr = stateMatch[1].trim().replace(/undefined/g, 'null');
  const state = JSON.parse(jsonStr);
  const key = Object.keys(state.note.noteDetailMap)[0];
  const imageList = state.note.noteDetailMap[key].note.imageList || [];
  return imageList.map((img: any) => img.urlDefault || img.url || '').filter(Boolean);
}
```

### 3.5 Markdown 生成

与现有插件格式兼容：

```markdown
---
title: {标题}
source: {笔记URL}
date: {导入日期}
Imported At: {导入时间}
category: {分类}
author: {作者}
likes: {点赞数}
collects: {收藏数}
comments: {评论数}
---

# {标题}

{正文内容}

```
#标签1 #标签2 #标签3
```

![Image](图片URL)
```

文件保存路径：`XHS Notes/{category}/{标题}.md`

视频笔记文件名前缀 `[V]`。

### 3.6 opencli 集成模块

```typescript
// src/opencli.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class OpenCLIClient {
  private session = 'xhs';
  
  async checkAvailable(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('opencli doctor 2>&1');
      return stdout.includes('[OK] Extension: connected');
    } catch {
      return false;
    }
  }
  
  async getFavorites(userId: string): Promise<XHSFavoriteItem[]> {
    // 1. 打开收藏页
    await execAsync(`opencli browser ${this.session} open "https://www.xiaohongshu.com/user/profile/${userId}"`);
    await sleep(2000);
    
    // 2. 点击收藏 tab
    await execAsync(`opencli browser ${this.session} click 71`);
    await sleep(3000);
    
    // 3. 关闭弹窗
    await execAsync(`opencli browser ${this.session} eval "document.querySelectorAll('button').forEach(function(b){if(b.textContent.includes('我知道了'))b.click()})"`);
    
    // 4. 循环滚动加载
    let lastCount = 0;
    let stable = 0;
    while (stable < 15) {
      await execAsync(`opencli browser ${this.session} scroll down`);
      await sleep(1500);
      const { stdout } = await execAsync(
        `opencli browser ${this.session} eval "var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;var t=p.state.value.user.notes['1'];Object.keys(t).length"`
      );
      const count = parseInt(stdout.trim());
      if (count === lastCount) stable++;
      else stable = 0;
      lastCount = count;
    }
    
    // 5. 提取数据
    const extractJS = `var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;var t=p.state.value.user.notes['1'];var r=[];for(var k in t){var n=t[k];if(n&&n.noteCard){var nc=n.noteCard;r.push({id:nc.noteId||n.id,title:nc.displayTitle||'',type:nc.type||'normal',coverUrl:nc.cover?nc.cover.urlDefault:'',nickname:nc.user?nc.user.nickname:'',xsecToken:nc.xsecToken||n.xsecToken||''});}}JSON.stringify(r)`;
    const { stdout: json } = await execAsync(
      `opencli browser ${this.session} eval "${extractJS.replace(/"/g, '\\"')}"`
    );
    
    return JSON.parse(json.trim());
  }
  
  async getCurrentUserId(): Promise<string> {
    const { stdout } = await execAsync(
      `opencli browser ${this.session} eval "document.querySelector('#app').__vue_app__.config.globalProperties.$pinia.state.value.user.userInfo.userId"`
    );
    return stdout.trim().replace(/"/g, '');
  }
}
```

### 3.7 插件设置

```typescript
// src/settings.ts
export interface XHSBatchImporterSettings {
  defaultFolder: string;        // 默认: "XHS Notes"
  categories: string[];          // 分类列表
  downloadMedia: boolean;        // 默认: false（省空间）
  autoScrollDelay: number;       // 滚动间隔(ms)，默认 1500
  requestDelay: number;          // 请求间隔(ms)，默认 1000
  opencliPath: string;           // opencli 路径，默认: "opencli"
}

export const DEFAULT_SETTINGS: XHSBatchImporterSettings = {
  defaultFolder: 'XHS Notes',
  categories: ['AI', '美术', '旅行', '美食', '知识', '娱乐'],
  downloadMedia: false,
  autoScrollDelay: 1500,
  requestDelay: 1000,
  opencliPath: 'opencli',
};
```

## 4. 项目结构

```
XHS_Obsidian/
├── src/
│   ├── main.ts              # 插件入口，注册命令和侧边栏图标
│   ├── settings.ts           # 设置页（Tab）
│   ├── opencli.ts            # opencli 集成（获取收藏列表）
│   ├── parser.ts             # XHS 页面解析（从现有插件移植）
│   ├── importer.ts           # 批量导入逻辑 + 去重
│   ├── modal.ts              # 批量选择 Modal UI
│   └── types.ts              # 类型定义
├── manifest.json
├── styles.css
├── esbuild.config.mjs        # 构建配置
├── package.json
├── tsconfig.json
└── DEV_PLAN.md               # 本文件
```

## 5. 与现有插件的关系

| | xiaohongshu-importer (现有) | xhs-batch-importer (新) |
|---|---|---|
| 导入方式 | 手动粘贴分享链接，单条 | 批量从收藏夹获取，多选导入 |
| 获取数据 | `requestUrl` 抓公开页面 | 同上（复用解析逻辑） |
| 获取列表 | 无 | opencli → Pinia store |
| 去重 | 无 | 扫描 vault frontmatter |
| 分类 | 每条手动选 | 批量选 + 默认分类 |
| 媒体下载 | 可选 | 可选（默认关闭） |
| 输出格式 | 完全兼容 | 完全兼容 |

两个插件可以共存，输出格式完全兼容。用户可以继续用原插件手动导入单条，用新插件批量导入收藏。

## 6. 关键风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| `requestUrl` 被 XHS 反爬拦截 | 无法获取笔记详情 | Fallback: 用 opencli browser 打开单页提取（加 tab 清理） |
| opencli 未启动 | 无法获取收藏列表 | 友好提示 + 提供手动粘贴 JSON 的备选入口 |
| XHS 页面结构改版 | 解析失败 | 保留正则 + JSON 双重解析，与原插件同步维护 |
| 大量笔记导入时 Obsidian 卡顿 | 体验差 | 分批导入（每批 20 条），中间 await 延迟 |
| 磁盘空间不足 | 写入失败 | 导入前检查磁盘剩余空间，媒体默认不下载 |

## 7. 开发步骤

### 第一步：项目搭建（15 min）
- 初始化 Obsidian 插件项目结构
- 配置 esbuild + TypeScript
- 确保 `npm run dev` 能热重载

### 第二步：移植解析逻辑（30 min）
- 从现有插件 `main.js` 移植 `extractTitle` / `extractContent` / `extractImages` / `extractVideoUrl` / `extractTags` / `isVideoNote`
- 用 TypeScript 重写，加类型

### 第三步：实现设置页（20 min）
- 复用原插件的设置项（defaultFolder, categories, downloadMedia）
- 新增 opencli 路径、滚动间隔等设置

### 第四步：实现 OpenCLI 集成（40 min）
- 封装 shell 调用
- 处理错误（未安装、未连接、超时）
- 提取收藏数据

### 第五步：实现去重检测（20 min）
- 扫描 vault 目录
- 解析 frontmatter 中的 source 字段
- 返回已导入 ID 集合

### 第六步：实现批量选择 Modal（1 hr）
- 复选框列表 + 全选/取消
- 分类下拉选择
- 下载媒体开关
- 显示统计（总数/已导入/未导入）

### 第七步：实现批量导入循环（30 min）
- `requestUrl` 逐条抓取
- 解析 → 生成 Markdown → 写入文件
- 进度条/状态更新
- 错误处理（单条失败不影响批量）

### 第八步：测试（30 min）
- 端到端测试
- 边界情况处理

总计约 **3-4 小时**。

## 8. 已验证的技术细节

以下内容已在本次会话中实际验证通过：

- `opencli doctor` 检查连接状态 ✅
- `opencli browser xhs eval` 从 Pinia store 提取收藏数据 ✅
- `opencli browser xhs scroll down` 触发懒加载 ✅
- `opencli xiaohongshu note <url> -f json` 获取笔记详情 ✅
- `requestUrl` 解析 XHS 页面（`__INITIAL_STATE__` JSON 解析）✅
- Obsidian vault 路径：`/Users/yangfan/Documents/Obsidian Vault` ✅
- XHS 用户 ID：`6904ff29000000003702d2b6` ✅
- 收藏 tab 在 Pinia store 中的 key：`user.notes['1']` ✅
- 输出目录结构：`XHS Notes/{category}/{title}.md` ✅

## 9. 安装方式

开发阶段：将构建产物复制到 vault 插件目录
```bash
cp main.js manifest.json styles.css \
  /Users/yangfan/Documents/Obsidian\ Vault/.obsidian/plugins/xhs-batch-importer/
```

长期使用：BRAT 插件管理更新，或上传到 GitHub 后在 Obsidian 社区发布。