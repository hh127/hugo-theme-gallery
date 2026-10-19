/**
 * site.mjs — 站点内容模型：相册 / 图片 / 游记 / 页面 的读写。
 *
 * 这个主题的真实数据模型（读模板得到的事实，不是猜想）：
 *   - 相册 = content/<dir>/index.md + 目录里的图片文件（page bundle）
 *   - 显示哪些图：`where (.Resources.ByType "image") "Params.hidden" "ne" true`
 *     → 由**目录里的文件**决定，order 由**文件名**决定（Hugo 不受 weight/title 影响，已实测）
 *   - 单图标题/EXIF：front matter 的 `images:` 列表，按文件名做 key→meta 映射（不决定顺序）
 *   - 单图 hidden / cover 标记：front matter 的 `resources:` 列表的 params
 *   所以一个文件会同时出现在 `images:`（元数据）和 `resources:`（开关）两处，本模块负责保持两者一致。
 */

import fs from 'node:fs';
import path from 'node:path';
import { splitFrontMatter, joinFrontMatter, parseYaml, setScalar, setListBlock } from './yaml.mjs';

export const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.tif', '.tiff']);
const META_KEYS = ['title', 'description'];
const PARAM_KEYS = ['camera', 'lens', 'iso', 'aperture', 'exposure', 'focal', 'date'];
const ALBUM_SCALARS = ['title', 'description', 'featured', 'private', 'password', 'featured_image'];

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const natural = (a, b) => collator.compare(a, b);

function isImg(name) {
  return IMG_EXT.has(path.extname(name).toLowerCase());
}

function cleanEmpty(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined || v === null || v === '') delete obj[k];
  }
  return obj;
}

/** 把 patch（title/description/params）套到一条 images: 元数据上，空值即删除。 */
function applyMetaPatch(entry, patch) {
  if ('title' in patch) entry.title = patch.title || undefined;
  if ('description' in patch) entry.description = patch.description || undefined;
  if (patch.params) {
    entry.params = { ...(entry.params || {}) };
    for (const k of PARAM_KEYS) if (k in patch.params) entry.params[k] = patch.params[k] || undefined;
    cleanEmpty(entry.params);
    if (Object.keys(entry.params).length === 0) delete entry.params;
  }
  for (const k of META_KEYS) if (k in entry && !entry[k]) delete entry[k];
  return entry;
}

/** 条目是否有意义（否则从 images: 里删掉，保持 front matter 干净）。 */
function metaMeaningful(entry) {
  return META_KEYS.some((k) => entry[k]) || (entry.params && Object.keys(entry.params).length > 0);
}

/**
 * 远程图片链接的硬性校验。
 * 主题在 gallery.html:115 直接调用 resources.GetRemote，**没有 try 兜底**：
 * 链接抓不到（域名不存在、404、超时）或被 Hugo 安全策略拒绝，整站构建会直接失败。
 * Hugo 0.163.3 默认 security.http.urls = ['(?i)^https?://[a-z0-9]', '! ^https?://\d+\.',
 * '! (?i)localhost', '! (?i)^https?://[^/?#]*@'] —— 即禁止 IP 直链、localhost 和带账号密码的 URL。
 * 返回 null（可用）或错误说明字符串。
 */
export function remoteUrlProblem(url) {
  const u = String(url || '').trim();
  if (!u) return '链接不能为空';
  if (!/^https?:\/\/\S+$/i.test(u)) return '请填写以 http:// 或 https:// 开头的图片直链';
  if (/[\s"'<>]/.test(u)) return '链接里不能有空格或引号';
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return '链接格式不正确';
  }
  if (parsed.username || parsed.password) return '链接里不能带账号密码（Hugo 安全策略会拒绝）';
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return '不能用 localhost：Hugo 安全策略禁止抓取 localhost，构建会失败';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return '不能用 IP 直链：Hugo 安全策略禁止抓取 IP 地址（如 127.0.0.1、192.168.…），请换成域名';
  }
  if (parsed.protocol === 'http:') return null; // 允许，但由 warnings 提醒混合内容
  return null;
}

export class Site {
  constructor(root) {
    this.root = path.resolve(root);
    this.contentDir = path.join(this.root, 'content');
    this.trashDir = path.join(this.root, '.admin-trash');
  }

  /* ------------------------------------------------------------ 基础工具 */

  abs(rel) {
    const p = path.resolve(this.root, rel);
    const r = path.relative(this.root, p);
    if (r.startsWith('..') || path.isAbsolute(r)) throw new Error(`路径越界: ${rel}`);
    return p;
  }

  rel(abs) {
    return path.relative(this.root, abs).split(path.sep).join('/');
  }

  read(rel) {
    return fs.readFileSync(this.abs(rel), 'utf8');
  }

