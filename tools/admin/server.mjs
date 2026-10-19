#!/usr/bin/env node
/**
 * 相册管理台 —— 本地 Web 服务（零第三方依赖）
 *
 *   node tools/admin/server.mjs [--port 7788] [--no-open] [--root <站点根目录>]
 *
 * 只监听 127.0.0.1，不对外暴露。
 * 站点根目录默认自动向上查找（含 hugo.toml/config.* 且有 content/ 的那一层），
 * 所以管理台放在站点仓库的 tools/admin/ 或主题的 themes/<主题>/tools/admin/ 都能用。
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Site, IMG_EXT } from './lib/site.mjs';
import { Runner, runBuild, openInExplorer, openUrl } from './lib/runner.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, 'public');
const PID_FILE = path.join(__dirname, '.admin.pid');

/** 判断某个目录是不是一个 Hugo 站点根目录 */
function looksLikeSite(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  const hasConfig = ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml', 'config.yaml', 'config.json']
    .some((f) => fs.existsSync(path.join(dir, f)));
  return hasConfig && fs.existsSync(path.join(dir, 'content'));
}


/** 记下自己的 PID，stop.ps1 / stop.bat 靠它精确关掉服务 */
function writePidFile() {
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch { /* 只读目录等情况下忽略，stop 脚本还有兜底扫描 */ }
}
function clearPidFile() {
  try {
    if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(PID_FILE);
  } catch { /* 忽略 */ }
}

const argv = process.argv.slice(2);
const argOf = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const PORT = Number(argOf('--port', process.env.ADMIN_PORT || 7788));
const NO_OPEN = argv.includes('--no-open');

/** 站点根目录：--root 优先，否则从本文件向上找最近的一个 Hugo 站点 */
function resolveRoot() {
  const explicit = argOf('--root', process.env.ADMIN_ROOT || '');
  if (explicit) return path.resolve(explicit);
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    dir = path.dirname(dir);
    if (looksLikeSite(dir)) return dir;
  }
  if (looksLikeSite(process.cwd())) return process.cwd();
  return path.resolve(__dirname, '..', '..');
}

const ROOT = resolveRoot();
const site = new Site(ROOT);
const runner = new Runner(ROOT);
runner.detect();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function fail(res, err) {
  const msg = typeof err === 'string' ? err : err?.message || String(err);
  sendJSON(res, 400, { ok: false, error: msg });
}

async function readBody(req, limit = 16 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('请求体过大');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJSON(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    throw new Error(`JSON 解析失败: ${e.message}`);
  }
}

function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const abs = path.join(PUB, rel);
  if (!abs.startsWith(PUB) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(abs).pipe(res);
}

function serveMedia(req, res, url) {
  const rel = url.searchParams.get('path') || '';
  const abs = site.abs(rel);
  if (!abs.startsWith(site.contentDir) || !fs.existsSync(abs) || !fs.statSync(abs).isFile() || !IMG_EXT.has(path.extname(abs).toLowerCase())) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  const st = fs.statSync(abs);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'private, max-age=60',
  });
  fs.createReadStream(abs).pipe(res);
}

