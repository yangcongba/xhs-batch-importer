import { App, PluginSettingTab, Setting } from "obsidian";
import type XHSBatchImporterPlugin from "./main";
import { DEFAULT_SETTINGS, ImportMode } from "./types";

export class XHSBatchImporterSettingTab extends PluginSettingTab {
  plugin: XHSBatchImporterPlugin;

  constructor(app: App, plugin: XHSBatchImporterPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "XHS Batch Importer Settings" });

    new Setting(containerEl)
      .setName("Import mode")
      .setDesc("Full: scan all favorites. Incremental: only new favorites since last run (stops scrolling when previously seen notes are found).")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("full", "Full - Read all favorites")
          .addOption("incremental", "Incremental - Only new since last run")
          .setValue(this.plugin.settings.importMode)
          .onChange(async (value: string) => {
            this.plugin.settings.importMode = value as ImportMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Default folder")
      .setDesc("Folder to store imported notes (relative to vault root)")
      .addText((text) =>
        text
          .setPlaceholder("XHS Notes")
          .setValue(this.plugin.settings.defaultFolder)
          .onChange(async (value) => {
            this.plugin.settings.defaultFolder = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Categories")
      .setDesc("Comma-separated list of categories for organizing notes")
      .addText((text) =>
        text
          .setPlaceholder("AI, 美术, 旅行")
          .setValue(this.plugin.settings.categories.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.categories = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("XHS User ID")
      .setDesc("Your Xiaohongshu user ID (auto-detected if empty)")
      .addText((text) =>
        text
          .setPlaceholder("e.g., 6904ff29000000003702d2b6")
          .setValue(this.plugin.settings.userId)
          .onChange(async (value) => {
            this.plugin.settings.userId = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Download media")
      .setDesc("Download images/videos (default: off to save disk space)")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.downloadMedia)
          .onChange(async (value) => {
            this.plugin.settings.downloadMedia = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Auto scroll delay (ms)")
      .setDesc("Delay between scroll actions when loading favorites (ms)")
      .addSlider((slider) =>
        slider
          .setLimits(500, 5000, 100)
          .setValue(this.plugin.settings.autoScrollDelay)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.autoScrollDelay = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Request delay (ms)")
      .setDesc("Delay between importing each note (ms)")
      .addSlider((slider) =>
        slider
          .setLimits(200, 5000, 100)
          .setValue(this.plugin.settings.requestDelay)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.requestDelay = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("opencli path")
      .setDesc('Path to opencli binary')
      .addText((text) =>
        text
          .setPlaceholder("opencli")
          .setValue(this.plugin.settings.opencliPath)
          .onChange(async (value) => {
            this.plugin.settings.opencliPath = value || "opencli";
            await this.plugin.saveSettings();
          })
      );
  }
}