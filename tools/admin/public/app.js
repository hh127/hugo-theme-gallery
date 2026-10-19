/**
 * app.js —— 相册管理台前端（原生 ESM，无依赖）
 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bytes = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

const when = (ms) => (ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '');

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: opts.body && !(opts.body instanceof Blob) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
    body: opts.body && !(opts.body instanceof Blob) ? JSON.stringify(opts.body) : opts.body,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: `HTTP ${res.status}` };
  }
  if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 8000 : 3500);
}

const S = {
  state: null,
  tab: 'overview',
  album: null,
  albumDir: null,
  story: null,
  storySlug: null,
  page: null,
  pagePath: null,
  dirtyOrder: null,
  dirtyRemote: null,
  log: null, // {id, since, lines, status}
  previewUrl: null,
  previewReady: false,
  pvTimer: null,
  timers: [],
  gitSel: null,
  assets: null, // {相册目录: [文件名]}，供实时预览解析 photo 短代码
  pendingId: null, // 来自地址栏的待选中项（#albums/<dir>、#stories/<slug>、#pages/<path>）
};

/* ============================================================== 启动 */

const TABS = ['overview', 'albums', 'stories', 'pages', 'build', 'publish'];

/** 解析 #tab 或 #tab/<id>；id 分别是相册目录、游记 slug、页面路径 */
function parseHash() {
  let raw = (location.hash || '').replace(/^#\/?/, '');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    /* 非法转义就按原样处理 */
  }
  const [tab, ...rest] = raw.split('/');
  return { tab: TABS.includes(tab) ? tab : 'overview', id: rest.join('/') || null };
}

function setTab(tab) {
  S.tab = tab;
  $$('#tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
}

/** 把当前标签页与选中项写进地址栏，便于分享/刷新后保持 */
function setHash(tab, id) {
  const h = id ? `#${tab}/${encodeURIComponent(id)}` : `#${tab}`;
  if (location.hash === h) return;
  history.replaceState(null, '', h);
}

/** 进入标签页时自动选中一项：优先地址栏里的 id，否则第一项（避免右侧一片空白） */
function autoSelect(items, keyOf, load) {
  const pending = S.pendingId;
  S.pendingId = null;
  if (!items.length) return false;
  const hit = pending && items.find((it) => keyOf(it) === pending);
  load(hit ? pending : keyOf(items[0]));
  return true;
}

async function boot() {
  const h = parseHash();
  setTab(h.tab);
  S.pendingId = h.id;
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    setTab(b.dataset.tab);
    S.pendingId = null;
    setHash(S.tab);
    render();
  });
  window.addEventListener('hashchange', () => {
    const p = parseHash();
    setTab(p.tab);
    S.pendingId = p.id;
    if (S.state) render();
  });
  $('#btnReload').addEventListener('click', () => refresh(true));
  wireTheme();
  await refresh();
}