  write(rel, text) {
    const p = this.abs(rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text, 'utf8');
    return this.rel(p);
  }

  exists(rel) {
    try {
      return fs.existsSync(this.abs(rel));
    } catch {
      return false;
    }
  }

  toTrash(rel) {
    const src = this.abs(rel);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let dst = path.join(this.trashDir, stamp, rel);
    // 同一批里可能已经有同名条目（例如先删图、再删整个相册），加重名后缀避免覆盖/EPERM
    if (fs.existsSync(dst)) {
      let n = 1;
      while (fs.existsSync(`${dst}~${n}`)) n++;
      dst = `${dst}~${n}`;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.renameSync(src, dst);
    return this.rel(dst);
  }

  hasIndex(dirRel) {
    return fs.existsSync(path.join(this.abs(dirRel), 'index.md'));
  }

  listDirs(relDir) {
    const abs = this.abs(relDir);
    if (!fs.existsSync(abs)) return [];
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name);
  }

  /* -------------------------------------------------------------- 站点配置 */

  config() {
    const text = this.read('hugo.toml');
    const grab = (re, dflt) => {
      const m = re.exec(text);
      return m ? m[1].trim().replace(/^["']|["']$/g, '') : dflt;
    };
    return {
      baseURL: grab(/^baseURL\s*=\s*(.+)$/m, '/'),
      language: grab(/^defaultContentLanguage\s*=\s*(.+)$/m, 'zh'),
      defaultTheme: grab(/defaultTheme\s*=\s*(.+)$/m, 'dark'),
      vaultPath: grab(/vaultPath\s*=\s*(.+)$/m, ''),
      cdnResize: grab(/cdnResize\s*=\s*(.+)$/m, '?x-oss-process=image/resize,w_600'),
      boxSpacing: grab(/boxSpacing\s*=\s*(.+)$/m, ''),
      targetRowHeight: grab(/targetRowHeight\s*=\s*(.+)$/m, ''),
    };
  }

  exifIndex() {
    try {
      return JSON.parse(this.read('data/exif.json'));
    } catch {
      return {};
    }
  }

  /* ------------------------------------------------------------------ 相册 */

  albumSummary(dir) {
    const a = this.readAlbum(dir);
    return {
      dir,
      title: a.title || dir,
      description: a.description || '',
      imageCount: a.images.length + (a.remoteCount || 0),
      localCount: a.images.length,
      remoteCount: a.remoteCount || 0,
      visibleCount: a.images.filter((i) => !i.hidden).length,
      hiddenCount: a.images.filter((i) => i.hidden).length,
      featured: !!a.featured,
      private: !!a.private,
      password: typeof a.password === 'string' ? a.password : '',
      cover: a.coverImage,
      bytes: a.bytes,
      mtime: a.mtime,
      warnings: a.warnings,
    };
  }

  readAlbum(dir) {
    const dirRel = `content/${dir}`;
    const fileRel = `${dirRel}/index.md`;
    if (!this.exists(fileRel)) throw new Error(`相册不存在: ${dir}`);
    const raw = this.read(fileRel);
    const { fm, body } = splitFrontMatter(raw);
    const obj = parseYaml(fm) || {};
    const dirAbs = this.abs(dirRel);
    const files = fs
      .readdirSync(dirAbs, { withFileTypes: true })
      .filter((d) => d.isFile() && isImg(d.name))
      .map((d) => d.name)
      .sort(natural);

    const metaList = Array.isArray(obj.images) ? obj.images : [];
    const resList = Array.isArray(obj.resources) ? obj.resources : [];
    const metaByName = new Map();
    for (const m of metaList) {
      if (m && typeof m === 'object' && m.src) metaByName.set(String(m.src), m);
    }
    const resByName = new Map();
    for (const r of resList) {
      if (r && typeof r === 'object' && r.src) resByName.set(String(r.src), r);
    }

    let bytes = 0;
    const images = files.map((name) => {
      const st = fs.statSync(path.join(dirAbs, name));
      bytes += st.size;
      const m = metaByName.get(name) || {};
      const r = resByName.get(name) || {};
      const rp = r.params || {};
      return {
        name,
        size: st.size,
        mtime: st.mtimeMs,
        hasMeta: metaByName.has(name),
        title: m.title || '',
        description: m.description || '',
        params: PARAM_KEYS.reduce((acc, k) => {
          acc[k] = (m.params && m.params[k]) || '';
          return acc;
        }, {}),
        hidden: rp.hidden === true,
        cover: rp.cover === true,
      };
    });

    const seen = new Set(files);

    /* ---- 远程（云端）图片：front matter 的 remote_images，元数据同样放在 images: 里，key = URL ---- */
    const cdnResize = this.config().cdnResize || '';
    const remoteUrls = (Array.isArray(obj.remote_images) ? obj.remote_images : [])
      .map((u) => (u == null ? '' : String(u).trim()))
      .filter(Boolean);
    const remoteImages = remoteUrls.map((url) => {
      const m = metaByName.get(url) || {};
      return {
        name: url,
        url,
        remote: true,
        thumbUrl: /^https?:\/\//i.test(url) ? url + (cdnResize || '') : url,
        title: m.title || '',
        description: m.description || '',
        hasMeta: metaByName.has(url),
        params: PARAM_KEYS.reduce((acc, k) => {
          acc[k] = (m.params && m.params[k]) || '';
          return acc;
        }, {}),
      };
    });
    const localOnlyMeta = metaList.filter((m) => m && m.src && !seen.has(String(m.src)) && !remoteUrls.includes(String(m.src)));

    const orphanMeta = localOnlyMeta
      .map((m) => ({ src: String(m.src), title: m.title || '' }));
    const orphanResources = resList
      .filter((r) => r && r.src && !seen.has(String(r.src)))
      .map((r) => String(r.src));

    const covers = images.filter((i) => i.cover);
    const first = images.filter((i) => !i.hidden)[0] || images[0];
    const warnings = [];
    if (typeof obj.password === 'string' && obj.password) {
      if (obj.password.length < 8 || /^(123456|password|admin|000000|111111)$/i.test(obj.password))
        warnings.push('弱口令：请尽快更换，仓库里任何人都能看到');
      warnings.push('密码保护只挡 URL 列表，构建后的图片文件仍可通过直链下载');
    }
    if (obj.private === true && typeof obj.password === 'string' && obj.password)
      warnings.push('private 与 password 同时设置：private 已让页面不生成，密码形同虚设');
    if (bytes > 20 * 1024 * 1024) warnings.push(`原图占用 ${(bytes / 1048576).toFixed(1)} MB（仓库体积；相册页访客下载的是构建生成的 WebP，不受影响）`);
    if (orphanMeta.length) warnings.push(`${orphanMeta.length} 条 images 元数据找不到对应文件`);
    if (remoteImages.length && images.length)
      warnings.push('本地图与远程图混用：首页/相册卡片只统计远程图并只用第一张远程图做封面（主题行为），建议一个相册只用一种来源');
    if (remoteImages.length && !/^https:\/\//i.test(remoteImages[0].url))
      warnings.push('远程图用的是 http://，浏览器可能拦截混合内容，建议改用 https://');

    const exif = this.exifIndex()[dir] || {};

    return {
      dir,
      file: fileRel,
      title: obj.title || '',
      description: obj.description || '',
      featured: obj.featured === true,
      private: obj.private === true,
      password: typeof obj.password === 'string' ? obj.password : '',
      featuredImage: obj.featured_image || '',
      body,
      fm,
      raw,
      images,
      remoteImages,
      remoteCount: remoteImages.length,
      cdnResize,
      orphanMeta,
      orphanResources,
      exifAvailable: Object.keys(exif),
      bytes,
      mtime: fs.statSync(this.abs(fileRel)).mtimeMs,
      coverImage: obj.featured_image || (covers[0] && covers[0].name) || (first && first.name) || '',
      warnings,
    };
  }

  createAlbum(dir, { title, description } = {}) {
    const slug = String(dir || '')
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) throw new Error('目录名不能为空');
    const dirRel = `content/${slug}`;
    if (this.exists(dirRel)) throw new Error(`目录已存在: ${dirRel}`);
    fs.mkdirSync(this.abs(dirRel), { recursive: true });
    const fm = [
      `title: ${title ? `"${String(title).replace(/"/g, '\\"')}"` : `"${slug}"`}`,
      description ? `description: "${String(description).replace(/"/g, '\\"')}"` : null,
    ]
      .filter(Boolean)
      .join('\n');
    this.write(`${dirRel}/index.md`, `---\n${fm}\n---\n`);
    return this.readAlbum(slug);
  }