/** 轮询探测 TCP 端口，最多等 timeoutMs；返回是否已就绪。 */
function waitPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const sock = net.connect({ host: '127.0.0.1', port });
      sock.setTimeout(1000);
      sock.once('connect', () => {
        sock.destroy();
        resolve(true);
      });
      const retry = () => {
        sock.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(tryOnce, 300);
      };
      sock.once('error', retry);
      sock.once('timeout', retry);
    };
    tryOnce();
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  const q = url.searchParams;
  try {
    if (p === '/api/state' && req.method === 'GET') return sendJSON(res, 200, { ok: true, ...site.state(), tools: runner.tools, git: runner.gitInfo(), jobs: runner.running() });
    if (p === '/api/tools' && req.method === 'GET') return sendJSON(res, 200, { ok: true, tools: runner.detect() });
    if (p === '/api/assets' && req.method === 'GET') return sendJSON(res, 200, { ok: true, assets: site.assets() });

    if (p === '/api/album' && req.method === 'GET') return sendJSON(res, 200, { ok: true, album: site.readAlbum(q.get('dir')) });
    if (p === '/api/album' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.createAlbum(b.dir, b) });
    }
    if (p === '/api/album' && (req.method === 'PATCH' || req.method === 'PUT')) {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.patchAlbum(b.dir, b.patch || {}) });
    }
    if (p === '/api/album' && req.method === 'DELETE') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, trashed: site.deleteAlbum(b.dir) });
    }
    if (p === '/api/album/upload' && req.method === 'POST') {
      const dir = q.get('dir');
      const name = q.get('name') || req.headers['x-filename'] || 'image.jpg';
      const buf = await readBody(req, 300 * 1024 * 1024);
      if (!buf.length) throw new Error('空文件');
      return sendJSON(res, 200, { ok: true, ...site.uploadImage(dir, decodeURIComponent(String(name)), buf) });
    }
    if (p === '/api/album/image' && (req.method === 'PATCH' || req.method === 'PUT')) {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.patchImage(b.dir, b.name, b.patch || {}) });
    }
    if (p === '/api/album/image' && req.method === 'DELETE') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, ...site.deleteImage(b.dir, b.name) });
    }
    if (p === '/api/album/reorder' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, ...site.reorderAlbum(b.dir, b.order) });
    }

    /* ---- 远程（云端）图片 ---- */
    if (p === '/api/album/remote' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.addRemoteImage(b.dir, b) });
    }
    if (p === '/api/album/remote' && (req.method === 'PATCH' || req.method === 'PUT')) {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.patchRemoteImage(b.dir, b.url, b.patch || {}) });
    }
    if (p === '/api/album/remote' && req.method === 'DELETE') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.deleteRemoteImage(b.dir, b.url) });
    }
    if (p === '/api/album/remote/reorder' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, album: site.reorderRemoteImages(b.dir, b.order) });
    }
    if (p === '/api/album/remote/fetch' && req.method === 'POST') {
      const b = await readJSON(req);
      const r = await site.downloadRemoteImage(b.dir, b.url, b.filename);
      return sendJSON(res, 200, { ok: true, name: r.name, size: r.size, album: r.album });
    }
    if (p === '/api/album/remote/check' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, ...(await site.checkRemoteImages(b.dir)) });
    }
    if (p === '/api/album/remote/probe' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, result: await site.probeRemoteUrl(b.url) });
    }

    if (p === '/api/story' && req.method === 'GET') return sendJSON(res, 200, { ok: true, story: site.readStory(q.get('slug')) });
    if (p === '/api/story' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, story: site.createStory(b.slug, b) });
    }
    if (p === '/api/story' && (req.method === 'PUT' || req.method === 'PATCH')) {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, story: site.writeStory(b.slug, b.patch || {}) });
    }
    if (p === '/api/story' && req.method === 'DELETE') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, trashed: site.deleteStory(b.slug) });
    }

    if (p === '/api/page' && req.method === 'GET') return sendJSON(res, 200, { ok: true, page: site.readPage(q.get('path')) });
    if (p === '/api/page' && (req.method === 'PUT' || req.method === 'PATCH')) {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: true, page: site.writePage(b.path, b.patch || {}) });
    }
    if (p === '/api/raw' && req.method === 'GET') {
      const rel = q.get('path') || '';
      const abs = site.abs(rel);
      if (!abs.startsWith(site.contentDir)) throw new Error('只允许读取 content/ 下的文件');
      return sendJSON(res, 200, { ok: true, path: rel, text: site.read(rel) });
    }
    if (p === '/api/raw' && req.method === 'PUT') {
      const b = await readJSON(req);
      const abs = site.abs(b.path);
      if (!abs.startsWith(site.contentDir)) throw new Error('只允许写入 content/ 下的文件');
      site.write(b.path, String(b.text ?? ''));
      return sendJSON(res, 200, { ok: true, path: b.path });
    }

    if (p === '/api/build' && req.method === 'POST') {
      const b = await readJSON(req).catch(() => ({}));
      const job = await runBuild(runner, site, { baseURL: b.baseURL || '/' });
      return sendJSON(res, 200, { ok: job.status === 'ok', job: runner.view(job.id) });
    }
    if (p === '/api/preview' && req.method === 'POST') {
      const b = await readJSON(req).catch(() => ({}));
      const port = Number(b.port || 1313);
      const running = [...runner.jobs.values()].find((j) => j.kind === 'preview' && j.status === 'running');
      if (running) return sendJSON(res, 200, { ok: true, job: runner.view(running.id, 0), url: running.url, ready: running.ready === true });
      const tools = runner.tools || runner.detect();
      if (!tools.hugo?.path) throw new Error('找不到 hugo 可执行文件');
      const job = runner.create('preview', `本地预览 :${port}`);
      // 统一用 127.0.0.1：Windows 上 localhost 可能先解析到 ::1，而 hugo server 只监听 IPv4，
      // 浏览器/iframe 会直接报「拒绝连接」。
      const host = '127.0.0.1';
      job.url = `http://${host}:${port}/`;
      runner.spawnInto(job, {
        cmd: tools.hugo.path,
        args: ['server', '--port', String(port), '--baseURL', job.url, '--bind', host, '--disableFastRender', '--noHTTPCache', '--navigateToChanged'],
        label: `hugo server :${port}`,
        keepAlive: true,
        allowFail: true,
      });
      // hugo 从启动到真正监听端口有 1~3 秒延迟，之前点「预览」会立刻把 URL 塞进 iframe，
      // 于是页面显示「localhost 拒绝连接」。这里探测端口，就绪后再置 ready。
      waitPort(port).then((okReady) => {
        if (okReady) {
          job.ready = true;
          runner.log(job, `预览就绪：${job.url}`);
        } else {
          runner.log(job, '预览端口在 20 秒内没有就绪，请查看上面的输出（端口被占用？hugo 报错？）', 'err');
        }
      });
      return sendJSON(res, 200, { ok: true, job: runner.view(job.id, 0), url: job.url, ready: false });
    }
    if (p === '/api/encrypt' && req.method === 'POST') {
      const job = runner.create('encrypt', '加密受保护相册');
      runner
        .spawnInto(job, { cmd: process.execPath, args: ['themes/gallery/scripts/encrypt-protected.mjs'], label: 'encrypt-protected.mjs' })
        .then((code) => runner.finish(job, code === 0));
      return sendJSON(res, 200, { ok: true, jobId: job.id });
    }
    if (p === '/api/exif' && req.method === 'POST') {
      const tools = runner.tools || runner.detect();
      const job = runner.create('exif', '提取 EXIF → data/exif.json');
      if (!tools.exiftool?.path || !tools.python?.path) {
        runner.log(job, `缺少依赖：exiftool=${tools.exiftool?.path || '未安装'} python=${tools.python?.path || '未安装'}`, 'err');
        runner.finish(job, false, '缺少 exiftool 或 python');
      } else {
        runner
          .spawnInto(job, { cmd: tools.python.path, args: ['scripts/extract-exif.py'], label: 'extract-exif.py' })
          .then((code) => runner.finish(job, code === 0));
      }
      return sendJSON(res, 200, { ok: true, jobId: job.id });
    }
    if (p === '/api/job' && req.method === 'GET') return sendJSON(res, 200, { ok: true, job: runner.view(q.get('id'), q.get('since') || 0) });
    if (p === '/api/job/stop' && req.method === 'POST') {
      const b = await readJSON(req);
      return sendJSON(res, 200, { ok: runner.stop(b.id) });
    }
    if (p === '/api/open' && req.method === 'POST') {
      const b = await readJSON(req);
      const map = { public: 'public', root: '.', album: `content/${b.dir || ''}`, data: 'data', content: 'content' };
      const rel = map[b.target] ?? b.target;
      const abs = rel === '.' ? ROOT : site.abs(rel);
      if (!fs.existsSync(abs)) throw new Error(`目录不存在: ${rel}`);
      return sendJSON(res, 200, { ok: openInExplorer(abs), opened: abs });
    }
    if (p === '/api/git' && req.method === 'GET') return sendJSON(res, 200, { ok: true, git: runner.gitInfo() });
    if (p === '/api/git/commit' && req.method === 'POST') {
      const b = await readJSON(req);
      const g = runner.tools?.git?.path;
      if (!g) throw new Error('找不到 git');
      const msg = String(b.message || '').trim();
      if (!msg) throw new Error('请填写提交说明');
      const job = runner.create('git', b.push ? '提交并推送' : '提交');
      (async () => {
        try {
          const files = Array.isArray(b.files) && b.files.length ? b.files : null;
          if (files) {
            runner.step(job, `暂存 ${files.length} 个文件`);
            for (const f of files) await runner.spawnInto(job, { cmd: g, args: ['add', '--', f], allowFail: true });
          } else {
            const c = await runner.spawnInto(job, { cmd: g, args: ['add', '-A'], label: 'git add -A' });
            if (c !== 0) throw new Error('git add 失败');
          }
          const c2 = await runner.spawnInto(job, { cmd: g, args: ['commit', '-m', msg], label: 'git commit' });
          if (c2 !== 0) throw new Error('git commit 失败（可能没有暂存内容）');
          if (b.push) {
            const c3 = await runner.spawnInto(job, { cmd: g, args: ['push'], label: 'git push（推送后将触发 GitHub Actions 部署）' });
            if (c3 !== 0) throw new Error('git push 失败（检查凭据/网络）');
          }
          runner.log(job, '\n完成 ✓');
          runner.finish(job, true);
        } catch (err) {
          runner.log(job, `\n${err.message}`, 'err');
          runner.finish(job, false, err.message);
        }
      })();
      return sendJSON(res, 200, { ok: true, jobId: job.id });
    }

    if (p === '/api/media') return serveMedia(req, res, url);
    if (req.method === 'GET') return serveStatic(res, p);
    return sendJSON(res, 404, { ok: false, error: 'no route' });
  } catch (err) {
    return fail(res, err);
  }
});

