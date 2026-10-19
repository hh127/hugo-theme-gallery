/**
 * yaml.mjs — 只覆盖本站 front matter 用到的 YAML 子集。
 *
 * 设计取舍：
 *   - 解析（parseYaml）用于「读」，把 front matter 变成 JS 对象给界面用。
 *   - 写回不走「整体重新序列化」，而是行级/块级外科手术（setScalar / setListBlock），
 *     这样文件里未管理的键、缩进风格、注释都不会被顺手毁掉。
 *   - 列表块（images: / resources:）会整体重建，但块内原有的注释行会被保留到块尾。
 */

const BOM = /^\uFEFF/;

export function splitFrontMatter(text) {
  const t = String(text ?? '').replace(BOM, '');
  const eol = t.includes('\r\n') ? '\r\n' : '\n';
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(t);
  if (!m) return { fm: null, body: t, sep: '', eol, hasFM: false };
  const rest = t.slice(m[0].length);
  // 记录 front matter 与正文之间的空行，写回时原样还原 → 「打开再保存」不产生无意义 diff
  const sep = /^\r?\n/.test(rest) ? '\n' : '';
  return { fm: m[1], body: rest.replace(/^\r?\n/, ''), sep, eol, hasFM: true };
}

/** 把文本统一成本文件原有的换行风格（CRLF 仓库里不会写出混排文件） */
export function normalizeEol(text, eol = '\n') {
  const lf = String(text ?? '').replace(/\r\n/g, '\n');
  return eol === '\r\n' ? lf.replace(/\n/g, '\r\n') : lf;
}

export function joinFrontMatter(fm, body, sep = '\n', eol = '\n') {
  if (fm === null || fm === undefined) return String(body ?? '');
  const head = `---\n${String(fm).replace(/\s+$/, '')}\n---\n`;
  const b = String(body ?? '');
  return normalizeEol(b ? head + sep + b : head, eol);
}

/* ------------------------------------------------------------------ 解析 */

function indentOf(line) {
  const m = /^[ \t]*/.exec(line);
  return m[0].replace(/\t/g, '  ').length;
}

function isBlank(line) {
  return line.trim() === '';
}

function isComment(line) {
  return /^\s*#/.test(line);
}

function stripComment(s) {
  let inS = false;
  let inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '#' && !inS && !inD && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
}

export function parseScalar(raw) {
  let s = String(raw ?? '').trim();
  if (s === '') return null;
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s);
    } catch {
      const end = s.lastIndexOf('"');
      return end > 0 ? s.slice(1, end) : s.slice(1);
    }
  }
  if (s.startsWith("'")) {
    const end = s.lastIndexOf("'");
    return (end > 0 ? s.slice(1, end) : s.slice(1)).replace(/''/g, "'");
  }
  s = stripComment(s).trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return Number.parseFloat(s);
  return s;
}

/*
 * 块映射的 key 后面必须是「空格 + 值」或行尾（YAML 规定 `key:value` 不是映射而是标量）。
 * 之前的 /^([^\s:#][^:#]*?)\s*:\s*([\s\S]*)$/ 会把 `- http://x/y.jpg` 这类 URL 误判成
 * 映射 { http: "//x/y.jpg" }，导致远程图片链接解析成对象。
 */