  deleteAlbum(dir) {
    const dirRel = `content/${dir}`;
    if (!this.exists(`${dirRel}/index.md`)) throw new Error(`相册不存在: ${dir}`);
    return this.toTrash(dirRel);
  }

  patchAlbum(dir, patch = {}) {
    const fileRel = `content/${dir}/index.md`;
    let { fm, body, sep, eol } = splitFrontMatter(this.read(fileRel));
    for (const key of ALBUM_SCALARS) {
      if (!(key in patch)) continue;
      const v = patch[key];
      if (v === '' || v === null || v === undefined || v === false) {
        // false / 空值都表示「没有这个标记」→ 直接删键，避免多出 featured: false 这类噪音行
        fm = setScalar(fm, key, undefined, { remove: true });
      } else {
        fm = setScalar(fm, key, v);
      }
    }
    this.write(fileRel, joinFrontMatter(fm, body, sep, eol));
    return this.readAlbum(dir);
  }

  /* ------------------------------------------------------------------ 图片 */

  uploadImage(dir, filename, buffer) {
    const dirRel = `content/${dir}`;
    if (!this.exists(`${dirRel}/index.md`)) throw new Error(`相册不存在: ${dir}`);
    let base = path.basename(String(filename || 'image.jpg')).normalize('NFC');
    base = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^[.\s]+/, '').trim();
    const ext = path.extname(base).toLowerCase();
    if (!IMG_EXT.has(ext)) throw new Error(`不支持的图片格式: ${ext || '(无扩展名)'}`);
    const stem = base.slice(0, base.length - ext.length) || 'image';
    let name = `${stem}${ext}`;
    let n = 1;
    while (fs.existsSync(path.join(this.abs(dirRel), name))) name = `${stem}-${n++}${ext}`;
    fs.writeFileSync(path.join(this.abs(dirRel), name), buffer);
    return { name, size: buffer.length };
  }

  /** 同时更新 images:（标题/描述/EXIF）与 resources:（hidden/cover），未管理的键原样保留。 */
  patchImage(dir, name, patch = {}) {
    const fileRel = `content/${dir}/index.md`;
    let { fm, body, sep, eol } = splitFrontMatter(this.read(fileRel));
    const obj = parseYaml(fm) || {};
    const metaList = (Array.isArray(obj.images) ? obj.images : []).map((m) => ({ ...m }));
    const resList = (Array.isArray(obj.resources) ? obj.resources : []).map((r) => ({ ...r }));

    let target = String(name);
    if (patch.newName && patch.newName !== name) {
      const nn = String(patch.newName).replace(/[\\/:*?"<>|]+/g, '_').trim();
      const srcAbs = path.join(this.abs(`content/${dir}`), name);
      const dstAbs = path.join(this.abs(`content/${dir}`), nn);
      if (!isImg(nn)) throw new Error('新文件名必须是图片格式');
      if (fs.existsSync(dstAbs)) throw new Error(`文件名已存在: ${nn}`);
      fs.renameSync(srcAbs, dstAbs);
      target = nn;
    }

    // ---- images: 元数据 ----
    let entry = metaList.find((m) => m && String(m.src) === String(name)) || { src: target };
    entry.src = target;
    if ('title' in patch) entry.title = patch.title || undefined;
    if ('description' in patch) entry.description = patch.description || undefined;
    if (patch.params) {
      entry.params = { ...(entry.params || {}) };
      for (const k of PARAM_KEYS) {
        if (k in patch.params) entry.params[k] = patch.params[k] || undefined;
      }
      cleanEmpty(entry.params);
      if (Object.keys(entry.params).length === 0) delete entry.params;
    }
    for (const k of META_KEYS) if (k in entry && !entry[k]) delete entry[k];
    const metaMeaningful = META_KEYS.some((k) => entry[k]) || (entry.params && Object.keys(entry.params).length);
    const mi = metaList.findIndex((m) => m && String(m.src) === String(name));
    if (metaMeaningful) {
      if (mi >= 0) metaList[mi] = entry;
      else metaList.push(entry);
    } else if (mi >= 0) {
      metaList.splice(mi, 1);
    }

    // ---- resources: hidden / cover 开关 ----
    const ri = resList.findIndex((r) => r && String(r.src) === String(name));
    const resEntry = ri >= 0 ? { ...resList[ri] } : { src: target };
    resEntry.src = target;
    resEntry.params = { ...(resEntry.params || {}) };
    if ('hidden' in patch) {
      if (patch.hidden) resEntry.params.hidden = true;
      else delete resEntry.params.hidden;
    }
    if ('cover' in patch) {
      if (patch.cover) resEntry.params.cover = true;
      else delete resEntry.params.cover;
    }
    const resMeaningful = Object.keys(resEntry.params).length > 0;
    if (resMeaningful) {
      if (ri >= 0) resList[ri] = resEntry;
      else resList.push(resEntry);
    } else if (ri >= 0) {
      resList.splice(ri, 1);
    }

    // 保持与目录中文件一致的顺序
    const order = this.readAlbum(dir).images.map((i) => i.name);
    const sortByOrder = (list) =>
      list
        .map((e, i) => [e, i])
        .sort((a, b) => {
          const ia = order.indexOf(String(a[0].src));
          const ib = order.indexOf(String(b[0].src));
          return (ia < 0 ? 1e6 + a[1] : ia) - (ib < 0 ? 1e6 + b[1] : ib);
        })
        .map(([e]) => e);

    fm = setListBlock(fm, 'images', sortByOrder(metaList));
    fm = setListBlock(fm, 'resources', sortByOrder(resList));
    this.write(fileRel, joinFrontMatter(fm, body, sep, eol));
    return this.readAlbum(dir);
  }

  deleteImage(dir, name) {
    const rel = `content/${dir}/${name}`;
    if (!this.exists(rel)) throw new Error(`文件不存在: ${name}`);
    const trashed = this.toTrash(rel);
    const fileRel = `content/${dir}/index.md`;
    let { fm, body, sep, eol } = splitFrontMatter(this.read(fileRel));
    const obj = parseYaml(fm) || {};
    const metaList = (Array.isArray(obj.images) ? obj.images : []).filter((m) => !(m && String(m.src) === String(name)));
    const resList = (Array.isArray(obj.resources) ? obj.resources : []).filter((r) => !(r && String(r.src) === String(name)));
    fm = setListBlock(fm, 'images', metaList);
    fm = setListBlock(fm, 'resources', resList);
    this.write(fileRel, joinFrontMatter(fm, body, sep, eol));
    return { trashed, album: this.readAlbum(dir) };
  }

  /**
   * 应用排序：Hugo 按文件名排序展示，所以「拖拽排序」落盘 = 加 NN- 前缀重命名，
   * 同时把 images:/resources: 里的 src 一起改掉（保持一致）。
   */
  reorderAlbum(dir, order) {
    const album = this.readAlbum(dir);
    const current = album.images.map((i) => i.name);
    const wanted = (Array.isArray(order) ? order : []).filter((n) => current.includes(n));
    for (const n of current) if (!wanted.includes(n)) wanted.push(n);
    const mapping = [];
    const staged = [];
    wanted.forEach((name, idx) => {
      const stem = name.replace(/^\d{2,4}[-_ ]/, '');
      const newName = `${String(idx + 1).padStart(2, '0')}-${stem}`;
      if (newName !== name) mapping.push({ from: name, to: newName });
      staged.push({ name, newName });
    });
    if (!mapping.length) return { album, mapping };

    // 两阶段重命名，避免 a→b 与 b→a 互相覆盖
    const tmp = [];
    staged.forEach((s, i) => {
      if (s.name === s.newName) {
        tmp.push({ tmp: s.name, final: s.name });
        return;
      }
      const tmpName = `.tmp-${Date.now()}-${i}${path.extname(s.name)}`;
      fs.renameSync(path.join(this.abs(`content/${dir}`), s.name), path.join(this.abs(`content/${dir}`), tmpName));
      tmp.push({ tmp: tmpName, final: s.newName });
    });
    for (const t of tmp) {
      if (t.tmp !== t.final)
        fs.renameSync(path.join(this.abs(`content/${dir}`), t.tmp), path.join(this.abs(`content/${dir}`), t.final));
    }

    const fileRel = `content/${dir}/index.md`;
    let { fm, body, sep, eol } = splitFrontMatter(this.read(fileRel));
    const obj = parseYaml(fm) || {};
    const renameMap = new Map(mapping.map((m) => [m.from, m.to]));
    const fix = (list) =>
      (Array.isArray(list) ? list : []).map((e) => {
        if (e && e.src && renameMap.has(String(e.src))) return { ...e, src: renameMap.get(String(e.src)) };
        return e;
      });
    fm = setListBlock(fm, 'images', fix(obj.images));
    fm = setListBlock(fm, 'resources', fix(obj.resources));
    this.write(fileRel, joinFrontMatter(fm, body, sep, eol));
    return { album: this.readAlbum(dir), mapping };
  }

  /* -------------------------------------------------------------- 远程图片 */
  /*
   * 主题里远程图片只存在于 front matter：
   *   remote_images:            # URL 列表，决定顺序（本地图在前，远程图在后）
   *     - https://cdn.example.com/a.jpg
   *   images:                   # 元数据，key（src）= 同一个 URL
   *     - src: https://cdn.example.com/a.jpg
   *       title: ...
   *       params: { camera: ... }
   * 注意（读模板得到的事实）：
   *   - 一旦 remote_images 非空，get-gallery 的卡片封面与张数**只统计远程图**，本地图被忽略；
   *   - 远程图不支持 hidden/cover 开关（主题只对 .Resources 生效），封面固定取第一条；
   *   - 缩略图 = 原图 URL + params.gallery.cdnResize（默认阿里云 OSS 的 ?x-oss-process=...）。
   */

  remoteState(fileRel) {
    const { fm, body, sep, eol } = splitFrontMatter(this.read(fileRel));
    const obj = parseYaml(fm) || {};
    const urls = (Array.isArray(obj.remote_images) ? obj.remote_images : []).map((u) => String(u).trim()).filter(Boolean);
    const metaList = (Array.isArray(obj.images) ? obj.images : []).map((m) => ({ ...m }));
    return { fm, body, sep, eol, urls, metaList };
  }

  addRemoteImage(dir, { url, title, description, params } = {}) {
    const u = String(url || '').trim();
    const bad = remoteUrlProblem(u);
    if (bad) throw new Error(bad);
    const fileRel = `content/${dir}/index.md`;
    if (!this.exists(fileRel)) throw new Error(`相册不存在: ${dir}`);
    const st = this.remoteState(fileRel);
    if (st.urls.includes(u)) throw new Error('这个链接已经在相册里了');
    st.urls.push(u);
    const entry = applyMetaPatch({ src: u }, { title, description, params });
    if (metaMeaningful(entry)) st.metaList.push(entry);
    let fm = setListBlock(st.fm, 'remote_images', st.urls);
    fm = setListBlock(fm, 'images', st.metaList);
    this.write(fileRel, joinFrontMatter(fm, st.body, st.sep, st.eol));
    return this.readAlbum(dir);
  }

  /** patch.url 可以改链接（同时改 remote_images 与 images: 里的 key）。 */
  patchRemoteImage(dir, url, patch = {}) {
    const fileRel = `content/${dir}/index.md`;
    const st = this.remoteState(fileRel);
    const i = st.urls.findIndex((u) => u === String(url));
    if (i < 0) throw new Error(`远程图片不存在: ${url}`);
    let target = st.urls[i];

    if (patch.url && String(patch.url).trim() !== target) {
      const nu = String(patch.url).trim();
      const bad = remoteUrlProblem(nu);
      if (bad) throw new Error(bad);
      if (st.urls.includes(nu)) throw new Error('新链接已经在相册里了');
      st.urls[i] = nu;
      target = nu;
      const m = st.metaList.find((x) => x && String(x.src) === String(url));
      if (m) m.src = nu;
    }

    const mi = st.metaList.findIndex((m) => m && String(m.src) === target);
    const entry = applyMetaPatch(mi >= 0 ? st.metaList[mi] : { src: target }, patch);
    if (metaMeaningful(entry)) {
      if (mi >= 0) st.metaList[mi] = entry;
      else st.metaList.push(entry);
    } else if (mi >= 0) {
      st.metaList.splice(mi, 1);
    }

    let fm = setListBlock(st.fm, 'remote_images', st.urls);
    fm = setListBlock(fm, 'images', st.metaList);
    this.write(fileRel, joinFrontMatter(fm, st.body, st.sep, st.eol));
    return this.readAlbum(dir);
  }

  deleteRemoteImage(dir, url) {
    const fileRel = `content/${dir}/index.md`;
    const st = this.remoteState(fileRel);
    const u = String(url);
    if (!st.urls.includes(u)) throw new Error(`远程图片不存在: ${url}`);
    st.urls = st.urls.filter((x) => x !== u);
    st.metaList = st.metaList.filter((m) => !(m && String(m.src) === u));
    let fm = setListBlock(st.fm, 'remote_images', st.urls);
    fm = setListBlock(fm, 'images', st.metaList);
    this.write(fileRel, joinFrontMatter(fm, st.body, st.sep, st.eol));
    return this.readAlbum(dir);
  }

  /**
   * 探测单个远程链接（GET + Range: bytes=0-2047，不整张下载）。
   * 返回 { url, ok, status, type, bytes, error }。
   */
  async probeRemoteUrl(url) {
    const u = String(url || '').trim();
    const bad = remoteUrlProblem(u);
    if (bad) return { url: u, ok: false, status: 0, type: '', bytes: 0, error: bad };
    try {
      const res = await fetch(u, {
        redirect: 'follow',
        headers: { Range: 'bytes=0-2047' },
        signal: AbortSignal.timeout(15000),
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const type = String(res.headers.get('content-type') || '').split(';')[0].trim();
      if (!res.ok && res.status !== 206) return { url: u, ok: false, status: res.status, type, bytes: buf.length, error: `HTTP ${res.status}` };
      if (type && !/^image\//i.test(type)) return { url: u, ok: false, status: res.status, type, bytes: buf.length, error: `返回的不是图片（${type}）` };
      if (!buf.length) return { url: u, ok: false, status: res.status, type, bytes: 0, error: '内容为空' };
      return { url: u, ok: true, status: res.status, type, bytes: buf.length, error: '' };
    } catch (e) {
      const msg = e.name === 'TimeoutError' || e.name === 'AbortError' ? '15 秒内没有响应（超时）' : e.cause?.code || e.message || '抓取失败';
      return { url: u, ok: false, status: 0, type: '', bytes: 0, error: String(msg) };
    }
  }

  /** 批量探测相册里所有远程链接（并发 4），用于上线前检查死链。 */
  async checkRemoteImages(dir) {
    const album = this.readAlbum(dir);
    const urls = (album.remoteImages || []).map((r) => r.url);
    const results = new Array(urls.length);
    let i = 0;
    const worker = async () => {
      while (i < urls.length) {
        const k = i;
        i += 1;
        results[k] = await this.probeRemoteUrl(urls[k]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, urls.length) }, () => worker()));
    return { dir, total: urls.length, bad: results.filter((r) => r && !r.ok).length, results };
  }

  /** 只调整 remote_images 的顺序（它们始终排在本地图之后）。 */
  reorderRemoteImages(dir, order) {
    const fileRel = `content/${dir}/index.md`;
    const st = this.remoteState(fileRel);
    const wanted = (Array.isArray(order) ? order : []).map(String).filter((u) => st.urls.includes(u));
    for (const u of st.urls) if (!wanted.includes(u)) wanted.push(u);
    const fm = setListBlock(st.fm, 'remote_images', wanted);
    if (fm !== st.fm) this.write(fileRel, joinFrontMatter(fm, st.body, st.sep, st.eol));
    return this.readAlbum(dir);
  }

  /** 把远程图下载到 content/<dir>/，并从 remote_images 移除（元数据 key 改成文件名）。 */
  async downloadRemoteImage(dir, url, filename = '') {
    const u = String(url);
    const st = this.remoteState(`content/${dir}/index.md`);
    if (!st.urls.includes(u)) throw new Error(`远程图片不存在: ${url}`);
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('下载到的是空文件');
    const ctype = String(res.headers.get('content-type') || '');
    let name = String(filename || '').trim() || decodeURIComponent(new URL(u).pathname.split('/').pop() || '');
    name = name.replace(/[\\/:*?"<>|]+/g, '_');
    if (!isImg(name)) {
      const ext = /png/i.test(ctype) ? '.png' : /webp/i.test(ctype) ? '.webp' : /avif/i.test(ctype) ? '.avif' : /gif/i.test(ctype) ? '.gif' : '.jpg';
      name = `${path.basename(name, path.extname(name)) || 'remote'}${ext}`;
    }
    const dirAbs = this.abs(`content/${dir}`);
    if (!fs.existsSync(dirAbs)) throw new Error(`相册不存在: ${dir}`);
    let final = name;
    let n = 1;
    while (fs.existsSync(path.join(dirAbs, final))) final = `${path.basename(name, path.extname(name))}-${n++}${path.extname(name)}`;
    fs.writeFileSync(path.join(dirAbs, final), buf);

    // remote_images 去掉该 URL；images: 里的元数据换 key（保留原来填的标题/EXIF）
    const mi = st.metaList.findIndex((m) => m && String(m.src) === u);
    if (mi >= 0) st.metaList[mi] = { ...st.metaList[mi], src: final };
    st.urls = st.urls.filter((x) => x !== u);
    let fm = setListBlock(st.fm, 'remote_images', st.urls);
    fm = setListBlock(fm, 'images', st.metaList);
    this.write(`content/${dir}/index.md`, joinFrontMatter(fm, st.body, st.sep, st.eol));
    return { name: final, size: buf.length, album: this.readAlbum(dir) };
  }

  /* ------------------------------------------------------------------ 游记 */

  storyPath(slug) {
    return `content/stories/${slug}/index.md`;
  }

  readStory(slug) {
    const fileRel = this.storyPath(slug);
    const raw = this.read(fileRel);
    const { fm, body } = splitFrontMatter(raw);
    const obj = parseYaml(fm) || {};
    return {
      slug,
      file: fileRel,
      title: obj.title || '',
      date: obj.date ? String(obj.date) : '',
      description: obj.description || '',
      cover: obj.cover || '',
      coverFrom: obj.cover_from || '',
      body,
      fm,
      raw,
      // 短代码写作 {{< photo src="…" from="…" >}}，正文里本就含 '>'，所以不能用 [^>]*
      photos: [...body.matchAll(/\{\{<\s*photo\b[\s\S]*?\}\}/g)].map((m) => m[0]),
      mtime: fs.statSync(this.abs(fileRel)).mtimeMs,
    };
  }

  listStories() {
    return this.listDirs('content/stories')
      .filter((d) => this.hasIndex(`content/stories/${d}`))
      .map((d) => {
        try {
          const s = this.readStory(d);
          return { slug: d, title: s.title || d, date: s.date, description: s.description, photos: s.photos.length };
        } catch (e) {
          return { slug: d, title: d, date: '', description: '', photos: 0, error: String(e.message || e) };
        }
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  createStory(slug, { title, date, description } = {}) {
    const s = String(slug || '')
      .trim()
      .replace(/[\\/]+/g, '-')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^-+|-+$/g, '');
    if (!s) throw new Error('目录名不能为空');
    const fileRel = this.storyPath(s);
    if (this.exists(fileRel)) throw new Error(`游记已存在: ${s}`);
    const fm = [
      `title: ${JSON.stringify(title || s)}`,
      `date: ${date || new Date().toISOString().slice(0, 10)}`,
      description ? `description: ${JSON.stringify(description)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    this.write(fileRel, `---\n${fm}\n---\n\n`);
    return this.readStory(s);
  }

  writeStory(slug, patch = {}) {
    const fileRel = this.storyPath(slug);
    const { fm, body, sep, eol } = splitFrontMatter(this.read(fileRel));
    let next = fm;
    const map = { title: 'title', date: 'date', description: 'description', cover: 'cover' };
    for (const [k, field] of Object.entries(map)) {
      if (!(k in patch)) continue;
      next = patch[k]
        ? setScalar(next, field, patch[k])
        : setScalar(next, field, undefined, { remove: true });
    }
    if ('coverFrom' in patch) {
      next = patch.coverFrom
        ? setScalar(next, 'cover_from', patch.coverFrom)
        : setScalar(next, 'cover_from', undefined, { remove: true });
    }
    const nextBody = 'body' in patch ? String(patch.body ?? '') : body;
    this.write(fileRel, joinFrontMatter(next, nextBody, sep, eol));
    return this.readStory(slug);
  }

  deleteStory(slug) {
    return this.toTrash(`content/stories/${slug}`);
  }

  /* -------------------------------------------------------------- 独立页面 */

  listPages() {
    const out = [];
    const one = (rel, label) => {
      let title = '';
      try {
        const obj = parseYaml(splitFrontMatter(this.read(rel)).fm) || {};
        title = String(obj.title || '').trim();
      } catch {
        title = '';
      }
      out.push({ path: rel, label, title });
    };
    for (const f of fs.readdirSync(this.contentDir)) {
      if (f.endsWith('.md')) one(`content/${f}`, f);
    }
    if (this.exists('content/stories/_index.md')) one('content/stories/_index.md', 'stories/_index.md');
    return out;
  }

  readPage(relPath) {
    const raw = this.read(relPath);
    const { fm, body } = splitFrontMatter(raw);
    const obj = parseYaml(fm) || {};
    return {
      path: relPath,
      fm,
      body,
      raw,
      title: obj.title || '',
      description: obj.description || '',
      layout: obj.layout || '',
      keys: Object.keys(obj),
      mtime: fs.statSync(this.abs(relPath)).mtimeMs,
    };
  }

  writePage(relPath, patch = {}) {
    if (!/^content\/[^\0]+\.md$/.test(relPath)) throw new Error('只允许编辑 content/ 下的 .md 文件');
    const cur = splitFrontMatter(this.read(relPath));
    let fm = cur.fm;
    if (typeof patch.title === 'string')
      fm = patch.title ? setScalar(fm, 'title', patch.title) : setScalar(fm, 'title', undefined, { remove: true });
    if (typeof patch.description === 'string')
      fm = patch.description
        ? setScalar(fm, 'description', patch.description)
        : setScalar(fm, 'description', undefined, { remove: true });
    const nextBody = 'body' in patch ? String(patch.body ?? '') : cur.body;
    this.write(relPath, joinFrontMatter(fm, nextBody, cur.sep, cur.eol));
    return this.readPage(relPath);
  }

  /* ------------------------------------------------------------------ 概览 */

  state() {
    const cfg = this.config();
    const albums = this.listDirs('content')
      .filter((d) => d !== 'stories' && this.hasIndex(`content/${d}`))
      .map((d) => {
        try {
          return this.albumSummary(d);
        } catch (e) {
          return { dir: d, title: d, error: String(e.message || e), images: [], warnings: [] };
        }
      })
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
    const root = this.readPage('content/_index.md');
    return {
      root: this.root,
      site: { title: root.title, description: root.description, ...cfg },
      home: { path: root.path, fm: root.fm, body: root.body },
      albums,
      stories: this.listStories(),
      pages: this.listPages(),
      totals: {
        albums: albums.length,
        images: albums.reduce((n, a) => n + (a.imageCount || 0), 0),
        bytes: albums.reduce((n, a) => n + (a.bytes || 0), 0),
        stories: this.listStories().length,
      },
    };
  }

  /** 供游记编辑器用的「素材目录」：每个相册的图片名列表 */
  assets() {
    const out = {};
    for (const d of this.listDirs('content')) {
      if (d === 'stories' || !this.hasIndex(`content/${d}`)) continue;
      const dirAbs = this.abs(`content/${d}`);
      out[d] = fs
        .readdirSync(dirAbs, { withFileTypes: true })
        .filter((x) => x.isFile() && isImg(x.name))
        .map((x) => x.name)
        .sort(natural);
    }
    return out;
  }
}