server.on('error', (err) => {
  const url = `http://127.0.0.1:${PORT}/`;
  if (err && err.code === 'EADDRINUSE') {
    console.log('');
    console.log(`  端口 ${PORT} 已被占用 —— 管理台应该已经在运行了：`);
    console.log(`  → ${url}`);
    console.log('  直接打开页面；要重启请先运行 stop.bat 关闭。');
    console.log('');
    if (!NO_OPEN) openUrl(url);
    setTimeout(() => process.exit(0), 600);
    return;
  }
  console.error('  启动失败：', err && err.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}/`;
  const t = runner.tools;
  writePidFile();
  console.log('');
  console.log('  相册管理台已启动');
  console.log(`  → ${url}`);
  console.log(`  仓库: ${ROOT}`);
  console.log(
    `  工具: hugo=${t.hugo.version ? '✓ ' + t.hugo.version.split(' ')[1] : '✗'}  node=${t.node.version}  git=${t.git.version ? '✓' : '✗'}  python=${t.python.version ? '✓' : '✗'}  exiftool=${t.exiftool.version ? '✓' : '✗（EXIF 提取会跳过）'}`
  );
  console.log('  按 Ctrl+C 退出，或双击 stop.bat 关闭');
  console.log('');
  if (!NO_OPEN) openUrl(url);
});

process.on('exit', clearPidFile);

process.on('SIGINT', () => {
  for (const j of runner.running()) runner.stop(j.id);
  process.exit(0);
});
