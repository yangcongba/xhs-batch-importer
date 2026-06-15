import { App, Modal, Setting } from "obsidian";
import type { XHSNote, XHSBatchImporterSettings } from "./types";

export class BatchImportModal extends Modal {
  private notes: XHSNote[];
  private existingIds: Set<string>;
  private settings: XHSBatchImporterSettings;
  private selectedCategory: string;
  private downloadMedia: boolean;
  private checkedNotes: Set<string> = new Set();
  private onConfirm: (
    selected: XHSNote[],
    category: string,
    downloadMedia: boolean
  ) => void;

  constructor(
    app: App,
    notes: XHSNote[],
    existingIds: Set<string>,
    settings: XHSBatchImporterSettings,
    onConfirm: (
      selected: XHSNote[],
      category: string,
      downloadMedia: boolean
    ) => void
  ) {
    super(app);
    this.notes = notes;
    this.existingIds = existingIds;
    this.settings = settings;
    this.selectedCategory = settings.categories[0] || "AI";
    this.downloadMedia = settings.downloadMedia;
    this.onConfirm = onConfirm;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const unimported = this.notes.filter((n) => !this.existingIds.has(n.id));

    contentEl.createEl("h2", { text: "📕 小红书收藏批量导入" });

    const statsEl = contentEl.createDiv({ cls: "xhs-stats" });
    statsEl.createSpan({
      text: `找到 ${this.notes.length} 条收藏，其中 ${this.existingIds.size} 条已导入`,
    });
    const unimportedEl = statsEl.createDiv();
    unimportedEl.createSpan({
      text: `以下 ${unimported.length} 条未导入：`,
      cls: "xhs-unimported-count",
    });

    const controlsEl = contentEl.createDiv({ cls: "xhs-controls" });

    new Setting(controlsEl)
      .addButton((btn) =>
        btn.setButtonText("全选").onClick(() => {
          unimported.forEach((n) => this.checkedNotes.add(n.id));
          this.refreshList();
        })
      )
      .addButton((btn) =>
        btn.setButtonText("取消全选").onClick(() => {
          this.checkedNotes.clear();
          this.refreshList();
        })
      );

    const categoryEl = controlsEl.createDiv({ cls: "xhs-category-select" });
    categoryEl.createSpan({ text: "分类: " });
    const select = categoryEl.createEl("select") as HTMLSelectElement;
    this.settings.categories.forEach((cat) => {
      const opt = select.createEl("option", { text: cat, value: cat });
      if (cat === this.selectedCategory) opt.selected = true;
    });
    select.addEventListener("change", () => {
      this.selectedCategory = select.value;
    });

    const mediaToggleEl = controlsEl.createDiv({ cls: "xhs-media-toggle" });
    const mediaCheckbox = mediaToggleEl.createEl("input", {
      type: "checkbox",
    }) as HTMLInputElement;
    mediaCheckbox.checked = this.downloadMedia;
    mediaCheckbox.addEventListener("change", () => {
      this.downloadMedia = mediaCheckbox.checked;
    });
    mediaToggleEl.createSpan({ text: " 下载媒体 (默认不下载，节省空间)" });

    this.renderList(unimported);

    const footerEl = contentEl.createDiv({ cls: "xhs-footer" });
    const selectedCountEl = footerEl.createSpan({
      cls: "xhs-selected-count",
      text: `已选 0 条`,
    });

    new Setting(footerEl)
      .addButton((btn) =>
        btn
          .setButtonText("开始导入")
          .setCta()
          .onClick(() => {
            const selected = unimported.filter((n) =>
              this.checkedNotes.has(n.id)
            );
            if (selected.length === 0) {
              return;
            }
            this.onConfirm(selected, this.selectedCategory, this.downloadMedia);
            this.close();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.close();
        })
      );

    this.updateSelectedCount = () => {
      selectedCountEl.setText(`已选 ${this.checkedNotes.size} 条`);
    };
    this.updateSelectedCount();
  }

  private listContainerEl: HTMLElement | null = null;
  private updateSelectedCount: (() => void) | null = null;

  private renderList(unimported: XHSNote[]) {
    if (this.listContainerEl) {
      this.listContainerEl.empty();
    } else {
      this.listContainerEl = this.contentEl.createDiv({
        cls: "xhs-note-list",
      });
    }

    const maxDisplay = 200;
    const displayNotes = unimported.slice(0, maxDisplay);

    for (const note of displayNotes) {
      const row = this.listContainerEl.createDiv({ cls: "xhs-note-row" });
      const checkbox = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
      checkbox.checked = this.checkedNotes.has(note.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          this.checkedNotes.add(note.id);
        } else {
          this.checkedNotes.delete(note.id);
        }
        this.updateSelectedCount?.();
      });

      const typeIndicator = note.type === "video" ? "[V] " : "";
      const title = note.title || "(无标题)";
      row.createSpan({
        text: `${typeIndicator}${title}`,
        cls: "xhs-note-title",
      });

      if (note.nickname) {
        row.createSpan({
          text: ` - ${note.nickname}`,
          cls: "xhs-note-author",
        });
      }
    }

    if (unimported.length > maxDisplay) {
      this.listContainerEl.createDiv({
        cls: "xhs-more-hint",
        text: `... 还有 ${unimported.length - maxDisplay} 条未显示`,
      });
    }
  }

  private refreshList() {
    const unimported = this.notes.filter((n) => !this.existingIds.has(n.id));
    this.renderList(unimported);
    this.updateSelectedCount?.();
  }

  onClose() {
    this.contentEl.empty();
  }
}