const KEY_RE = /^([^\s:#][^:#]*?)[ \t]*:(?:[ \t]+([\s\S]*))?$/;

/**
 * 解析本站 front matter 子集。
 * 支持：顶层映射、嵌套映射（缩进）、列表（标量项 / 映射项）、引号字符串、布尔与数字、整行注释。
 * 流式写法（[a, b] / {a: b}）原样保留为字符串，不解析。
 */
export function parseYaml(text) {
  const lines = String(text ?? '').split(/\r?\n/);

  function skipJunk(i) {
    while (i < lines.length && (isBlank(lines[i]) || isComment(lines[i]))) i++;
    return i;
  }

  function parseNode(i, indent) {
    const j = skipJunk(i);
    if (j >= lines.length) return [null, j];
    if (indentOf(lines[j]) < indent) return [null, j];
    const t = lines[j].trim();
    if (t === '-' || t.startsWith('- ')) return parseList(j, indentOf(lines[j]));
    return parseMap(j, indentOf(lines[j]));
  }

  function parseMap(i, indent) {
    const obj = {};
    while (i < lines.length) {
      if (isBlank(lines[i]) || isComment(lines[i])) {
        i++;
        continue;
      }
      const ind = indentOf(lines[i]);
      if (ind < indent) break;
      if (ind > indent) {
        i++; // 缩进异常，跳过而不是抛错
        continue;
      }
      const m = KEY_RE.exec(lines[i].trim());
      if (!m) {
        i++;
        continue;
      }
      const key = m[1].trim();
      const rest = m[2] ?? '';
      if (rest.trim() !== '') {
        obj[key] = parseScalar(rest);
        i++;
        continue;
      }
      const next = skipJunk(i + 1);
      if (next < lines.length && indentOf(lines[next]) > indent) {
        const [v, ni] = parseNode(next, indentOf(lines[next]));
        obj[key] = v;
        i = ni;
      } else {
        obj[key] = null;
        i = next > i ? i + 1 : i + 1;
      }
    }
    return [obj, i];
  }

  function parseList(i, indent) {
    const arr = [];
    while (i < lines.length) {
      if (isBlank(lines[i]) || isComment(lines[i])) {
        i++;
        continue;
      }
      const ind = indentOf(lines[i]);
      if (ind < indent) break;
      const line = lines[i];
      const t = line.trim();
      if (ind !== indent || !(t === '-' || t.startsWith('- '))) break;
      const restStart = line.indexOf('-') + 1;
      const contentCol = restStart + (/^\s/.test(line.slice(restStart)) ? 1 : 0);
      const rest = line.slice(contentCol);
      if (rest.trim() === '') {
        const next = skipJunk(i + 1);
        if (next < lines.length && indentOf(lines[next]) > indent) {
          const [v, ni] = parseNode(next, indentOf(lines[next]));
          arr.push(v);
          i = ni;
        } else {
          arr.push(null);
          i++;
        }
        continue;
      }
      const m = KEY_RE.exec(rest.trim());
      if (!m) {
        arr.push(parseScalar(rest));
        i++;
        continue;
      }
      // 映射项：第一个键在 dash 行上，其余键按列对齐
      const item = {};
      const key = m[1].trim();
      const v = m[2] ?? '';
      if (v.trim() !== '') {
        item[key] = parseScalar(v);
        i++;
      } else {
        const next = skipJunk(i + 1);
        if (next < lines.length && indentOf(lines[next]) > contentCol - 1) {
          const [sub, ni] = parseNode(next, indentOf(lines[next]));
          item[key] = sub;
          i = ni;
        } else {
          item[key] = null;
          i++;
        }
      }
      // 继续读同属这一项的后续键（列 > indent）
      while (i < lines.length) {
        if (isBlank(lines[i]) || isComment(lines[i])) {
          const k = skipJunk(i);
          if (k < lines.length && indentOf(lines[k]) > indent && !/^-(\s|$)/.test(lines[k].trim())) {
            i = k;
            continue;
          }
          i = k;
          break;
        }
        const ind2 = indentOf(lines[i]);
        if (ind2 <= indent || /^-(\s|$)/.test(lines[i].trim())) break;
        const m2 = KEY_RE.exec(lines[i].trim());
        if (!m2) {
          i++;
          continue;
        }
        const k2 = m2[1].trim();
        const r2 = m2[2] ?? '';
        if (r2.trim() !== '') {
          item[k2] = parseScalar(r2);
          i++;
        } else {
          const next = skipJunk(i + 1);
          if (next < lines.length && indentOf(lines[next]) > ind2) {
            const [sub, ni] = parseNode(next, indentOf(lines[next]));
            item[k2] = sub;
            i = ni;
          } else {
            item[k2] = null;
            i++;
          }
        }
      }
      arr.push(item);
    }
    return [arr, i];
  }

  const [value] = parseNode(0, 0);
  return value && typeof value === 'object' ? value : {};
}

/* -------------------------------------------------------------- 序列化 */

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FIRST_UNSAFE = /^[,\[\]{}#&*!|>'"%@`]/;
const FIRST_CTX = /^[-?:](\s|$)/;

export function scalarOut(v) {
  if (v === null || v === undefined) return '""';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '') return '""';
  const needQuote =
    /^\s|\s$/.test(s) || // 首尾空白
    /[\x00-\x1f\x7f]/.test(s) || // 控制字符/换行
    FIRST_UNSAFE.test(s) || // 危险首字符
    FIRST_CTX.test(s) || // "- x"、"? x"、": x"
    /:\s/.test(s) || // 冒号+空格
    /\s#/.test(s) || // 空格+井号
    /:$/.test(s) || // 以冒号结尾
    /^(true|false|null|yes|no|on|off|~)$/i.test(s) || // 会被解析成布尔/空
    /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s); // 会被解析成数字
  return needQuote ? JSON.stringify(s) : s;
}

const unquote = (s) => String(s).replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');

export function stringifyYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  const out = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        const keys = Object.keys(item);
        if (keys.length === 0) {
          out.push(`${pad}- {}`);
          continue;
        }
        keys.forEach((k, idx) => {
          const v = item[k];
          const prefix = idx === 0 ? `${pad}- ` : `${pad}  `;
          if (v !== null && typeof v === 'object') {
            out.push(`${prefix}${k}:`);
            out.push(...stringifyYaml(v, indent + 4));
          } else {
            out.push(`${prefix}${k}: ${scalarOut(v)}`);
          }
        });
      } else if (Array.isArray(item)) {
        out.push(`${pad}-`);
        out.push(...stringifyYaml(item, indent + 2));
      } else {
        out.push(`${pad}- ${scalarOut(item)}`);
      }
    }
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (v !== null && typeof v === 'object') {
        out.push(`${pad}${k}:`);
        out.push(...stringifyYaml(v, indent + 2));
      } else {
        out.push(`${pad}${k}: ${scalarOut(v)}`);
      }
    }
    return out;
  }
  out.push(`${pad}${scalarOut(value)}`);
  return out;
}

