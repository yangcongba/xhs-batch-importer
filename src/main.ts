import { Notice, Plugin, Modal, App, Setting } from "obsidian";
import type { XHSBatchImporterSettings, XHSNote } from "./types";
import { DEFAULT_SETTINGS } from "./types";
import { XHSBatchImporterSettingTab } from "./settings";
import { OpenCLIClient } from "./opencli";
import { getExistingSources, batchImport } from "./importer";
import { BatchImportModal } from "./modal";

interface CachedFavorites {
  notes: XHSNote[];
  timestamp: number;
}

class PasteJsonModal extends Modal {
  private onConfirm: (notes: XHSNote[]) => void;

  constructor(app: App, onConfirm: (notes: XHSNote[]) => void) {
    super(app);
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "粘贴收藏 JSON 数据" });
    contentEl.createEl("p", {
      text: "在小红书收藏页的浏览器控制台中执行以下代码，将结果粘贴到下方：",
    });

    const codeEl = contentEl.createEl("pre", { cls: "xhs-code-block" });
    codeEl.setText(
      `var p=document.querySelector('#app').__vue_app__.config.globalProperties.$pinia;var t=p.state.value.user.notes['1'];var r=[];for(var k in t){var n=t[k];if(n&&n.noteCard){var nc=n.noteCard;r.push({id:nc.noteId||n.id,title:nc.displayTitle||'',type:nc.type||'normal',coverUrl:nc.cover?nc.cover.urlDefault:'',nickname:nc.user?nc.user.nickname:'',xsecToken:nc.xsecToken||n.xsecToken||''});}}JSON.stringify(r);`
    );

    const textarea = contentEl.createEl("textarea", {
      cls: "xhs-paste-input",
      attr: {
        placeholder: "在此粘贴 JSON 数据...",
        rows: "10",
        cols: "60",
      },
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("解析并导入").setCta().onClick(() => {
          try {
            const json = textarea.value.trim();
            const notes: XHSNote[] = JSON.parse(json);
            this.onConfirm(notes);
            this.close();
          } catch {
            new Notice("JSON 解析失败，请检查格式");
          }
        })
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.close();
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}

export default class XHSBatchImporterPlugin extends Plugin {
  settings: XHSBatchImporterSettings = DEFAULT_SETTINGS;
  private cachedFavorites: CachedFavorites | null = null;

  async onload() {
    await this.loadSettings();

    this.addRibbonIcon("book-open", "XHS Batch Importer", () => {
      this.startImport();
    });

    this.addCommand({
      id: "xhs-batch-import",
      name: "Import from XHS favorites",
      callback: () => {
        this.startImport();
      },
    });

    this.addCommand({
      id: "xhs-paste-import",
      name: "Import from pasted JSON",
      callback: () => {
        this.pasteImport();
      },
    });

    this.addSettingTab(new XHSBatchImporterSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.cachedFavorites = await this.loadCachedFavorites();
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async loadCachedFavorites(): Promise<CachedFavorites | null> {
    try {
      const data = await this.app.vault.adapter.read(
        this.app.vault.adapter.getFullPath() + "/.obsidian/plugins/xhs-batch-importer/cached-favorites.json"
      );
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async saveCachedFavorites(favorites: XHSNote[]) {
    const cache: CachedFavorites = {
      notes: favorites,
      timestamp: Date.now(),
    };
    this.cachedFavorites = cache;
    try {
      const pluginDir = this.app.vault.adapter.getFullPath() + "/.obsidian/plugins/xhs-batch-importer";
      await this.app.vault.adapter.write(
        pluginDir + "/cached-favorites.json",
        JSON.stringify(cache)
      );
    } catch {}
  }

  private mergeFavorites(newNotes: XHSNote[], cachedNotes: XHSNote[]): XHSNote[] {
    const seen = new Set<string>();
    const result: XHSNote[] = [];
    for (const n of newNotes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        result.push(n);
      }
    }
    for (const n of cachedNotes) {
      if (!seen.has(n.id)) {
        seen.add(n.id);
        result.push(n);
      }
    }
    return result;
  }

  async startImport() {
    const client = new OpenCLIClient(
      this.settings.opencliPath,
      this.settings.autoScrollDelay
    );

    const result = await client.checkAvailable();
    if (!result.available) {
      new Notice(`opencli 不可用: ${result.error || '未知错误'}\n也可使用「从 JSON 粘贴」命令。`, 8000);
      return;
    }

    let userId = this.settings.userId;
    new Notice("正在获取用户 ID...");
    try {
      const browserUserId = await client.getCurrentUserId();
      if (browserUserId && browserUserId.length > 5) {
        userId = browserUserId;
        if (userId !== this.settings.userId) {
          this.settings.userId = userId;
          await this.saveSettings();
          new Notice(`已更新用户 ID: ${userId}`);
        }
      } else if (!userId) {
        new Notice("获取用户 ID 失败，请在设置中手动填写。");
        return;
      }
    } catch {
      if (!userId) {
        new Notice("获取用户 ID 失败，请在设置中手动填写。");
        return;
      }
    }

    const mode = this.settings.importMode;
    const cachedNotes = this.cachedFavorites?.notes || [];
    const stopAtId = mode === "incremental" && cachedNotes.length > 0 ? cachedNotes[0].id : undefined;

    const modeLabel = mode === "incremental" && cachedNotes.length > 0
      ? `（增量模式：从上次最新收藏开始读取，已缓存 ${cachedNotes.length} 条）`
      : "（完整模式：获取所有收藏）";
    new Notice(`正在加载收藏列表${modeLabel}，请等待...`);

    let freshNotes: XHSNote[];
    try {
      const notice = new Notice("加载中...", 0);
      freshNotes = await client.getFavorites(userId, mode, stopAtId, (msg) => {
        notice.setMessage(msg);
      });
      notice.hide();
    } catch (e) {
      new Notice(`获取收藏失败: ${(e as Error).message}`, 10000);
      return;
    }

    const allFavorites = this.mergeFavorites(freshNotes, cachedNotes);
    await this.saveCachedFavorites(allFavorites);

    const existingIds = await getExistingSources(
      this.app.vault,
      this.settings.defaultFolder
    );

    const importedCount = allFavorites.filter((n) => existingIds.has(n.id)).length;
    const newCount = allFavorites.length - importedCount;
    new Notice(`共 ${allFavorites.length} 条收藏，${importedCount} 条已导入，${newCount} 条未导入`);

    new BatchImportModal(
      this.app,
      allFavorites,
      existingIds,
      this.settings,
      async (selected, category, downloadMedia) => {
        await this.runImport(selected, category, downloadMedia);
      }
    ).open();
  }

  async pasteImport() {
    const modal = new PasteJsonModal(this.app, async (notes) => {
      const existingIds = await getExistingSources(
        this.app.vault,
        this.settings.defaultFolder
      );

      new BatchImportModal(
        this.app,
        notes,
        existingIds,
        this.settings,
        async (selected, category, downloadMedia) => {
          await this.runImport(selected, category, downloadMedia);
        }
      ).open();
    });
    modal.open();
  }

  async runImport(
    selected: XHSNote[],
    category: string,
    downloadMedia: boolean
  ) {
    const notice = new Notice("开始导入...", 0);
    const settings = { ...this.settings, downloadMedia };

    const result = await batchImport(
      this.app,
      selected,
      category,
      settings,
      (current, total, title) => {
        notice.setMessage(
          `导入中 (${current}/${total}): ${title.substring(0, 30)}...`
        );
      }
    );

    notice.hide();
    new Notice(
      `导入完成！成功 ${result.success} 条，失败 ${result.failed} 条，跳过 ${result.skipped} 条`
    );
  }
}