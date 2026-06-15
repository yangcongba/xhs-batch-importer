import { exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { XHSNote } from "./types";

const execAsync = promisify(exec);

const EXTRA_PATH = "/Users/yangfan/.npm-global/bin:/usr/local/bin:/opt/homebrew/bin";
const EXEC_ENV = Object.assign({}, process.env, {
  PATH: `${process.env.PATH}:${EXTRA_PATH}`,
  HOME: "/Users/yangfan",
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EXTRACT_USERID_JS = `document.querySelector('#app').__vue_app__.config.globalProperties['$pinia'].state.value.user.userInfo.userId`;

const EXTRACT_COUNT_JS = `var p=document.querySelector('#app').__vue_app__.config.globalProperties['$pinia'];var t=p.state.value.user.notes['1'];Object.keys(t).length`;

const EXTRACT_FAVORITES_JS = `var p=document.querySelector('#app').__vue_app__.config.globalProperties['$pinia'];var t=p.state.value.user.notes['1'];var r=[];for(var k in t){var n=t[k];if(n&&n.noteCard){var nc=n.noteCard;r.push({id:nc.noteId||n.id,title:nc.displayTitle||'',type:nc.type||'normal',coverUrl:nc.cover?nc.cover.urlDefault:'',nickname:nc.user?nc.user.nickname:'',xsecToken:nc.xsecToken||n.xsecToken||''});}}JSON.stringify(r)`;

const EXTRACT_FAVORITES_IDS_JS = `var p=document.querySelector('#app').__vue_app__.config.globalProperties['$pinia'];var t=p.state.value.user.notes['1'];var r=[];for(var k in t){var n=t[k];if(n&&n.noteCard){r.push(n.noteCard.noteId||n.id)}}JSON.stringify(r)`;

function writeTempJs(content: string): string {
  const file = join(tmpdir(), `xhs_eval_${Date.now()}.js`);
  writeFileSync(file, content, "utf-8");
  return file;
}

export class OpenCLIClient {
  private opencliPath: string;
  private session = "xhs";
  private scrollDelay: number;

  constructor(opencliPath: string, scrollDelay: number) {
    this.opencliPath = opencliPath;
    this.scrollDelay = scrollDelay;
  }

  private async exec(cmd: string, opts?: Record<string, unknown>) {
    return execAsync(cmd, { ...opts, env: EXEC_ENV });
  }

  private async evalJs(jsCode: string): Promise<string> {
    const tmpFile = writeTempJs(jsCode);
    try {
      const cmd = `${this.opencliPath} browser ${this.session} eval "$(cat '${tmpFile}')"`;
      const { stdout } = await this.exec(cmd);
      return stdout.trim();
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  async checkAvailable(): Promise<{ available: boolean; error?: string }> {
    try {
      const { stdout, stderr } = await this.exec(`${this.opencliPath} doctor 2>&1`, {
        timeout: 15000,
      });
      const output = stdout + "\n" + stderr;
      if (output.includes("[OK] Extension: connected")) {
        return { available: true };
      }
      return { available: false, error: `opencli 连接异常:\n${output.substring(0, 500)}` };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { available: false, error: `无法运行 opencli:\n${msg.substring(0, 500)}` };
    }
  }

  async getCurrentUserId(): Promise<string> {
    const result = await this.evalJs(EXTRACT_USERID_JS);
    return result.replace(/"/g, "");
  }

  private async waitForPageReady(userId: string, maxRetries: number = 2, onProgress?: (msg: string) => void): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        onProgress?.(`页面加载失败，第 ${attempt + 1} 次重试...`);
        await this.evalJs("location.reload()");
        await sleep(5000);
      }

      await sleep(4000);

      for (let check = 0; check < 10; check++) {
        const title = await this.evalJs("document.title");
        if (title && title.includes("小红书")) {
          const userIdCheck = await this.evalJs(EXTRACT_USERID_JS).catch(() => "");
          if (userIdCheck && userIdCheck.length > 10) {
            return true;
          }
        }
        await sleep(2000);
      }
    }
    return false;
  }

  private async dismissPopups(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      try {
        await this.evalJs(
          "document.querySelectorAll('button').forEach(function(b){if(b.textContent.includes('我知道了'))b.click()})"
        );
        await sleep(300);
      } catch {}
    }
    try {
      await this.evalJs(
        "document.querySelectorAll('button').forEach(function(b){if(b.textContent.includes('申诉'))b.parentElement&&b.parentElement.removeChild(b)})"
      );
    } catch {}
  }

  private async clickFavoritesTab(): Promise<boolean> {
    try {
      await this.evalJs(
        "document.querySelectorAll('span').forEach(function(s){if(s.textContent==='收藏')s.click()})"
      );
      await sleep(2000);

      const checkUrl = await this.evalJs("window.location.href");
      if (checkUrl.includes("tab=fav")) {
        return true;
      }

      await this.evalJs(
        "document.querySelectorAll('span').forEach(function(s){if(s.textContent==='收藏')s.click()})"
      );
      await sleep(2000);

      const checkUrl2 = await this.evalJs("window.location.href");
      return checkUrl2.includes("tab=fav");
    } catch {
      return false;
    }
  }

  async getFavorites(userId: string, mode: "full" | "incremental", stopAtId: string | undefined, onProgress?: (msg: string) => void): Promise<XHSNote[]> {
    onProgress?.("Opening your profile page...");
    await this.exec(
      `${this.opencliPath} browser ${this.session} open "https://www.xiaohongshu.com/user/profile/${userId}"`
    );

    const ready = await this.waitForPageReady(userId, 2, onProgress);
    if (!ready) {
      throw new Error("页面加载失败，请检查：\n1. 小红书是否已登录\n2. 网络是否正常\n3. userId 是否正确");
    }

    onProgress?.("Dismissing popups...");
    await this.dismissPopups();
    await sleep(500);

    onProgress?.("Clicking favorites tab...");
    const tabClicked = await this.clickFavoritesTab();
    if (!tabClicked) {
      const debugInfo = await this.evalJs(
        "var spans=document.querySelectorAll('span');var texts=[];for(var i=0;i<spans.length;i++)texts.push(spans[i].textContent.trim());JSON.stringify(texts.filter(function(t){return t.length>0&&t.length<10}).slice(0,30))"
      ).catch(() => "failed to get debug info");
      throw new Error(`未找到收藏标签页。页面文本: ${debugInfo.substring(0, 300)}`);
    }

    onProgress?.(mode === "incremental" && stopAtId
      ? "Scrolling to find new favorites (incremental)..."
      : "Scrolling to load all favorites...");
    let lastCount = 0;
    let stable = 0;
    const maxIterations = 200;

    for (let i = 0; i < maxIterations; i++) {
      await this.exec(`${this.opencliPath} browser ${this.session} scroll down`);
      await sleep(this.scrollDelay);

      try {
        const countStr = await this.evalJs(EXTRACT_COUNT_JS);
        const count = parseInt(countStr);
        if (isNaN(count)) {
          stable++;
          if (stable >= 5) break;
          continue;
        }
        onProgress?.(`Loaded ${count} favorites...`);

        if (stopAtId) {
          const idsStr = await this.evalJs(EXTRACT_FAVORITES_IDS_JS);
          try {
            const currentIds: string[] = JSON.parse(idsStr);
            if (currentIds.includes(stopAtId)) {
              onProgress?.("Found last known favorite, stopping...");
              break;
            }
          } catch {}
        }

        if (count === lastCount) {
          stable++;
          if (stable >= 3) break;
        } else {
          stable = 0;
        }
        lastCount = count;
      } catch {
        stable++;
        if (stable >= 5) break;
      }
    }

    onProgress?.("Extracting favorites data...");
    const json = await this.evalJs(EXTRACT_FAVORITES_JS);

    let result: XHSNote[];
    try {
      result = JSON.parse(json);
    } catch {
      const match = json.match(/\[.*\]/s);
      if (match) {
        result = JSON.parse(match[0]);
      } else {
        throw new Error("Failed to parse favorites data from opencli. Raw output: " + json.substring(0, 200));
      }
    }

    onProgress?.(`Found ${result.length} favorites`);
    return result;
  }
}