import type { NoteDetail } from "./types";

export function extractTitle(html: string): string {
  const match = html.match(/<title>(.*?)<\/title>/);
  if (match) {
    return match[1].replace(/ - 小红书$/, "").trim();
  }
  return "Untitled";
}

export function extractContent(html: string): string {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  if (stateMatch) {
    try {
      const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
      const state = JSON.parse(jsonStr);
      const key = Object.keys(state.note.noteDetailMap)[0];
      if (key && state.note.noteDetailMap[key]) {
        const note = state.note.noteDetailMap[key].note;
        return note?.desc || "";
      }
    } catch {}
  }

  const descMatch = html.match(
    /<div id="detail-desc" class="desc">([\s\S]*?)<\/div>/
  );
  if (descMatch) {
    return descMatch[1].replace(/<[^>]+>/g, "").trim();
  }

  return "";
}

export function extractImages(html: string): string[] {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  if (!stateMatch) return [];

  try {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    if (key && state.note.noteDetailMap[key]) {
      const imageList = state.note.noteDetailMap[key].note.imageList || [];
      return imageList
        .map((img: { urlDefault?: string; url?: string }) => img.urlDefault || img.url || "")
        .filter(Boolean);
    }
  } catch {}

  return [];
}

export function extractVideoUrl(html: string): string {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  if (!stateMatch) return "";

  try {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    if (key && state.note.noteDetailMap[key]) {
      const video = state.note.noteDetailMap[key].note.video;
      if (video) {
        return video.consumer?.originVideoKey || video.url || "";
      }
    }
  } catch {}

  return "";
}

export function extractTags(html: string): string[] {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  if (!stateMatch) return [];

  try {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    if (key && state.note.noteDetailMap[key]) {
      const tagList = state.note.noteDetailMap[key].note.tagList || [];
      return tagList.map((t: { name?: string }) => t.name).filter(Boolean);
    }
  } catch {}

  return [];
}

export function isVideoNote(html: string): boolean {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  if (!stateMatch) return false;

  try {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    if (key && state.note.noteDetailMap[key]) {
      return state.note.noteDetailMap[key].note.type === "video";
    }
  } catch {}

  return false;
}

export function extractStats(html: string): {
  likes: number;
  collects: number;
  comments: number;
} {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  const defaults = { likes: 0, collects: 0, comments: 0 };
  if (!stateMatch) return defaults;

  try {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    if (key && state.note.noteDetailMap[key]) {
      const interactInfo = state.note.noteDetailMap[key].note.interactInfo;
      if (interactInfo) {
        return {
          likes: parseInt(interactInfo.likedCount) || 0,
          collects: parseInt(interactInfo.collectedCount) || 0,
          comments: parseInt(interactInfo.commentCount) || 0,
        };
      }
    }
  } catch {}

  return defaults;
}

export function extractAuthor(html: string): string {
  const stateMatch = html.match(
    /window\.__INITIAL_STATE__=(.*?)<\/script>/s
  );
  if (!stateMatch) return "";

  try {
    const jsonStr = stateMatch[1].trim().replace(/undefined/g, "null");
    const state = JSON.parse(jsonStr);
    const key = Object.keys(state.note.noteDetailMap)[0];
    if (key && state.note.noteDetailMap[key]) {
      const user = state.note.noteDetailMap[key].note.user;
      if (user) {
        return user.nickname || "";
      }
    }
  } catch {}

  return "";
}

export function parseNoteDetail(html: string, noteId: string): NoteDetail {
  const stats = extractStats(html);
  return {
    title: extractTitle(html),
    content: extractContent(html),
    images: extractImages(html),
    videoUrl: extractVideoUrl(html),
    tags: extractTags(html),
    isVideo: isVideoNote(html),
    likes: stats.likes,
    collects: stats.collects,
    comments: stats.comments,
    author: extractAuthor(html),
  };
}

export function generateMarkdown(
  detail: NoteDetail,
  noteId: string,
  xsecToken: string,
  category: string
): string {
  const prefix = detail.isVideo ? "[V] " : "";
  const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}?xsec_token=${xsecToken}`;
  const now = new Date();
  const date = now.toISOString().split("T")[0];
  const importTime = now.toISOString();

  const frontmatter = [
    "---",
    `title: "${prefix}${detail.title}"`,
    `source: ${noteUrl}`,
    `date: ${date}`,
    `Imported At: ${importTime}`,
    `category: ${category}`,
    `author: ${detail.author}`,
    `likes: ${detail.likes}`,
    `collects: ${detail.collects}`,
    `comments: ${detail.comments}`,
    "---",
  ].join("\n");

  const parts: string[] = [`\n\n# ${prefix}${detail.title}\n`];

  if (detail.content) {
    parts.push(`\n${detail.content}\n`);
  }

  if (detail.tags.length > 0) {
    parts.push(`\n${detail.tags.map((t) => `#${t}`).join(" ")}\n`);
  }

  if (detail.images.length > 0) {
    for (const img of detail.images) {
      parts.push(`\n![Image](${img})`);
    }
  }

  return frontmatter + parts.join("");
}