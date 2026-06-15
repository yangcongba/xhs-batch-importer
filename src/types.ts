export interface XHSNote {
  id: string;
  title: string;
  type: string;
  coverUrl: string;
  nickname: string;
  xsecToken: string;
}

export interface NoteDetail {
  title: string;
  content: string;
  images: string[];
  videoUrl: string;
  tags: string[];
  isVideo: boolean;
  likes: number;
  collects: number;
  comments: number;
  author: string;
}

export type ImportMode = "full" | "incremental";

export interface XHSBatchImporterSettings {
  defaultFolder: string;
  categories: string[];
  downloadMedia: boolean;
  autoScrollDelay: number;
  requestDelay: number;
  opencliPath: string;
  userId: string;
  importMode: ImportMode;
}

export const DEFAULT_SETTINGS: XHSBatchImporterSettings = {
  defaultFolder: "XHS Notes",
  categories: ["AI", "美术", "旅行", "美食", "知识", "娱乐"],
  downloadMedia: false,
  autoScrollDelay: 1500,
  requestDelay: 1000,
  opencliPath: "/Users/yangfan/.npm-global/bin/opencli",
  userId: "",
  importMode: "incremental",
};