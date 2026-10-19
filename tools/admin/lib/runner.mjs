/**
 * runner.mjs — 把命令行操作包成「任务」：捕获输出、可停止、可查询。
 * 覆盖：hugo 构建 / hugo server 预览 / EXIF 提取 / 相册加密 / git 提交推送。
 */

import { spawn, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const MAX_LINES = 4000;

function which(cmd, extra = []) {
  for (const p of extra) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  try {
    const res = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
    if (res.status === 0) {
      const first = String(res.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      if (first) return first;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function probe(exe, args = ['--version']) {
  if (!exe) return null;
  try {
    const res = spawnSync(exe, args, { encoding: 'utf8', timeout: 15000 });
    const out = `${res.stdout || ''}${res.stderr || ''}`.trim().split(/\r?\n/)[0] || '';
    return res.status === 0 ? out : null;
  } catch {
    return null;
  }
}

export class Runner {
  constructor(root) {
    this.root = root;
    this.jobs = new Map();
    this.seq = 0;
    this.childs = new Map(); // jobId -> ChildProcess
  }

  detect() {
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const hugo = which('hugo', [
      path.join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'hugo.exe'),
      path.join(this.root, '.hugo-bin', 'hugo.exe'),
      '/usr/local/bin/hugo',
    ]);
    const exiftool = which('exiftool', [path.join(home, 'scoop', 'shims', 'exiftool.exe')]);
    const python = which('python3') || which('python');
    const git = which('git');
    const magick = which('magick') || which('convert');
    const tools = {
      hugo: { path: hugo, version: probe(hugo, ['version']) },
      node: { path: process.execPath, version: process.version },
      python: { path: python, version: probe(python, ['--version']) },
      exiftool: { path: exiftool, version: probe(exiftool, ['-ver']) },
      git: { path: git, version: probe(git, ['--version']) },
      magick: { path: magick, version: probe(magick, ['-version']) },
    };
    this.tools = tools;
    return tools;
  }

  /* -------------------------------------------------------------- 任务对象 */

  create(kind, label) {
    const id = ++this.seq;
    const job = {
      id,
      kind,
      label: label || kind,
      status: 'running',
      lines: [],
      dropped: 0,
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
      url: null,
      ready: false,
      steps: [],
      error: null,
    };
    this.jobs.set(id, job);
    if (this.jobs.size > 40) {
      const oldest = [...this.jobs.values()].filter((j) => j.status !== 'running').sort((a, b) => a.startedAt - b.startedAt)[0];
      if (oldest) this.jobs.delete(oldest.id);
    }
    return job;
  }

  log(job, text, stream = 'out') {
    const prefix = stream === 'err' ? '! ' : '';
    for (const raw of String(text).split(/\r?\n/)) {
      if (raw === '') continue;
      job.lines.push(prefix + raw);
    }
    if (job.lines.length > MAX_LINES) {
      const over = job.lines.length - MAX_LINES;
      job.lines.splice(0, over);
      job.dropped += over;
    }
  }

  step(job, label) {
    job.steps.push({ label, at: Date.now() });
    this.log(job, `\n=== ${label} ===`);
  }

  get(id) {
    return this.jobs.get(Number(id)) || null;
  }

  view(id, since = 0) {
    const job = this.get(id);
    if (!job) return null;
    return {
      id: job.id,
      kind: job.kind,
      label: job.label,
      status: job.status,
      exitCode: job.exitCode,
      url: job.url,
      ready: job.ready === true,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      dropped: job.dropped,
      steps: job.steps,
      total: job.lines.length,
      since,
      lines: job.lines.slice(Number(since) || 0),
    };
  }

  running() {
    return [...this.jobs.values()]
      .filter((j) => j.status === 'running')
      .map((j) => ({ id: j.id, kind: j.kind, label: j.label, url: j.url, ready: j.ready === true }));
  }

  /** 在任务里跑一个子进程，返回退出码；keepAlive=true 表示长驻（如 hugo server）。 */
  spawnInto(job, { cmd, args = [], cwd = this.root, env = {}, label, keepAlive = false, allowFail = false }) {
    if (label) this.step(job, label);
    this.log(job, `$ ${path.basename(cmd)} ${args.join(' ')}`);
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(cmd, args, {
          cwd,
          env: { ...process.env, ...env },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        this.log(job, `启动失败: ${err.message}`, 'err');
        if (!allowFail) {
          job.status = 'failed';
          job.error = err.message;
          job.endedAt = Date.now();
        }
        resolve(-1);
        return;
      }
      this.childs.set(job.id, child);
      child.stdout.on('data', (b) => this.log(job, b.toString('utf8')));
      child.stderr.on('data', (b) => this.log(job, b.toString('utf8'), 'err'));
      child.on('error', (err) => this.log(job, `进程错误: ${err.message}`, 'err'));
      child.on('close', (code) => {
        this.childs.delete(job.id);
        if (!keepAlive || job.status === 'running') {
          const ok = code === 0 || allowFail;
          if (!ok && job.status === 'running') {
            job.status = 'failed';
            job.exitCode = code;
            job.error = `退出码 ${code}`;
          }
        }
        job.exitCode = code;
        resolve(code ?? -1);
      });
    });
  }

  stop(id) {
    const job = this.get(id);
    if (!job) return false;
    const child = this.childs.get(job.id);
    if (child && child.pid) {
      try {
        if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        else process.kill(-child.pid, 'SIGKILL');
      } catch (err) {
        this.log(job, `停止失败: ${err.message}`, 'err');
      }
    }
    if (job.status === 'running') {
      job.status = 'stopped';
      job.endedAt = Date.now();
      this.log(job, '\n=== 已停止 ===');
    }
    return true;
  }

  finish(job, ok = true, error = null) {
    if (job.status !== 'running') return job;
    job.status = ok ? 'ok' : 'failed';
    if (error) job.error = error;
    job.endedAt = Date.now();
    return job;
  }

  /* ------------------------------------------------------------- 快速同步查询 */

  exec(cmd, args, { cwd = this.root, allowFail = true } = {}) {
    try {
      const res = execFileSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true });
      return { code: 0, out: String(res) };
    } catch (err) {
      if (!allowFail) throw err;
      return { code: err.status ?? -1, out: `${err.stdout || ''}${err.stderr || ''}` };
    }
  }

  gitInfo() {
    if (!this.tools?.git?.path) return { available: false };
    const g = this.tools.git.path;
    const branch = this.exec(g, ['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
    const st = this.exec(g, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    const files = String(st.out)
      .split('\0')
      .filter(Boolean)
      .map((rec) => ({ status: rec.slice(0, 2), path: rec.slice(3) }));
    const log = this.exec(g, ['log', '--oneline', '-8']).out.trim().split(/\r?\n/).filter(Boolean);
    const remote = this.exec(g, ['remote', '-v']).out.trim().split(/\r?\n/).filter(Boolean);
    return { available: true, branch, files, log, remote };
  }
}

/** 一键构建 = build.sh 的等价流程：EXIF（可选） → hugo build → 加密受保护相册 */
export async function runBuild(runner, site, opts = {}) {
  const job = runner.create('build', '一键构建（构建 + EXIF + 加密）');
  const tools = runner.tools || runner.detect();
  const baseURL = opts.baseURL || '/';
  try {
    if (!tools.hugo?.path) throw new Error('找不到 hugo 可执行文件');
    let ok = true;
    if (tools.exiftool?.path && tools.python?.path) {
      const code = await runner.spawnInto(job, {
        cmd: tools.python.path,
        args: ['scripts/extract-exif.py'],
        label: `提取 EXIF → data/exif.json（exiftool ${tools.exiftool.version || ''}）`,
        allowFail: true,
      });
      if (code !== 0) runner.log(job, '⚠ EXIF 提取失败，继续构建（data/exif.json 保持旧值）', 'err');
    } else {
      runner.step(job, '跳过 EXIF 提取');
      runner.log(job, '未检测到 exiftool（或 python），data/exif.json 保持现有内容', 'err');
    }
    const code = await runner.spawnInto(job, {
      cmd: tools.hugo.path,
      args: ['--gc', '--minify', '--cleanDestinationDir', '--baseURL', baseURL, '--printPathWarnings'],
      label: `hugo 构建（baseURL=${baseURL}）`,
    });
    if (code !== 0) ok = false;
    if (ok) {
      const ec = await runner.spawnInto(job, {
        cmd: process.execPath,
        args: ['themes/gallery/scripts/encrypt-protected.mjs'],
        label: '加密受保护相册（AES-256-GCM）',
      });
      if (ec !== 0) ok = false;
    }
    if (ok) {
      const pub = path.join(site.root, 'public');
      let size = 0;
      let n = 0;
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else {
            size += fs.statSync(p).size;
            n++;
          }
        }
      };
      if (fs.existsSync(pub)) walk(pub);
      runner.log(job, `\n产物: public/ — ${n} 个文件, ${(size / 1048576).toFixed(1)} MB`);
    }
    runner.finish(job, ok);
  } catch (err) {
    runner.log(job, `构建异常: ${err.message}`, 'err');
    runner.finish(job, false, err.message);
  }
  return job;
}

export function openInExplorer(target) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

/** 用系统默认浏览器打开一个网址（Windows 走 cmd 的 start，最稳） */
export function openUrl(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return true;
    }
    if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}