/* --------------------------------------------------------- 行/块级写回 */

function blockRange(lines, idx) {
  let end = idx + 1;
  const comments = [];
  while (end < lines.length) {
    const l = lines[end];
    if (isBlank(l)) {
      end++;
      continue;
    }
    if (/^[ \t]/.test(l)) {
      if (isComment(l)) comments.push('  ' + l.trim());
      end++;
      continue;
    }
    break;
  }
  return { end, comments };
}

/** 设置/删除顶层标量键（保持其它内容原样；已存在则替换其整块，不存在则追加到末尾）。 */
export function setScalar(fmText, key, value, { remove = false } = {}) {
  const lines = String(fmText ?? '').split('\n');
  const re = new RegExp(`^${escRe(key)}[ \\t]*:`);
  const idx = lines.findIndex((l) => re.test(l));
  const drop = remove || value === undefined;
  let newLines = drop ? [] : [`${key}: ${scalarOut(value)}`];
  if (idx >= 0 && !drop) {
    // 值没变就保留原来的写法（引号风格、大小写……），避免「打开再保存」产生无意义 diff
    const oldLine = lines[idx];
    const oldRaw = oldLine.slice(oldLine.indexOf(':') + 1).trim();
    if (unquote(oldRaw) === unquote(scalarOut(value))) newLines = [oldLine];
  }
  if (idx >= 0) {
    const { end } = blockRange(lines, idx);
    lines.splice(idx, end - idx, ...newLines);
  } else if (!drop) {
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
    lines.push(...newLines, '');
  }
  return lines.join('\n');
}

/** 整体替换列表块（如 images: / resources:）；空数组表示删除该键；块内注释保留到块尾。 */
export function setListBlock(fmText, key, value) {
  const lines = String(fmText ?? '').split('\n');
  const re = new RegExp(`^${escRe(key)}[ \\t]*:`);
  const idx = lines.findIndex((l) => re.test(l));
  const arr = Array.isArray(value) ? value : [];
  let block;
  if (arr.length === 0) {
    block = [];
  } else {
    block = stringifyYaml({ [key]: arr }, 0);
    if (idx >= 0) {
      const { comments } = blockRange(lines, idx);
      block.push(...comments);
    }
  }
  if (idx >= 0) {
    const { end } = blockRange(lines, idx);
    lines.splice(idx, end - idx, ...block);
  } else if (block.length) {
    while (lines.length && isBlank(lines[lines.length - 1])) lines.pop();
    lines.push(...block, '');
  }
  return lines.join('\n');
}

/** 读取顶层标量（用于「只改一个字段」的快速路径）。 */
export function getScalar(fmText, key) {
  const re = new RegExp(`^${escRe(key)}[ \\t]*:\\s*(.*)$`, 'm');
  const m = re.exec(String(fmText ?? ''));
  return m ? parseScalar(m[1]) : undefined;
}