/* 亮色 / 暗色主题切换（存 localStorage，首帧由 index.html 的内联脚本应用） */
function wireTheme() {
  const btn = $('#btnTheme');
  if (!btn) return;
  const apply = (theme) => {
    document.documentElement.dataset.theme = theme;
    btn.textContent = theme === 'dark' ? '🌙 暗色' : '☀ 亮色';
    btn.title = theme === 'dark' ? '当前：暗色（点击切到亮色）' : '当前：亮色（点击切到暗色）';
    try {
      localStorage.setItem('admin-theme', theme);
    } catch (e) { /* 忽略隐私模式下的写入失败 */ }
  };
  apply(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  btn.addEventListener('click', () => apply(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
}

async function refresh(rerender = true) {
  try {
    S.state = await api('/api/state');
    S.assets = null; // 相册内容可能已变化，预览用的图片索引要重新取
    $('#brandTitle').textContent = S.state.site.title || '相册管理台';
    $('#brandSub').textContent = S.state.root;
    const t = S.state.tools;
    const hugoVer = (String(t.hugo.version || '').split(/\s+/)[1] || '').replace(/-[0-9a-f]{6,}/i, '');
    $('#env').textContent = `hugo ${t.hugo.path ? hugoVer || '✓' : '✗'} · exiftool ${t.exiftool.path ? '✓' : '✗'}`;
    $('#env').title = [t.hugo.path ? t.hugo.version : 'hugo 未检测到', `exiftool ${t.exiftool.path ? t.exiftool.version || '已安装' : '未安装'}`]
      .filter(Boolean)
      .join('\n');
    if (rerender) render();
  } catch (err) {
    $('#brandSub').textContent = '连接失败：' + err.message;
    toast('无法读取站点状态：' + err.message, 'err');
  }
}

function render() {
  S.timers.forEach(clearInterval);
  S.timers = [];
  const view = $('#view');
  if (!S.state) {
    view.innerHTML = '<div class="card">加载中…</div>';
    return;
  }
  if (S.tab === 'overview') renderOverview(view);
  else if (S.tab === 'albums') renderAlbums(view);
  else if (S.tab === 'stories') renderStories(view);
  else if (S.tab === 'pages') renderPages(view);
  else if (S.tab === 'build') renderBuild(view);
  else if (S.tab === 'publish') renderPublish(view);
}

/* ============================================================== 概览 */

function renderOverview(view) {
  const st = S.state;
  const warn = [];
  for (const a of st.albums) for (const w of a.warnings || []) warn.push(`${a.title}（${a.dir}）：${w}`);
  const t = st.tools;
  // 版本号太长会把「构建环境」表格撑成两行，这里只显示关键部分，完整值放进 title
  const shortVer = (label, info) => {
    if (!info.path) return '';
    const s = String(info.version || '').trim();
    const n = label.toLowerCase();
    if (n === 'hugo') return (s.split(/\s+/)[1] || s).replace(/-[0-9a-f]{6,}/i, '');
    if (n === 'git') return (s.match(/\d+\.\d+[\w.]*/) || [s])[0].replace(/\.windows\.\d+$/, '');
    return s.split(/\s+/).slice(0, 2).join(' ');
  };
  const toolRow = (label, info, note = '') =>
    `<tr><td>${esc(label)}</td><td>${info.path ? '<span class="badge ok">已安装</span>' : '<span class="badge bad">未安装</span>'}</td><td class="muted small" title="${esc(info.version || '')}">${esc(
      shortVer(label, info) || note || ''
    )}</td></tr>`;

  view.innerHTML = `
  <div class="grid cols-4">
    <div class="card stat"><div class="num">${st.totals.albums}</div><div class="lbl">相册</div></div>
    <div class="card stat"><div class="num">${st.totals.images}</div><div class="lbl">图片</div></div>
    <div class="card stat"><div class="num">${bytes(st.totals.bytes)}</div><div class="lbl">原图占用</div></div>
    <div class="card stat"><div class="num">${st.totals.stories}</div><div class="lbl">游记</div></div>
  </div>
  <div class="grid cols-2">
    <div class="card">
      <h2>相册一览</h2>
      <table>
        <tr><th>相册</th><th>图片</th><th>标记</th><th>体积</th></tr>
        ${st.albums
          .map(
            (a) => `<tr>
          <td><a href="#" data-goto-album="${esc(a.dir)}">${esc(a.title)}</a><div class="muted small">${esc(a.dir)}</div></td>
          <td>${a.imageCount ?? 0}${a.hiddenCount ? ` <span class="muted small">(隐藏 ${a.hiddenCount})</span>` : ''}</td>
          <td>${a.featured ? '<span class="badge">推荐</span>' : ''}${a.private ? '<span class="badge">private</span>' : ''}${
            a.password ? '<span class="badge warn">密码</span>' : ''
          }${a.password ? `<span class="badge warn">口令 ${esc(a.password)}</span>` : ''}</td>
          <td>${bytes(a.bytes)}</td>
        </tr>`
          )
          .join('')}
      </table>
      ${warn.length ? `<h3>需要注意</h3><ul class="small">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="card">
      <h2>构建环境</h2>
      <table>
        ${toolRow('Hugo', t.hugo, '必需')}
        ${toolRow('Node.js', t.node)}
        ${toolRow('Git', t.git)}
        ${toolRow('Python', t.python, 'EXIF 脚本需要')}
        ${toolRow('ExifTool', t.exiftool, 'EXIF 脚本需要，未安装时会跳过')}
      </table>
      <h3>Git</h3>
      ${
        st.git.available
          ? `<div class="small">分支 <code>${esc(st.git.branch)}</code>，${
              st.git.files.length ? `<span class="badge warn">${st.git.files.length} 个文件待提交</span>` : '<span class="badge ok">工作区干净</span>'
            }</div>
             <div class="muted small scrollbox" style="margin-top:6px">${st.git.log.map(esc).join('<br>')}</div>`
          : '<div class="muted">未检测到 git</div>'
      }
      <h3>站点配置</h3>
      <div class="small muted">
        baseURL <code>${esc(st.site.baseURL)}</code> · 语言 <code>${esc(st.site.language)}</code><br>
        默认主题 <code>${esc(st.site.defaultTheme)}</code> · 隐秘相册路径 <code>${esc(st.site.vaultPath || '未设置')}</code><br>
        行间距 ${esc(st.site.boxSpacing)} · 目标行高 ${esc(st.site.targetRowHeight)}
      </div>
    </div>
  </div>`;

  $$('[data-goto-album]', view).forEach((a) =>
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      S.tab = 'albums';
      $$('#tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === 'albums'));
      if (location.hash !== '#albums') history.replaceState(null, '', '#albums');
      await selectAlbum(a.dataset.gotoAlbum);
    })
  );
}

/* ============================================================== 相册 */

async function selectAlbum(dir) {
  S.albumDir = dir;
  S.dirtyOrder = null;
  S.dirtyRemote = null;
  setHash('albums', dir);
  try {
    const { album } = await api(`/api/album?dir=${encodeURIComponent(dir)}`);
    S.album = album;
  } catch (err) {
    toast('读取相册失败：' + err.message, 'err');
    S.album = null;
  }
  render();
}

function renderAlbums(view) {
  const st = S.state;
  if (!S.album && !S.albumDir) {
    autoSelect(st.albums, (a) => a.dir, (d) => selectAlbum(d).catch(() => {}));
  } else if (S.pendingId) {
    const want = st.albums.find((a) => a.dir === S.pendingId);
    S.pendingId = null;
    if (want && want.dir !== S.albumDir) selectAlbum(want.dir).catch(() => {});
  }
  const aside = `
    <div class="card">
      <div class="toolbar"><button class="primary" id="btnNewAlbum">＋ 新建相册</button></div>
      <div class="list">
        ${st.albums
          .map(
            (a) => `<div class="list-item ${a.dir === S.albumDir ? 'active' : ''}" data-dir="${esc(a.dir)}">
          <div class="name">${esc(a.title)}<div class="sub">${esc(a.dir)} · ${a.imageCount ?? 0} 张</div></div>
          ${a.password ? '<span class="badge warn">密</span>' : ''}
          ${a.featured ? '<span class="badge">荐</span>' : ''}
        </div>`
          )
          .join('')}
      </div>
    </div>`;

  const a = S.album;
  const main = !a
    ? '<div class="card">从左侧选择一个相册，或新建一个。</div>'
    : `
    <div class="card">
      <div class="toolbar">
        <strong>${esc(a.title)}</strong><span class="muted small">content/${esc(a.dir)}/index.md · 最后修改 ${when(a.mtime)}</span>
        <span class="spacer"></span>
        <button class="ghost" data-open="album">打开文件夹</button>
      </div>
      ${a.warnings.length ? `<div class="small" style="color:#f3d08a">${a.warnings.map((w) => '⚠ ' + esc(w)).join('<br>')}</div>` : ''}
      <div class="row">
        <label class="field"><span>相册标题</span><input id="alTitle" type="text" value="${esc(a.title)}"></label>
        <label class="field"><span>目录（不可改）</span><input type="text" value="${esc(a.dir)}" disabled></label>
      </div>
      <label class="field"><span>描述</span><textarea id="alDesc" style="min-height:60px">${esc(a.description)}</textarea></label>
      <div class="row">
        <label class="field"><span>密码保护（留空则公开）</span><input id="alPwd" type="text" value="${esc(a.password)}" placeholder="为空表示不需要密码"></label>
        <label class="field"><span>封面图</span>
          <select id="alCover">
            <option value="">（自动：第一张）</option>
            ${a.images.map((i) => `<option value="${esc(i.name)}" ${i.name === a.featuredImage ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="row">
        <label class="check"><input id="alFeatured" type="checkbox" ${a.featured ? 'checked' : ''}> 首页推荐（featured）</label>
        <label class="check"><input id="alPrivate" type="checkbox" ${a.private ? 'checked' : ''}> 完全隐藏（private：不生成页面）</label>
      </div>
      <div class="toolbar" style="margin-top:12px">
        <button class="primary" id="btnSaveAlbum">保存设置</button>
        <button class="danger" id="btnDelAlbum">删除相册（移到回收站）</button>
      </div>
      <div class="muted small">提示：设置「密码保护」后需要执行一次「构建」才会生效（构建流程会加密相册内容）。</div>
    </div>

    <div class="card">
      <div class="toolbar">
        <strong>图片（${a.images.length}${a.remoteImages.length ? ` 本地 + ${a.remoteImages.length} 云端` : ''}）</strong>
        <span class="muted small">显示顺序由文件名决定 · 拖拽排序后需点「应用排序」（会重命名文件）</span>
        <span class="spacer"></span>
        ${S.dirtyOrder ? '<button class="primary" id="btnApplyOrder">应用排序</button>' : ''}
        <button class="ghost" id="btnRefreshAlbum">重新读取</button>
      </div>
      <div class="dropzone" id="dropzone">把图片拖到这里上传，或 <button class="ghost" id="btnPick">选择文件</button>
        <input type="file" id="filePick" accept="image/*" multiple hidden>
        <div class="muted small" id="upStatus"></div>
      </div>
      <div class="photos" id="photos">
        ${(S.dirtyOrder || a.images.map((i) => i.name)).map((name, idx) => {
          const img = a.images.find((x) => x.name === name);
          if (!img) return '';
          const cam = [img.params.camera, img.params.lens].filter(Boolean).join(' · ');
          return `<div class="photo ${img.hidden ? 'hidden-img' : ''}" draggable="true" data-name="${esc(img.name)}">
            <span class="idx">${idx + 1}</span>
            <div class="flag">${img.cover ? '<span class="badge ok">封面</span>' : ''}${img.hidden ? '<span class="badge">已隐藏</span>' : ''}</div>
            <img src="/api/media?path=${encodeURIComponent(`content/${a.dir}/${img.name}`)}" loading="lazy" alt="${esc(img.name)}">
            <div class="meta">
              <div class="fname" title="${esc(img.name)}">${esc(img.title || img.name)}</div>
              <div class="cam">${esc(cam || bytes(img.size))}</div>
            </div>
          </div>`;
        }).join('')}
      </div>
      ${
        a.orphanMeta.length
          ? `<h3>孤立元数据（images: 里存在但文件已不在）</h3><ul class="small">${a.orphanMeta
              .map((m) => `<li>${esc(m.src)} ${m.title ? '· ' + esc(m.title) : ''}</li>`)
              .join('')}</ul>`
          : ''
      }
    </div>

    <div class="card">
      <div class="toolbar">
        <strong>云端图片（${a.remoteImages.length}）</strong>
        <span class="muted small">remote_images：发布后由访客浏览器直接向 CDN 取图，仓库里不存文件</span>
        <span class="spacer"></span>
        ${a.remoteImages.length ? '<button id="btnCheckRemote">验证链接</button>' : ''}
        ${S.dirtyRemote ? '<button class="primary" id="btnApplyRemoteOrder">应用排序</button>' : ''}
      </div>
      <div class="toolbar">
        <input id="remoteUrl" type="text" placeholder="https://cdn.example.com/photo.jpg" style="flex:1;min-width:280px">
        <button class="primary" id="btnAddRemote">＋ 添加云端图片</button>
      </div>
      ${a.remoteImages.length
        ? `<div class="photos" id="remotePhotos">
            ${(S.dirtyRemote || a.remoteImages.map((i) => i.url)).map((url, idx) => {
              const img = a.remoteImages.find((x) => x.url === url);
              if (!img) return '';
              const cam = [img.params.camera, img.params.lens].filter(Boolean).join(' · ');
              let host = '';
              try { host = new URL(img.url).host; } catch { host = ''; }
              return `<div class="photo remote" draggable="true" data-url="${esc(img.url)}">
                <span class="idx">云${idx + 1}</span>
                <div class="flag"><span class="badge">云端</span></div>
                <img src="${esc(img.thumbUrl)}" loading="lazy" alt="${esc(img.title || img.url)}" referrerpolicy="no-referrer">
                <div class="meta">
                  <div class="fname" title="${esc(img.url)}">${esc(img.title || decodeURIComponent(img.url.split('/').pop() || img.url))}</div>
                  <div class="cam">${esc(cam || host)}</div>
                </div>
              </div>`;
            }).join('')}
          </div>`
        : '<div class="muted small">还没有云端图片。把 CDN 直链贴到上面即可加入相册。</div>'}
      <div class="muted small">
        缩略图会在原链接后附带 <code>${esc(a.cdnResize || '(未配置)')}</code>（hugo.toml 的 params.gallery.cdnResize）。
        注意：云端图不支持「隐藏 / 设为封面」——主题只对本地文件生效，卡片封面固定取第一张；一个相册建议只用一种来源。
      </div>
    </div>`;

  view.innerHTML = `<div class="split">${aside}<div class="grid">${main}</div></div>`;

  $$('.list-item', view).forEach((el) => el.addEventListener('click', () => selectAlbum(el.dataset.dir)));
  $('#btnNewAlbum', view)?.addEventListener('click', newAlbumDialog);
  $$('[data-open]', view).forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api('/api/open', { method: 'POST', body: { target: 'album', dir: S.albumDir } });
      } catch (err) {
        toast(err.message, 'err');
      }
    })
  );
  if (!a) return;

  $('#btnSaveAlbum', view).addEventListener('click', async () => {
    try {
      const { album } = await api('/api/album', {
        method: 'PATCH',
        body: {
          dir: a.dir,
          patch: {
            title: $('#alTitle').value.trim(),
            description: $('#alDesc').value,
            password: $('#alPwd').value,
            featured_image: $('#alCover').value,
            featured: $('#alFeatured').checked,
            private: $('#alPrivate').checked,
          },
        },
      });
      S.album = album;
      toast('相册设置已保存', 'ok');
      await refresh(false);
      render();
    } catch (err) {
      toast('保存失败：' + err.message, 'err');
    }
  });
  $('#btnDelAlbum', view).addEventListener('click', async () => {
    if (!confirm(`确定把相册「${a.title}」移到回收站 .admin-trash/ 吗？（可从那里恢复）`)) return;
    try {
      await api('/api/album', { method: 'DELETE', body: { dir: a.dir } });
      toast('已移到回收站', 'ok');
      S.album = null;
      S.albumDir = null;
      await refresh(false);
      render();
    } catch (err) {
      toast('删除失败：' + err.message, 'err');
    }
  });
  $('#btnRefreshAlbum', view).addEventListener('click', () => selectAlbum(a.dir));
  $('#btnApplyOrder', view)?.addEventListener('click', async () => {
    try {
      const r = await api('/api/album/reorder', { method: 'POST', body: { dir: a.dir, order: S.dirtyOrder } });
      toast(`已重命名 ${r.mapping.length} 个文件`, 'ok');
      S.dirtyOrder = null;
      S.album = r.album;
      render();
    } catch (err) {
      toast('排序失败：' + err.message, 'err');
    }
  });

  /* ---- 上传 ---- */
  const upload = async (files) => {
    if (!files.length) return;
    const status = $('#upStatus');
    let done = 0;
    for (const f of files) {
      status.textContent = `上传中 ${++done}/${files.length}：${f.name}`;
      try {
        await api(`/api/album/upload?dir=${encodeURIComponent(a.dir)}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      } catch (err) {
        toast(`${f.name} 上传失败：${err.message}`, 'err');
      }
    }
    status.textContent = `已上传 ${done} 个文件`;
    await selectAlbum(a.dir);
  };
  $('#btnPick', view).addEventListener('click', () => $('#filePick').click());
  $('#filePick', view).addEventListener('change', (e) => upload([...e.target.files]));
  const dz = $('#dropzone', view);
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('hot'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('hot')));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    upload([...e.dataTransfer.files].filter((f) => /^image\//.test(f.type)));
  });

  /* ---- 图片拖拽排序 ---- */
  let dragName = null;
  $$('#photos .photo', view).forEach((p) => {
    p.addEventListener('dragstart', (e) => {
      dragName = p.dataset.name;
      p.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    p.addEventListener('dragend', () => p.classList.remove('dragging'));
    p.addEventListener('dragover', (e) => {
      e.preventDefault();
      p.classList.add('drop-target');
    });
    p.addEventListener('dragleave', () => p.classList.remove('drop-target'));
    p.addEventListener('drop', (e) => {
      e.preventDefault();
      p.classList.remove('drop-target');
      const target = p.dataset.name;
      if (!dragName || dragName === target) return;
      const order = [...(S.dirtyOrder || a.images.map((i) => i.name))];
      const from = order.indexOf(dragName);
      const to = order.indexOf(target);
      order.splice(to, 0, order.splice(from, 1)[0]);
      S.dirtyOrder = order;
      render();
    });
    p.addEventListener('click', () => editImageDialog(a, p.dataset.name));
  });

  /* ---- 云端图片：添加 / 拖拽排序 / 编辑 ---- */
  const addRemote = async () => {
    const input = $('#remoteUrl', view);
    const url = input.value.trim();
    if (!url) return toast('先粘贴一个图片直链', 'err');
    try {
      const r = await api('/api/album/remote', { method: 'POST', body: { dir: a.dir, url } });
      S.album = r.album;
      toast('已加入云端图片', 'ok');
      render();
    } catch (err) {
      toast('添加失败：' + err.message, 'err');
    }
  };
  $('#btnAddRemote', view).addEventListener('click', addRemote);
  $('#remoteUrl', view).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addRemote();
  });
  $('#btnApplyRemoteOrder', view)?.addEventListener('click', async () => {
    try {
      const r = await api('/api/album/remote/reorder', { method: 'POST', body: { dir: a.dir, order: S.dirtyRemote } });
      S.dirtyRemote = null;
      S.album = r.album;
      toast('云端图片顺序已保存', 'ok');
      render();
    } catch (err) {
      toast('排序失败：' + err.message, 'err');
    }
  });
  // 死链检查：主题没有 try 兜底，一条抓不到的链接会让整站构建失败
  $('#btnCheckRemote')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '检查中…';
    try {
      const r = await api('/api/album/remote/check', { method: 'POST', body: { dir: a.dir } });
      const bad = r.results.filter((x) => !x.ok);
      showModal(`链接检查（${r.total} 条，${r.bad} 条有问题）`,
        bad.length
          ? `<div class="muted small">下面这些链接发布后会导致 <code>hugo</code> 抓取失败，进而中断整站构建，请修掉或删掉：</div>
             <ul class="issues">${bad.map((x) => `<li><b>${esc(x.error)}</b><br><code>${esc(x.url)}</code></li>`).join('')}</ul>
             <div class="muted small">正常的 ${r.total - r.bad} 条已忽略。</div>`
          : `<div class="muted small">${r.total} 条链接全部可抓取 ✓（缩略图带 cdnResize 后缀，只取前 2KB 验证，不会真的下载整张图）。</div>`,
        null,
        [],
        null);
      toast(bad.length ? `${bad.length} 条链接有问题` : '链接全部正常', bad.length ? 'err' : 'ok');
    } catch (err) {
      toast('检查失败：' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = '验证链接';
    }
  });

  let dragUrl = null;
  $$('#remotePhotos .photo', view).forEach((p) => {
    p.addEventListener('dragstart', () => {
      dragUrl = p.dataset.url;
      p.classList.add('dragging');
    });
    p.addEventListener('dragend', () => p.classList.remove('dragging'));
    p.addEventListener('dragover', (e) => {
      e.preventDefault();
      p.classList.add('drop-target');
    });
    p.addEventListener('dragleave', () => p.classList.remove('drop-target'));
    p.addEventListener('drop', (e) => {
      e.preventDefault();
      p.classList.remove('drop-target');
      const target = p.dataset.url;
      if (!dragUrl || dragUrl === target) return;
      const order = [...(S.dirtyRemote || a.remoteImages.map((i) => i.url))];
      const from = order.indexOf(dragUrl);
      const to = order.indexOf(target);
      if (from < 0 || to < 0) return;
      order.splice(to, 0, order.splice(from, 1)[0]);
      S.dirtyRemote = order;
      render();
    });
    p.addEventListener('click', () => editRemoteDialog(a, p.dataset.url));
  });
}

function newAlbumDialog() {
  showModal(
    '新建相册',
    `<label class="field"><span>目录名（英文/数字，用于 URL）</span><input name="dir" type="text" required placeholder="e.g. kyoto-2026"></label>
     <label class="field"><span>相册标题</span><input name="title" type="text" placeholder="京都 2026"></label>
     <label class="field"><span>描述</span><textarea name="description" style="min-height:60px"></textarea></label>`,
    async (form) => {
      const fd = new FormData(form);
      await api('/api/album', { method: 'POST', body: { dir: fd.get('dir'), title: fd.get('title'), description: fd.get('description') } });
      await refresh(false);
      await selectAlbum(String(fd.get('dir')).trim());
      toast('相册已创建', 'ok');
    }
  );
}

function editImageDialog(album, name) {
  const img = album.images.find((i) => i.name === name);
  if (!img) return;
  const p = img.params;
  showModal(
    `编辑图片 · ${esc(name)}`,
    `<div class="row">
       <label class="field"><span>标题</span><input name="title" type="text" value="${esc(img.title)}"></label>
       <label class="field"><span>文件名</span><input name="newName" type="text" value="${esc(img.name)}"></label>
     </div>
     <label class="field"><span>描述</span><textarea name="description" style="min-height:60px">${esc(img.description)}</textarea></label>
     <div class="row">
       <label class="field"><span>相机</span><input name="camera" type="text" value="${esc(p.camera)}"></label>
       <label class="field"><span>镜头</span><input name="lens" type="text" value="${esc(p.lens)}"></label>
       <label class="field"><span>ISO</span><input name="iso" type="text" value="${esc(p.iso)}"></label>
     </div>
     <div class="row">
       <label class="field"><span>光圈</span><input name="aperture" type="text" value="${esc(p.aperture)}"></label>
       <label class="field"><span>快门</span><input name="exposure" type="text" value="${esc(p.exposure)}"></label>
       <label class="field"><span>焦距</span><input name="focal" type="text" value="${esc(p.focal)}"></label>
       <label class="field"><span>拍摄时间</span><input name="date" type="text" value="${esc(p.date)}"></label>
     </div>
     <div class="row">
       <label class="check"><input name="hidden" type="checkbox" ${img.hidden ? 'checked' : ''}> 在相册中隐藏</label>
       <label class="check"><input name="cover" type="checkbox" ${img.cover ? 'checked' : ''}> 设为封面</label>
     </div>
     <div class="muted small">${esc(bytes(img.size))} · ${when(img.mtime)}</div>`,
    async (form) => {
      const fd = new FormData(form);
      const { album: next } = await api('/api/album/image', {
        method: 'PATCH',
        body: {
          dir: album.dir,
          name,
          patch: {
            title: fd.get('title'),
            newName: fd.get('newName'),
            description: fd.get('description'),
            hidden: fd.get('hidden') === 'on',
            cover: fd.get('cover') === 'on',
            params: {
              camera: fd.get('camera'),
              lens: fd.get('lens'),
              iso: fd.get('iso'),
              aperture: fd.get('aperture'),
              exposure: fd.get('exposure'),
              focal: fd.get('focal'),
              date: fd.get('date'),
            },
          },
        },
      });
      S.album = next;
      toast('图片信息已保存', 'ok');
      render();
    },
    [
      {
        label: '删除这张图',
        cls: 'danger',
        run: async () => {
          if (!confirm(`把 ${name} 移到回收站？`)) return false;
          const r = await api('/api/album/image', { method: 'DELETE', body: { dir: album.dir, name } });
          S.album = r.album;
          toast('已移到回收站', 'ok');
          render();
          return true;
        },
      },
    ]
  );
}

function editRemoteDialog(album, url) {
  const img = album.remoteImages.find((i) => i.url === url);
  if (!img) return;
  const p = img.params || {};
  showModal(
    `编辑云端图片 · ${esc(img.title || url.split('/').pop() || url)}`,
    `<div style="margin-bottom:10px"><img src="${esc(img.thumbUrl)}" alt="" style="max-height:160px;border-radius:8px" referrerpolicy="no-referrer"></div>
     <label class="field"><span>图片直链（http/https，可改）</span><input name="url" type="text" value="${esc(img.url)}" required></label>
     <div class="row">
       <label class="field"><span>标题</span><input name="title" type="text" value="${esc(img.title)}"></label>
       <label class="field"><span>替代文字/文件名提示</span><input type="text" value="${esc(url.split('/').pop() || '')}" disabled></label>
     </div>
     <label class="field"><span>描述</span><textarea name="description" style="min-height:60px">${esc(img.description)}</textarea></label>
     <div class="row">
       <label class="field"><span>相机</span><input name="camera" type="text" value="${esc(p.camera)}"></label>
       <label class="field"><span>镜头</span><input name="lens" type="text" value="${esc(p.lens)}"></label>
       <label class="field"><span>ISO</span><input name="iso" type="text" value="${esc(p.iso)}"></label>
     </div>
     <div class="row">
       <label class="field"><span>光圈</span><input name="aperture" type="text" value="${esc(p.aperture)}"></label>
       <label class="field"><span>快门</span><input name="exposure" type="text" value="${esc(p.exposure)}"></label>
       <label class="field"><span>焦距</span><input name="focal" type="text" value="${esc(p.focal)}"></label>
       <label class="field"><span>拍摄时间</span><input name="date" type="text" value="${esc(p.date)}"></label>
     </div>
     <div class="muted small">这些信息写在 front matter 的 <code>images:</code> 里，key 就是这条 URL；留空即删除。改动只影响仓库文本，不会碰 CDN 上的图。</div>`,
    async (form) => {
      const fd = new FormData(form);
      const { album: next } = await api('/api/album/remote', {
        method: 'PATCH',
        body: {
          dir: album.dir,
          url,
          patch: {
            url: String(fd.get('url')).trim(),
            title: fd.get('title'),
            description: fd.get('description'),
            params: {
              camera: fd.get('camera'),
              lens: fd.get('lens'),
              iso: fd.get('iso'),
              aperture: fd.get('aperture'),
              exposure: fd.get('exposure'),
              focal: fd.get('focal'),
              date: fd.get('date'),
            },
          },
        },
      });
      S.album = next;
      toast('云端图片信息已保存', 'ok');
      render();
    },
    [
      {
        label: '测试链接',
        run: async () => {
          const r = await api('/api/album/remote/probe', { method: 'POST', body: { url } });
          const x = r.result;
          toast(x.ok ? `链接正常：HTTP ${x.status} ${x.type}` : `有问题：${x.error}`, x.ok ? 'ok' : 'err');
          return false;
        },
      },
      {
        label: '下载到本地相册',
        run: async () => {
          toast('正在下载…');
          const r = await api('/api/album/remote/fetch', { method: 'POST', body: { dir: album.dir, url } });
          S.album = r.album;
          toast(`已保存为 ${r.name}（${bytes(r.size)}），并已从云端列表移除`, 'ok');
          render();
          return true;
        },
      },
      {
        label: '从相册移除',
        cls: 'danger',
        run: async () => {
          if (!confirm('从 remote_images 里移除这条链接？（CDN 上的图不受影响）')) return false;
          const r = await api('/api/album/remote', { method: 'DELETE', body: { dir: album.dir, url } });
          S.album = r.album;
          toast('已移除', 'ok');
          render();
          return true;
        },
      },
    ]
  );
}

/* ============================================================== 实时预览 */

/**
 * 极简 Markdown 渲染：只覆盖本站实际用到的子集（标题/段落/列表/引用/分隔线/代码/强调/链接/图片）。
 * 原始 HTML 一律转义 —— 与 Hugo 默认 unsafe=false 的行为一致（正文里的裸 <div> 在站点上同样不生效）。
 */
function mdInline(s) {
  const codes = [];
  let t = String(s ?? '');
  t = t.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(`<code>${c}</code>`) - 1}\u0000`);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img src="${u}" alt="${a}" loading="lazy">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, a, u) => `<a href="${u}" target="_blank" rel="noopener">${a}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[+i]);
}

/** 相册目录 + 文件名 → 可直接显示的后台图片地址（找不到返回 null） */
function previewImageUrl(dir, src) {
  const names = (S.assets && S.assets[dir]) || [];
  const want = String(src || '').toLowerCase();
  if (!want) return null;
  const hit = names.find((n) => n.toLowerCase() === want) || names.find((n) => n.toLowerCase().endsWith(want));
  return hit ? `/api/media?path=${encodeURIComponent(`content/${dir}/${hit}`)}` : null;
}

/** {{< photo … >}} → <figure>；找不到图片时给出和 Hugo 同义的提示 */
function previewPhoto(line, ctx) {
  const m = line.match(/^\s*\{\{<\s*photo\b([\s\S]*?)\}\}\s*$/);
  if (!m) return null;
  const args = m[1];
  const get = (k) => {
    // Hugo 的短代码参数可以带引号也可以裸写（插入对话框生成的就是 wide=true）
    const r = new RegExp(`(?:^|\\s)${k}\\s*=\\s*(?:"([^"]*)"|([^\\s]+))`).exec(args);
    return r ? r[1] ?? r[2] ?? '' : '';
  };
  const positional = (args.match(/"([^"]+)"/) || [])[1] || '';
  const src = get('src') || positional;
  const from = get('from');
  const caption = get('caption');
  const dir = from || ctx.dir || '';
  if (!src) return '<div class="pv-warn">photo 短代码缺少 src</div>';
  const url = previewImageUrl(dir, src);
  if (!url)
    return `<div class="pv-warn">找不到图片 <code>${esc(src)}</code>${from ? `（from=${esc(from)}）` : ''}：相册里没有这个文件，构建时 Hugo 会输出 WARN 且这里不显示图片</div>`;
  return `<figure class="pv-photo${get('wide') === 'true' ? ' pv-photo--wide' : ''}">
    <img src="${url}" alt="${esc(get('alt') || caption || src)}" loading="lazy">
    ${caption ? `<figcaption>${mdInline(esc(caption))}</figcaption>` : ''}
  </figure>`;
}

/** 渲染 Markdown 正文（ctx.dir = 当前游记 slug，用于解析不带 from 的图片） */
function mdRender(md, ctx = {}) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  let quote = [];
  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${quote.join('<br>')}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^\s*```/.test(raw)) {
      flushAll();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (/^\s*$/.test(raw)) {
      flushAll();
      continue;
    }
    const photo = previewPhoto(raw, ctx);
    if (photo) {
      flushAll();
      out.push(photo);
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushAll();
      const lv = h[1].length;
      out.push(`<h${lv}>${mdInline(esc(h[2]))}</h${lv}>`);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(raw)) {
      flushAll();
      out.push('<hr>');
      continue;
    }
    const bq = raw.match(/^\s*>\s?(.*)$/);
    if (bq) {
      flushPara();
      flushList();
      quote.push(mdInline(esc(bq[1])));
      continue;
    }
    const ul = raw.match(/^\s*[-*+]\s+(.*)$/);
    if (ul) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(`<li>${mdInline(esc(ul[1]))}</li>`);
      continue;
    }
    const ol = raw.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ol) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(`<li>${mdInline(esc(ol[1]))}</li>`);
      continue;
    }
    flushList();
    flushQuote();
    para.push(mdInline(esc(raw)));
  }
  flushAll();
  return out.join('\n') || '<p class="muted">（正文为空）</p>';
}

const debounce = (fn, ms = 140) => {
  let t = null;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

async function ensureAssets(force = false) {
  if (S.assets && !force) return S.assets;
  try {
    S.assets = (await api('/api/assets')).assets || {};
  } catch {
    S.assets = {};
  }
  return S.assets;
}

/** 预览外壳：模仿 themes/gallery/layouts/stories/single.html 的头部结构 */
function previewShell(title, date, desc, bodyHtml) {
  return `<article class="pv-article">
    <header class="pv-header">
      <div class="pv-rule"></div>
      ${date ? `<time class="pv-date">${esc(date)}</time>` : ''}
      <h1 class="pv-title">${esc(title || '（未填标题）')}</h1>
      ${desc ? `<p class="pv-desc">${mdInline(esc(desc))}</p>` : ''}
    </header>
    <div class="pv-body">${bodyHtml}</div>
  </article>`;
}

/** 站点预览（hugo server）里打开当前页面 */
function openSitePreview(rel) {
  const job = (S.state?.jobs || []).find((x) => x.kind === 'preview' && x.status === 'running' && x.ready);
  if (!job) return toast('本地预览还没启动：先到「构建」页点「启动本地预览」', 'err');
  window.open(new URL(rel, job.url).href, '_blank');
}

/**
 * 双向同步滚动：编辑区（textarea）与预览区按滚动比例联动。
 * 用一个 rAF 守卫防止两边互相触发造成抖动；目标位置几乎相同就跳过。
 */
function linkScroll(a, b) {
  if (!a || !b) return;
  let guard = false;
  const follow = (src, dst) => {
    if (guard) return;
    const sMax = src.scrollHeight - src.clientHeight;
    const dMax = dst.scrollHeight - dst.clientHeight;
    if (sMax <= 0 || dMax <= 0) return;
    const target = Math.round((src.scrollTop / sMax) * dMax);
    if (Math.abs(dst.scrollTop - target) < 2) return;
    guard = true;
    dst.scrollTop = target;
    requestAnimationFrame(() => { guard = false; });
  };
  a.addEventListener('scroll', () => follow(a, b), { passive: true });
  b.addEventListener('scroll', () => follow(b, a), { passive: true });
}

/* ============================================================== 游记 */

async function selectStory(slug) {
  S.storySlug = slug;
  setHash('stories', slug);
  try {
    const { story } = await api(`/api/story?slug=${encodeURIComponent(slug)}`);
    S.story = story;
  } catch (err) {
    toast('读取游记失败：' + err.message, 'err');
  }
  render();
}

function renderStories(view) {
  const list = S.state.stories;
  if (!S.story && !S.storySlug) {
    autoSelect(list, (s) => s.slug, (sl) => selectStory(sl).catch(() => {}));
  } else if (S.pendingId) {
    const want = list.find((s) => s.slug === S.pendingId);
    S.pendingId = null;
    if (want && want.slug !== S.storySlug) selectStory(want.slug).catch(() => {});
  }
  const albumDirs = Object.keys(S.state.albums.reduce((m, a) => ((m[a.dir] = 1), m), {}));
  const aside = `
    <div class="card">
      <div class="toolbar"><button class="primary" id="btnNewStory">＋ 新建游记</button></div>
      <div class="list">
        ${list
          .map(
            (s) => `<div class="list-item ${s.slug === S.storySlug ? 'active' : ''}" data-slug="${esc(s.slug)}">
          <div class="name">${esc(s.title)}<div class="sub">${esc(s.date || '')} · 引用 ${s.photos} 张</div></div>
        </div>`
          )
          .join('')}
      </div>
    </div>`;
  const s = S.story;
  const editor = !s
    ? '<div class="card">从左侧选择一篇游记，或新建一篇。正文用 <code>{{&lt; photo … &gt;}}</code> 短代码从相册取图。</div>'
    : `<div class="card col">
      <div class="toolbar">
        <strong>${esc(s.title)}</strong><span class="muted small">content/stories/${esc(s.slug)}/index.md</span>
        <span class="spacer"></span>
        <button class="ghost" id="btnOpenStory">打开文件夹</button>
        <button class="danger" id="btnDelStory">删除</button>
      </div>
      <div class="row">
        <label class="field"><span>标题</span><input id="stTitle" type="text" value="${esc(s.title)}"></label>
        <label class="field"><span>日期</span><input id="stDate" type="date" value="${esc(String(s.date).slice(0, 10))}"></label>
      </div>
      <label class="field"><span>摘要 / 描述</span><input id="stDesc" type="text" value="${esc(s.description)}"></label>
      <div class="row">
        <label class="field"><span>封面来源相册（cover_from）</span>
          <select id="stCoverFrom"><option value="">（不设置）</option>
            ${albumDirs.map((d) => `<option value="${esc(d)}" ${d === s.coverFrom ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select></label>
        <label class="field"><span>封面图（cover）</span><input id="stCover" type="text" value="${esc(s.cover)}" placeholder="文件名，如 01-xxx.jpg"></label>
      </div>
      <label class="field grow"><span>正文（Markdown + 短代码）</span>
        <textarea id="stBody">${esc(s.body)}</textarea>
      </label>
      <div class="toolbar">
        <button id="btnInsertPhoto">＋ 插入相册图片</button>
        <span class="muted small">共 ${s.photos.length} 个 photo 短代码</span>
        <span class="spacer"></span>
        <button class="primary" id="btnSaveStory">保存游记</button>
      </div>
    </div>`;
  // 预览单独占一列（与列表、编辑并列），不再塞在编辑卡片内部
  const previewCol = !s
    ? ''
    : `<div class="card col preview-pane">
      <div class="preview-head">
        <strong>实时预览</strong>
        <span class="muted small">简化渲染，最终以站点构建为准</span>
        <span class="spacer"></span>
        <button class="ghost" id="btnSitePreview">在站点预览中打开</button>
      </div>
      <div class="preview-body" id="stPreview"></div>
    </div>`;

  view.innerHTML = `<div class="split three fill">${aside}${editor}${previewCol}</div>`;

  $$('.list-item', view).forEach((el) => el.addEventListener('click', () => selectStory(el.dataset.slug)));
  $('#btnNewStory', view).addEventListener('click', () =>
    showModal(
      '新建游记',
      `<label class="field"><span>目录名（英文/数字）</span><input name="slug" type="text" required placeholder="e.g. kyoto-trip"></label>
       <label class="field"><span>标题</span><input name="title" type="text"></label>
       <label class="field"><span>日期</span><input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}"></label>
       <label class="field"><span>摘要</span><input name="description" type="text"></label>`,
      async (form) => {
        const fd = new FormData(form);
        const slug = String(fd.get('slug')).trim();
        await api('/api/story', { method: 'POST', body: { slug, title: fd.get('title'), date: fd.get('date'), description: fd.get('description') } });
        await refresh(false);
        await selectStory(slug);
        toast('游记已创建', 'ok');
      }
    )
  );
  if (!s) return;

  /* ---- 实时预览：标题/日期/摘要/正文任一改动都按 140ms 防抖重绘 ---- */
  const pvBox = $('#stPreview', view);
  const bodyBox = $('#stBody', view);
  const paintPreview = () => {
    if (!pvBox) return;
    const keepTop = pvBox.scrollTop; // 重绘后保持滚动位置，不然打字会跳回顶部
    pvBox.innerHTML = previewShell(
      $('#stTitle', view)?.value,
      $('#stDate', view)?.value,
      $('#stDesc', view)?.value,
      mdRender(bodyBox?.value, { dir: s.slug })
    );
    pvBox.scrollTop = keepTop;
  };
  const paintSoon = debounce(paintPreview);
  ['stTitle', 'stDate', 'stDesc', 'stBody'].forEach((id) => $('#' + id, view)?.addEventListener('input', paintSoon));
  $('#btnSitePreview', view)?.addEventListener('click', () => openSitePreview(`stories/${s.slug}/`));
  linkScroll(bodyBox, pvBox); // 滚正文时预览跟着滚，反之亦然
  ensureAssets().then(() => { if (pvBox?.isConnected) paintPreview(); });
  paintPreview();

  const saveStory = async () => {
    const { story } = await api('/api/story', {
      method: 'PUT',
      body: {
        slug: s.slug,
        patch: {
          title: $('#stTitle').value,
          date: $('#stDate').value,
          description: $('#stDesc').value,
          cover: $('#stCover').value,
          coverFrom: $('#stCoverFrom').value,
          body: $('#stBody').value,
        },
      },
    });
    S.story = story;
    await refresh(false);
    toast('游记已保存', 'ok');
    render();
  };
  $('#btnSaveStory', view).addEventListener('click', () => saveStory().catch((err) => toast('保存失败：' + err.message, 'err')));
  $('#btnDelStory', view).addEventListener('click', async () => {
    if (!confirm(`把游记「${s.title}」移到回收站？`)) return;
    try {
      await api('/api/story', { method: 'DELETE', body: { slug: s.slug } });
      S.story = null;
      S.storySlug = null;
      await refresh(false);
      render();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  $('#btnOpenStory', view).addEventListener('click', async () => {
    try {
      await api('/api/open', { method: 'POST', body: { target: `content/stories/${s.slug}` } });
    } catch (err) {
      toast(err.message, 'err');
    }
  });
  $('#btnInsertPhoto', view).addEventListener('click', async () => {
    const assets = (await api('/api/assets')).assets;
    const dirs = Object.keys(assets);
    showModal(
      '插入相册图片',
      `<div class="row">
        <label class="field"><span>相册</span><select name="from" id="insFrom">${dirs.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')}</select></label>
        <label class="field"><span>图片</span><select name="src" id="insSrc"></select></label>
      </div>
      <label class="field"><span>说明文字（caption，可空）</span><input name="caption" type="text"></label>
      <label class="check"><input name="wide" type="checkbox"> 宽幅显示（wide）</label>
      <div class="muted small">插入到正文光标处：<code>{{&lt; photo src="…" from="…" caption="…" &gt;}}</code></div>`,
      async (form) => {
        const fd = new FormData(form);
        const ta = $('#stBody');
        const snippet = `{{< photo src="${fd.get('src')}" from="${fd.get('from')}"${fd.get('caption') ? ` caption="${fd.get('caption')}"` : ''}${
          fd.get('wide') === 'on' ? ' wide=true' : ''
        } >}}`;
        const at = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, at) + snippet + '\n' + ta.value.slice(ta.selectionEnd ?? at);
        try {
          await saveStory();
        } catch (err) {
          toast('已插入短代码，但保存失败：' + err.message, 'err');
        }
      },
      [],
      (dlg) => {
        const fill = () => {
          const d = dlg.querySelector('#insFrom').value;
          dlg.querySelector('#insSrc').innerHTML = (assets[d] || []).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
        };
        dlg.querySelector('#insFrom').addEventListener('change', fill);
        fill();
      }
    );
  });
}

/* ============================================================== 页面 */

async function selectPage(path) {
  S.pagePath = path;
  setHash('pages', path);
  try {
    const { page } = await api(`/api/page?path=${encodeURIComponent(path)}`);
    S.page = page;
  } catch (err) {
    toast(err.message, 'err');
  }
  render();
}

function renderPages(view) {
  const pages = S.state.pages;
  if (!S.page && !S.pagePath) {
    autoSelect(pages, (p) => p.path, (pth) => selectPage(pth).catch(() => {}));
  } else if (S.pendingId) {
    const want = pages.find((p) => p.path === S.pendingId);
    S.pendingId = null;
    if (want && want.path !== S.pagePath) selectPage(want.path).catch(() => {});
  }
  const aside = `
    <div class="card">
      <h2>页面</h2>
      <div class="list">
        ${pages
          .map(
            (p) => `<div class="list-item ${p.path === S.pagePath ? 'active' : ''}" data-path="${esc(p.path)}">
          <div class="name">${esc(p.title || p.label)}<div class="sub">${esc(p.label)}</div></div></div>`
          )
          .join('')}
      </div>
      <div class="muted small" style="margin-top:8px">这里是「单页」：首页、关于、收藏等。相册和游记请到对应标签页管理。</div>
    </div>`;
  const p = S.page;
  const editor = !p
    ? '<div class="card">选择左侧的一个页面。</div>'
    : `<div class="card col">
      <div class="toolbar"><strong>${esc(p.title || p.path)}</strong><span class="muted small">${esc(p.path)} · 最后修改 ${when(p.mtime)}</span></div>
      <div class="muted small">原有 front matter 字段：${p.keys.map((k) => `<code>${esc(k)}</code>`).join(' ') || '（无）'}</div>
      <div class="row" style="margin-top:10px">
        <label class="field"><span>标题</span><input id="pgTitle" type="text" value="${esc(p.title)}"></label>
        <label class="field"><span>描述</span><input id="pgDesc" type="text" value="${esc(p.description)}"></label>
      </div>
      <label class="field grow"><span>正文（Markdown）</span>
        <textarea id="pgBody">${esc(p.body)}</textarea>
      </label>
      <div class="toolbar"><button class="primary" id="btnSavePage">保存</button>
      <button class="ghost" id="btnOpenPage">打开所在文件夹</button></div>
      ${p.path === 'content/_index.md' ? '<div class="muted small">首页正文用于首页顶部的介绍文字。</div>' : ''}
    </div>`;
  // 预览单独占一列（与列表、编辑并列）
  const previewCol = !p
    ? ''
    : `<div class="card col preview-pane">
      <div class="preview-head">
        <strong>实时预览</strong>
        <span class="muted small">简化渲染，最终以站点构建为准</span>
        <span class="spacer"></span>
        <button class="ghost" id="btnSitePreview">在站点预览中打开</button>
      </div>
      <div class="preview-body" id="pgPreview"></div>
    </div>`;
  view.innerHTML = `<div class="split three fill">${aside}${editor}${previewCol}</div>`;
  $$('.list-item', view).forEach((el) => el.addEventListener('click', () => selectPage(el.dataset.path)));
  if (!p) return;

  /* ---- 实时预览（页面：Hugo 会加上 baseof 的标题与正文） ---- */
  const pgPv = $('#pgPreview', view);
  const pgBody = $('#pgBody', view);
  const paintPagePreview = () => {
    if (!pgPv) return;
    const keepTop = pgPv.scrollTop;
    pgPv.innerHTML = previewShell($('#pgTitle', view)?.value, '', $('#pgDesc', view)?.value, mdRender(pgBody?.value, {}));
    pgPv.scrollTop = keepTop;
  };
  const paintPageSoon = debounce(paintPagePreview);
  ['pgTitle', 'pgDesc', 'pgBody'].forEach((id) => $('#' + id, view)?.addEventListener('input', paintPageSoon));
  const rel = p.path === 'content/_index.md' ? '' : p.path.replace(/^content\//, '').replace(/\.md$/, '/');
  $('#btnSitePreview', view)?.addEventListener('click', () => openSitePreview(rel));
  linkScroll(pgBody, pgPv); // 编辑区与预览区滚动同步
  ensureAssets().then(() => { if (pgPv?.isConnected) paintPagePreview(); });
  paintPagePreview();
  $('#btnSavePage', view).addEventListener('click', async () => {
    try {
      const { page } = await api('/api/page', {
        method: 'PUT',
        body: { path: p.path, patch: { title: $('#pgTitle').value, description: $('#pgDesc').value, body: $('#pgBody').value } },
      });
      S.page = page;
      toast('已保存', 'ok');
      render();
    } catch (err) {
      toast('保存失败：' + err.message, 'err');
    }
  });
  $('#btnOpenPage', view).addEventListener('click', async () => {
    try {
      await api('/api/open', { method: 'POST', body: { target: 'content' } });
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

/* ============================================================== 构建 */

function renderBuild(view) {
  // 预览要等 hugo 真正监听端口后再嵌 iframe，否则会看到「拒绝连接」
  const pvJob = S.state.jobs?.find((j) => j.kind === 'preview' && j.status === 'running');
  if (pvJob?.ready) {
    S.previewUrl = pvJob.url || S.previewUrl;
    S.previewReady = true;
  }
  view.innerHTML = `
  <div class="split fill">
    <div class="card">
      <h2>构建与预览</h2>
      <div class="toolbar">
        <button class="primary" id="btnBuild">一键构建（EXIF → 构建 → 加密）</button>
        <button id="btnExif">仅提取 EXIF</button>
        <button id="btnEncrypt">仅加密受保护相册</button>
      </div>
      <div class="toolbar">
        <button id="btnPreview">启动本地预览 (:1313)</button>
        <button id="btnStopPreview">停止预览</button>
        <button id="btnOpenPreview">在浏览器打开预览</button>
      </div>
      <div class="toolbar">
        <button class="ghost" id="btnOpenPublic">打开构建产物 public/</button>
        <button class="ghost" id="btnOpenRoot">打开仓库目录</button>
      </div>
      <div class="muted small">
        一键构建 = 与 CI 相同的流程：<code>python scripts/extract-exif.py</code>（需要 exiftool）→
        <code>hugo --gc --minify</code> → <code>node themes/gallery/scripts/encrypt-protected.mjs</code>。
        本地预览会热重载，适合边改边看。
      </div>
      ${S.previewUrl && S.previewReady ? `<div style="margin-top:12px">
        <div class="status-line"><strong>预览</strong><span class="small muted">${esc(S.previewUrl)}</span><span class="spacer"></span><button class="ghost" id="btnReloadPreview">↻ 重新载入</button></div>
        <iframe class="preview" id="previewFrame" src="${esc(S.previewUrl)}"></iframe>
      </div>` : pvJob ? `<div class="muted small" id="pvStarting" style="margin-top:12px">预览正在启动…（hugo 要先编译一遍才会监听端口，通常 1–3 秒）</div>` : ''}
    </div>
    <div class="card col">
      <div class="status-line">
        <strong>任务输出</strong><span id="logStatus" class="small muted"></span>
        <span class="spacer"></span>
        <button class="ghost" id="btnStopJob">停止任务</button>
      </div>
      <div class="console" id="console">（还没有任务）</div>
    </div>
  </div>`;

  const run = async (path, body, label) => {
    try {
      const r = await api(path, { method: 'POST', body });
      toast(`${label} 已开始`, 'ok');
      watchJob(r.jobId ?? r.job?.id);
    } catch (err) {
      toast(`${label} 失败：${err.message}`, 'err');
    }
  };
  $('#btnBuild', view).addEventListener('click', async () => {
    toast('开始构建…');
    try {
      const r = await api('/api/build', { method: 'POST', body: { baseURL: '/' } });
      if (r.job) renderJob(r.job);
      if (r.ok) toast('构建成功', 'ok');
      else toast('构建失败，请看输出', 'err');
    } catch (err) {
      toast('构建失败：' + err.message, 'err');
    }
  });
  $('#btnExif', view).addEventListener('click', () => run('/api/exif', {}, 'EXIF 提取'));
  $('#btnEncrypt', view).addEventListener('click', () => run('/api/encrypt', {}, '加密'));
  $('#btnPreview', view).addEventListener('click', async () => {
    try {
      const r = await api('/api/preview', { method: 'POST', body: { port: 1313 } });
      const jobId = r.job?.id ?? r.jobId;
      S.previewReady = !!r.ready;
      S.previewUrl = r.url;
      if (S.previewReady) toast('预览已就绪：' + r.url, 'ok');
      else toast('预览启动中，稍等一两秒…');
      render();
      if (!S.previewReady && jobId) waitPreviewReady(jobId);
    } catch (err) {
      toast('预览启动失败：' + err.message, 'err');
    }
  });
  $('#btnStopPreview', view).addEventListener('click', async () => {
    const st = S.state.jobs?.find((j) => j.kind === 'preview');
    if (!st) return toast('没有正在运行的预览');
    await api('/api/job/stop', { method: 'POST', body: { id: st.id } });
    if (S.pvTimer) {
      clearInterval(S.pvTimer);
      S.pvTimer = null;
    }
    S.previewUrl = null;
    S.previewReady = false;
    toast('预览已停止');
    render();
  });
  $('#btnOpenPreview', view).addEventListener('click', () => window.open(S.previewUrl || 'http://127.0.0.1:1313/', '_blank'));
  const reloadPreview = () => {
    const f = $('#previewFrame', view);
    if (f && S.previewUrl) f.src = S.previewUrl + (S.previewUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
    else render();
  };
  const reloadBtn = $('#btnReloadPreview', view);
  if (reloadBtn) reloadBtn.addEventListener('click', reloadPreview);
  $('#btnOpenPublic', view).addEventListener('click', () => api('/api/open', { method: 'POST', body: { target: 'public' } }).catch((e) => toast(e.message, 'err')));
  $('#btnOpenRoot', view).addEventListener('click', () => api('/api/open', { method: 'POST', body: { target: 'root' } }).catch((e) => toast(e.message, 'err')));
  $('#btnStopJob', view).addEventListener('click', async () => {
    if (!S.log) return;
    await api('/api/job/stop', { method: 'POST', body: { id: S.log.id } }).catch(() => {});
  });
  if (S.log) renderLog();
}

function renderJob(job) {
  S.log = { id: job.id, since: 0, lines: job.lines || [], status: job.status, exitCode: job.exitCode };
  renderLog();
  if (job.status === 'running') watchJob(job.id);
}

function renderLog() {
  const el = $('#console');
  if (!el || !S.log) return;
  el.innerHTML = S.log.lines.map((l) => `<div class="${l.startsWith('! ') ? 'err' : l.startsWith('===') ? 'head' : ''}">${esc(l)}</div>`).join('');
  el.scrollTop = el.scrollHeight;
  const st = $('#logStatus');
  if (st)
    st.textContent =
      S.log.status === 'running' ? '运行中…' : S.log.status === 'ok' ? '✓ 成功' : `✗ ${S.log.status}${S.log.exitCode != null ? ` (退出码 ${S.log.exitCode})` : ''}`;
}

/** 等 hugo server 真正监听端口（服务端探测），就绪后再嵌入 iframe。 */
function waitPreviewReady(id) {
  if (S.pvTimer) clearInterval(S.pvTimer);
  const t = setInterval(async () => {
    try {
      const { job } = await api(`/api/job?id=${id}`);
      if (job?.ready) {
        clearInterval(t);
        S.pvTimer = null;
        S.previewUrl = job.url || S.previewUrl;
        S.previewReady = true;
        toast('预览已就绪：' + S.previewUrl, 'ok');
        if (S.tab === 'build') render();
      } else if (job && job.status !== 'running') {
        clearInterval(t);
        S.pvTimer = null;
        S.previewReady = false;
        toast('预览没能启动，请看下方任务输出', 'err');
        if (S.tab === 'build') render();
      }
    } catch {
      clearInterval(t);
      S.pvTimer = null;
    }
  }, 400);
  S.pvTimer = t;
}

function watchJob(id) {
  if (!S.log || S.log.id !== id) S.log = { id, since: 0, lines: [], status: 'running' };
  const timer = setInterval(async () => {
    try {
      const { job } = await api(`/api/job?id=${id}&since=${S.log.since}`);
      if (!job) return;
      S.log.lines.push(...job.lines);
      if (S.log.lines.length > 3000) S.log.lines.splice(0, S.log.lines.length - 3000);
      S.log.since = job.total;
      S.log.status = job.status;
      S.log.exitCode = job.exitCode;
      renderLog();
      if (job.status !== 'running') {
        clearInterval(timer);
        S.timers = S.timers.filter((t) => t !== timer);
        if (job.status === 'ok') toast('任务完成 ✓', 'ok');
        else toast(`任务结束：${job.status}${job.error ? ' · ' + job.error : ''}`, 'err');
        await refresh(false);
        const btn = $('#btnStopPreview');
        if (S.tab === 'build' && btn) render();
        if (S.tab === 'publish') render();
      }
    } catch {
      clearInterval(timer);
    }
  }, 600);
  S.timers.push(timer);
}

/* ============================================================== 发布 */

function renderPublish(view) {
  const g = S.state.git;
  if (!g.available) {
    view.innerHTML = '<div class="card">未检测到 git，无法从这里提交。</div>';
    return;
  }
  if (S.gitSel === null) S.gitSel = g.files.map((f) => f.path);
  const sel = new Set(S.gitSel);
  view.innerHTML = `
  <div class="split fill">
    <div class="card">
      <div class="toolbar"><strong>Git 发布</strong><span class="badge">${esc(g.branch)}</span>
        <span class="spacer"></span><button class="ghost" id="btnGitReload">刷新</button></div>
      ${
        g.files.length
          ? `<div class="toolbar"><button class="ghost" id="btnSelAll">全选</button><button class="ghost" id="btnSelNone">全不选</button>
             <span class="muted small">已选 ${sel.size}/${g.files.length}</span></div>
             <div class="list fixed">
             ${g.files
               .map(
                 (f) => `<label class="list-item" style="cursor:pointer">
                 <input type="checkbox" data-file="${esc(f.path)}" ${sel.has(f.path) ? 'checked' : ''}>
                 <span class="name">${esc(f.path)}</span><span class="badge">${esc(f.status.trim() || 'M')}</span></label>`
               )
               .join('')}
             </div>`
          : '<div class="muted">工作区干净，没有需要提交的改动。</div>'
      }
      <label class="field" style="margin-top:12px"><span>提交说明</span><input id="gitMsg" type="text" placeholder="例如：新增京都相册"></label>
      <div class="toolbar">
        <button class="primary" id="btnCommit">提交</button>
        <button class="primary" id="btnCommitPush">提交并推送</button>
      </div>
      <div class="muted small">
        推送后 GitHub Actions（.github/workflows/publish.yml）会自动构建并发布到 <code>gh-pages</code> 分支，等 1–2 分钟即可。
        未安装 exiftool 时 CI 会自动安装；本地构建若没有 exiftool 会跳过 EXIF 提取。
      </div>
      <h3>最近提交</h3>
      <div class="muted small scrollbox">${g.log.map(esc).join('<br>')}</div>
    </div>
    <div class="card col">
      <div class="status-line"><strong>任务输出</strong><span id="logStatus" class="small muted"></span></div>
      <div class="console" id="console">（还没有任务）</div>
    </div>
  </div>`;
  $('#btnGitReload', view).addEventListener('click', () => refresh());
  $$('input[data-file]', view).forEach((cb) =>
    cb.addEventListener('change', () => {
      const p = cb.dataset.file;
      if (cb.checked) sel.add(p);
      else sel.delete(p);
      S.gitSel = [...sel];
      render();
    })
  );
  $('#btnSelAll', view)?.addEventListener('click', () => {
    S.gitSel = g.files.map((f) => f.path);
    render();
  });
  $('#btnSelNone', view)?.addEventListener('click', () => {
    S.gitSel = [];
    render();
  });
  const commit = async (push) => {
    const msg = $('#gitMsg').value.trim();
    if (!msg) return toast('请填写提交说明', 'err');
    if (!S.gitSel.length) return toast('请至少选择一个文件', 'err');
    try {
      const r = await api('/api/git/commit', { method: 'POST', body: { message: msg, files: S.gitSel, push } });
      toast(push ? '提交并推送中…' : '提交中…', 'ok');
      watchJob(r.jobId);
    } catch (err) {
      toast(err.message, 'err');
    }
  };
  $('#btnCommit', view).addEventListener('click', () => commit(false));
  $('#btnCommitPush', view).addEventListener('click', () => commit(true));
  if (S.log) renderLog();
}

/* ============================================================== 弹窗 */

let modalExtra = [];
function showModal(title, html, onSubmit, extras = [], onOpen = null) {
  const dlg = $('#modal');
  $('#modalTitle').innerHTML = title;
  $('#modalBody').innerHTML = html;
  const actions = $('.modal-actions', dlg);
  $$('button.extra', actions).forEach((b) => b.remove());
  const saveBtn = $('button[value="ok"]', actions);
  if (saveBtn) saveBtn.hidden = !onSubmit;
  modalExtra = extras;
  for (const ex of extras) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `extra ${ex.cls || ''}`;
    b.textContent = ex.label;
    b.style.marginRight = 'auto';
    b.addEventListener('click', async () => {
      try {
        const closed = await ex.run();
        if (closed !== false) dlg.close('extra');
      } catch (err) {
        toast(err.message, 'err');
      }
    });
    actions.prepend(b);
  }
  const handler = async (e) => {
    if (dlg.returnValue !== 'ok') return;
    e.preventDefault();
    const form = $('#modalForm');
    if (!form.reportValidity()) return;
    try {
      await onSubmit(form);
      dlg.close('saved');
    } catch (err) {
      toast(err.message, 'err');
    }
  };
  dlg.addEventListener('close', handler, { once: true });
  dlg.showModal();
  onOpen?.(dlg);
}

boot();
