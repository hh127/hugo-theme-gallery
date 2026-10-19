#!/usr/bin/env node
/**
 * selftest.mjs —— 管理台自测脚本（会真的读写仓库，但只在一个临时相册里折腾，最后清理干净）。
 *
 *   node tools/admin/server.mjs --port 7799 --no-open     # 先启动服务
 *   node tools/admin/selftest.mjs --port 7799             # 再跑自测
 */

const argv = process.argv.slice(2);
const i = argv.indexOf('--port');
const PORT = i >= 0 ? Number(argv[i + 1]) : 7788;
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = `zz-selftest-${Date.now().toString(36)}`;

let pass = 0;
const fails = [];

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body && !(opts.body instanceof Blob) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function check(label, fn) {
  try {
    const detail = await fn();
    pass++;
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    fails.push(`${label}: ${err.message}`);
    console.log(`  ✗ ${label} — ${err.message}`);
  }
}

/** 1×1 PNG */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

console.log(`\n管理台自测 → ${BASE}（临时相册 ${DIR}）\n`);

await check('服务在线 /api/state', async () => {
  const s = await api('/api/state');
  return `${s.totals.albums} 相册 / ${s.totals.images} 图 / hugo ${s.tools.hugo.version ? '✓' : '✗'}`;
});

await check('新建相册', async () => {
  const r = await api('/api/album', { method: 'POST', body: { dir: DIR, title: '自测相册', description: 'selftest' } });
  if (r.album.title !== '自测相册') throw new Error('标题未写入');
  return r.album.file;
});

await check('上传 3 张图片', async () => {
  for (const n of ['b.png', 'a.png', 'c.png']) {
    await api(`/api/album/upload?dir=${DIR}&name=${n}`, { method: 'POST', body: PNG });
  }
  const { album } = await api(`/api/album?dir=${DIR}`);
  if (album.images.length !== 3) throw new Error(`期望 3 张，实际 ${album.images.length}`);
  return album.images.map((x) => x.name).join(', ');
});

await check('文件名重名自动改名', async () => {
  const r = await api(`/api/album/upload?dir=${DIR}&name=a.png`, { method: 'POST', body: PNG });
  if (r.name === 'a.png') throw new Error('未改名');
  return r.name;
});

await check('修改相册设置（标题/密码/featured）', async () => {
  const { album } = await api('/api/album', {
    method: 'PATCH',
    body: { dir: DIR, patch: { title: '自测相册2', password: 'a-very-long-password', featured: true } },
  });
  if (album.title !== '自测相册2' || album.password !== 'a-very-long-password' || !album.featured) throw new Error('字段未生效');
  return `title=${album.title} featured=${album.featured} 警告 ${album.warnings.length} 条`;
});

await check('修改单图元数据 + 隐藏 + 封面', async () => {
  const { album } = await api('/api/album/image', {
    method: 'PATCH',
    body: { dir: DIR, name: 'a.png', patch: { title: '第一张', hidden: true, cover: true, params: { camera: 'TestCam', iso: '100' } } },
  });
  const img = album.images.find((x) => x.name === 'a.png');
  if (!img) throw new Error('找不到图片');
  if (img.title !== '第一张' || !img.hidden || !img.cover || img.params.camera !== 'TestCam') throw new Error(JSON.stringify(img));
  return `title=${img.title} hidden=${img.hidden} cover=${img.cover} camera=${img.params.camera}`;
});

await check('重命名图片并同步 front matter', async () => {
  const { album } = await api('/api/album/image', {
    method: 'PATCH',
    body: { dir: DIR, name: 'a.png', patch: { newName: 'renamed.png' } },
  });
  const img = album.images.find((x) => x.name === 'renamed.png');
  if (!img) throw new Error('重命名失败');
  if (!img.title && !img.hasMeta) throw new Error('front matter 未跟随改名');
  return `renamed.png title=${img.title}`;
});

await check('拖拽排序 → 重命名 01- 前缀', async () => {
  const { album: before } = await api(`/api/album?dir=${DIR}`);
  const order = before.images.map((x) => x.name).reverse();
  const r = await api('/api/album/reorder', { method: 'POST', body: { dir: DIR, order } });
  const names = r.album.images.map((x) => x.name);
  if (!names.every((n) => /^\d{2}-/.test(n))) throw new Error(`命名不符: ${names.join(', ')}`);
  return names.join(' → ');
});

await check('排序后元数据仍绑定同一张图', async () => {
  const { album } = await api(`/api/album?dir=${DIR}`);
  const img = album.images.find((x) => x.title === '第一张');
  if (!img) throw new Error('元数据丢失');
  if (!img.hidden || !img.cover || img.params.camera !== 'TestCam') throw new Error('开关/参数丢失');
  return `${img.name} 仍是封面且隐藏`;
});

await check('删除单张图片', async () => {
  const { album: before } = await api(`/api/album?dir=${DIR}`);
  const victim = before.images[0].name;
  const r = await api('/api/album/image', { method: 'DELETE', body: { dir: DIR, name: victim } });
  if (r.album.images.length !== before.images.length - 1) throw new Error('数量不对');
  return `已移入回收站 ${r.trashed}`;
});

await check('删除相册（回收站）', async () => {
  const r = await api('/api/album', { method: 'DELETE', body: { dir: DIR } });
  const after = await api('/api/state');
  if (after.albums.some((a) => a.dir === DIR)) throw new Error('相册仍存在');
  return r.trashed;
});

await check('游记读写（内容不变式）', async () => {
  const { story } = await api('/api/story?slug=city-walk');
  const saved = await api('/api/story', { method: 'PUT', body: { slug: story.slug, patch: { body: story.body } } });
  if (saved.story.body !== story.body) throw new Error('正文被改写');
  return `正文 ${story.body.length} 字符，往返一致`;
});

await check('页面读写（内容不变式）', async () => {
  const { page } = await api('/api/page?path=content/about.md');
  const saved = await api('/api/page', { method: 'PUT', body: { path: page.path, patch: { body: page.body, title: page.title } } });
  if (saved.page.body !== page.body) throw new Error('正文被改写');
  return `${page.path} 往返一致`;
});

await check('路径越界被拒（/api/raw 读 hugo.toml）', async () => {
  try {
    await api('/api/raw?path=hugo.toml');
  } catch (err) {
    return `已拒绝：${err.message}`;
  }
  throw new Error('竟然读到了仓库外的文件');
});

console.log(`\n结果：${pass} 项通过，${fails.length} 项失败`);
if (fails.length) {
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('全部通过 ✓\n');
