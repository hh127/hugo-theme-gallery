#!/usr/bin/env node
/**
 * encrypt-protected.mjs — 构建后加密受保护相册内容
 *
 * 在 hugo build 之后运行：扫描 content/ 下带 password 的页面，
 * 将 public/ 中对应 HTML 的相册内容（图片 URL、EXIF 等）用 AES-256-GCM 加密，
 * 替换为 <script type="application/x-gallery-encrypted"> 数据容器。
 *
 * 前端解密逻辑见 assets/js/password-protect.js（PBKDF2 + AES-GCM）。
 *
 * 用法:
 *   node themes/gallery/scripts/encrypt-protected.mjs [--root <dir>]
 *   --root 站点根目录（默认当前目录），脚本默认读取 <root>/content 与 <root>/public
 */

import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const PBKDF2_ITERATIONS = 150000;

function parseArgs(argv) {
  const args = { root: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1]) {
      args.root = argv[i + 1];
      i++;
    }
  }
  return args;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
    } else if (/\.(md|markdown)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// 提取 YAML/TOML front matter 中的 password 字段（兼容引号/无引号）
function extractPassword(filePath) {
  const content = readFileSync(filePath, "utf8");
  // front matter 区域：--- 或 +++ 包裹的第一段
  const m = content.match(/^(---|\+\+\+)\s*\n([\s\S]*?)\n\1\s*\n/);
  if (!m) return null;
  const fm = m[2];
  const pw = fm.match(/^\s*password\s*:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (!pw) return null;
  return pw[1].trim();
}

// content 页面 → public HTML 输出路径（Hugo 默认 pretty URLs）
function contentToHtmlPath(contentFile, root) {
  const rel = relative(join(root, "content"), contentFile);
  const parts = rel.split(sep);
  const base = parts[parts.length - 1].replace(/\.(md|markdown)$/, "");
  const dirParts = parts.slice(0, -1);
  const isBundleIndex = base === "index" || base === "_index";
  const outDir = isBundleIndex ? join(root, "public", ...dirParts) : join(root, "public", ...dirParts, base);
  return join(outDir, "index.html");
}

// 提取 <div id="gallery" ...> ... </div> 的内部 HTML（处理嵌套 div）
// 注意:
// 1. hugo --minify 会去掉属性引号 (id=gallery)，正则需兼容有无引号
// 2. 必须精确定位 id=gallery，不能误匹配 gallery-wrapper 等（gallery 后需是 引号+空白 / 空白 / / / >）
function extractGalleryInner(html) {
  const startRe = /<div\b[^>]*\bid=["']?gallery["']?[\s/>][^>]*>/;
  const m = startRe.exec(html);
  if (!m) return null;
  const contentStart = m.index + m[0].length;
  const tagRe = /<div\b[^>]*>|<\/div>/g;
  tagRe.lastIndex = contentStart;
  let depth = 1;
  let tm;
  while ((tm = tagRe.exec(html))) {
    if (tm[0] === "</div>") {
      depth--;
      if (depth === 0) {
        return { inner: html.slice(contentStart, tm.index), outerStart: m.index, innerStart: contentStart, contentEnd: tm.index };
      }
    } else {
      depth++;
    }
  }
  return null;
}

function encryptGallery(plainHtml, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainHtml, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // 存储格式: iv(12) || ciphertext || authTag(16)
  // 注意: WebCrypto AES-GCM 要求 tag 附在密文末尾（GCM 标准格式），顺序不能颠倒
  const payload = Buffer.concat([iv, ciphertext, tag]);
  return {
    salt: salt.toString("base64"),
    payload: payload.toString("base64"),
  };
}

function main() {
  const { root } = parseArgs(process.argv);
  const contentDir = join(root, "content");
  const publicDir = join(root, "public");
  if (!statSync(contentDir).isDirectory()) {
    console.error(`✗ content 目录不存在: ${contentDir}`);
    process.exit(1);
  }
  if (!statSync(publicDir).isDirectory()) {
    console.error(`✗ public 目录不存在: ${publicDir}（请先运行 hugo build）`);
    process.exit(1);
  }

  const pages = walk(contentDir).filter((p) => extractPassword(p));
  if (pages.length === 0) {
    console.log("✓ 没有需要加密的受保护页面");
    return;
  }

  let ok = 0;
  let warn = 0;
  for (const page of pages) {
    const password = extractPassword(page);
    const htmlPath = contentToHtmlPath(page, root);
    let html;
    try {
      html = readFileSync(htmlPath, "utf8");
    } catch {
      console.warn(`⚠ 跳过: 找不到输出文件 ${htmlPath}（页面 ${relative(root, page)} 可能未构建）`);
      warn++;
      continue;
    }

    // 防重复处理：已加密则跳过
    if (html.includes("application/x-gallery-encrypted")) {
      console.log(`↷ 已加密，跳过: ${relative(root, page)}`);
      ok++;
      continue;
    }

    const gallery = extractGalleryInner(html);
    if (!gallery) {
      console.warn(`⚠ 跳过: 未找到 #gallery 容器 ${relative(root, page)}`);
      warn++;
      continue;
    }
    if (!gallery.inner.trim()) {
      console.warn(`⚠ 跳过: #gallery 内容为空 ${relative(root, page)}`);
      warn++;
      continue;
    }

    const { salt, payload } = encryptGallery(gallery.inner, password);
    // 存储协议: 文本内容 = base64( iv(12) || authTag(16) || ciphertext )，salt 放 data-salt
    const finalScript = `<script type="application/x-gallery-encrypted" data-salt="${salt}">${payload}</script>`;

    const newHtml = html.slice(0, gallery.innerStart) + finalScript + html.slice(gallery.contentEnd);
    writeFileSync(htmlPath, newHtml);
    ok++;
    console.log(`✓ 已加密: ${relative(root, page)} (${(gallery.inner.length / 1024).toFixed(1)} KB → 密文)`);
  }
  console.log(`\n完成: ${ok} 个页面已加密, ${warn} 个警告`);
}

main();
