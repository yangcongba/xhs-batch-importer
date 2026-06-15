import { App, Notice, requestUrl, Vault } from "obsidian";
import type { XHSBatchImporterSettings, XHSNote, NoteDetail } from "./types";
import { parseNoteDetail, generateMarkdown } from "./parser";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getExistingSources(
  vault: Vault,
  folder: string
): Promise<Set<string>> {
  const existing = new Set<string>();
  const files = vault.getFiles().filter((f) => f.path.startsWith(folder));

  for (const file of files) {
    try {
      const content = await vault.read(file);
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (match) {
        const sourceMatch = match[1].match(/source:\s*.+/);
        if (sourceMatch) {
          const idMatch = sourceMatch[0].match(/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
          if (idMatch) {
            existing.add(idMatch[1]);
          }
        }
      }
    } catch {}
  }

  return existing;
}

export async function fetchNoteDetail(
  noteId: string,
  xsecToken: string
): Promise<NoteDetail | null> {
  try {
    const url = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${xsecToken}`;
    const response = await requestUrl({
      url,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });
    const html = response.text;
    return parseNoteDetail(html, noteId);
  } catch (e) {
    console.error(`Failed to fetch note ${noteId}:`, e);
    return null;
  }
}

export async function batchImport(
  app: App,
  notes: XHSNote[],
  category: string,
  settings: XHSBatchImporterSettings,
  onProgress?: (current: number, total: number, title: string) => void
): Promise<{ success: number; failed: number; skipped: number }> {
  let success = 0;
  let failed = 0;
  let skipped = 0;

  const folder = `${settings.defaultFolder}/${category}`;

  try {
    await app.vault.createFolder(folder);
  } catch {}

  const existing = await getExistingSources(app.vault, settings.defaultFolder);

  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];

    if (existing.has(note.id)) {
      skipped++;
      continue;
    }

    onProgress?.(i + 1, notes.length, note.title);

    const detail = await fetchNoteDetail(note.id, note.xsecToken);
    if (!detail) {
      failed++;
      continue;
    }

    const md = generateMarkdown(detail, note.id, note.xsecToken, category);

    const fileName = detail.isVideo ? `[V] ${detail.title}` : detail.title;
    const safeFileName = fileName.replace(/[\\/:*?"<>|]/g, "_").substring(0, 200);
    const filePath = `${folder}/${safeFileName}.md`;

    try {
      await app.vault.create(filePath, md);
      success++;
      existing.add(note.id);
    } catch (e) {
      if (
        e instanceof Error &&
        e.message.includes("already exists")
      ) {
        const uniqueName = `${folder}/${safeFileName} - ${Date.now()}.md`;
        try {
          await app.vault.create(uniqueName, md);
          success++;
          existing.add(note.id);
        } catch {
          failed++;
        }
      } else {
        failed++;
      }
    }

    await sleep(settings.requestDelay);
  }

  return { success, failed, skipped };
}