// stealth.js — 隐秘相册彩蛋入口
// 触发方式: 连点站点标题(header 中的 logo 链接)5 次 → 弹出密码框
// 密码正确 → 跳转隐秘相册; 密码错误 → 无任何反馈(不暴露隐秘相册的存在)
// 兼容: 手机/平板(触摸点击) + 电脑(鼠标点击)
//
// 说明: 本脚本与主题密码保护(password-protect.js)协作。
// 输入正确密码后, 本地派生 AES 密钥并存入 sessionStorage,
// 跳转相册页后由 password-protect.js 的会话恢复逻辑自动解锁, 无需二次输入。
//
// 隐秘相册路径由 hugo.toml 的 params.gallery.vaultPath 注入(见 head.html),
// 修改相册目录时只需同步配置, 无需改此文件。

import * as params from "@params";

const CONFIG = {
  // 隐秘相册 URL(随机 slug, 不可猜测); 由构建参数注入, 缺省回退硬编码
  albumPath: params.vaultPath || "/vault-" + "3c83d8e7" + "/",
  // 连点触发次数
  clicks: 5,
  // 两次点击最大间隔(ms), 超过则计数重置
  clickInterval: 800,
};

const PBKDF2_ITERATIONS = 150000;
const KEY_PREFIX = "gallery_key_";

// ---------- 工具函数(与 password-protect.js 保持一致) ----------

function bytesToBase64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["decrypt"],
  );
}

async function decryptWithKey(key, iv, ciphertext) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

// ---------- 样式注入(自包含, 不依赖额外 CSS 文件) ----------

function injectStyles() {
  if (document.getElementById("stealth-style")) return;
  const style = document.createElement("style");
  style.id = "stealth-style";
  style.textContent = `
    .stealth-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .stealth-overlay.visible { opacity: 1; }
    .stealth-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.2rem;
      padding: 2rem;
      min-width: min(80vw, 320px);
    }
    .stealth-lock-icon {
      width: 44px;
      height: 44px;
      color: rgba(255, 255, 255, 0.75);
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.3s ease 0.1s, transform 0.3s ease 0.1s;
    }
    .stealth-overlay.visible .stealth-lock-icon {
      opacity: 1;
      transform: translateY(0);
    }
    .stealth-form {
      position: relative;
      width: 100%;
    }
    .stealth-input {
      width: 100%;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-size: 1.05rem;
      text-align: center;
      padding: 0.5rem 0.25rem;
      caret-color: rgba(255, 255, 255, 0.85);
    }
    .stealth-input::placeholder { color: rgba(255, 255, 255, 0.35); }
    .stealth-line {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 1px;
      background: rgba(255, 255, 255, 0.25);
      transition: background 0.25s ease, box-shadow 0.25s ease;
    }
    .stealth-input:focus ~ .stealth-line,
    .stealth-input:focus + .stealth-line {
      background: rgba(255, 255, 255, 0.9);
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    }
    @media (prefers-color-scheme: light) {
      .stealth-overlay.light-theme { background: rgba(255, 255, 255, 0.75); }
      .stealth-overlay.light-theme .stealth-input { color: #111; }
      .stealth-overlay.light-theme .stealth-lock-icon { color: rgba(0, 0, 0, 0.65); }
      .stealth-overlay.light-theme .stealth-line { background: rgba(0, 0, 0, 0.25); }
      .stealth-overlay.light-theme .stealth-input:focus ~ .stealth-line,
      .stealth-overlay.light-theme .stealth-input:focus + .stealth-line {
        background: rgba(0, 0, 0, 0.85);
        box-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
      }
      .stealth-overlay.light-theme .stealth-input::placeholder { color: rgba(0, 0, 0, 0.3); }
    }
  `;
  document.head.appendChild(style);
}

// ---------- 彩蛋触发 ----------

let clickCount = 0;
let lastClickTime = 0;
let navTimer = null;

function samePage(href) {
  try {
    return new URL(href, window.location.href).href === window.location.href;
  } catch (e) {
    return false;
  }
}

function handleLogoClick(e, link) {
  e.preventDefault();
  const now = Date.now();
  if (now - lastClickTime > CONFIG.clickInterval) clickCount = 0;
  lastClickTime = now;
  clickCount += 1;

  if (clickCount >= CONFIG.clicks) {
    clickCount = 0;
    clearTimeout(navTimer);
    openStealthPrompt();
    return;
  }

  // 未满 5 次: 延迟导航; 若继续连点则取消导航, 不打断连点序列
  clearTimeout(navTimer);
  navTimer = setTimeout(() => {
    if (samePage(link.href)) return; // 目标即当前页(首页标题), 无需刷新
    window.location.href = link.href;
  }, CONFIG.clickInterval);
}

// ---------- 密码框 UI ----------

function openStealthPrompt() {
  injectStyles();
  if (document.getElementById("stealth-prompt")) return;

  const isLight = document.documentElement.classList.contains("light");
  const overlay = document.createElement("div");
  overlay.id = "stealth-prompt";
  overlay.className = "stealth-overlay" + (isLight ? " light-theme" : "");
  overlay.innerHTML = `
    <div class="stealth-box" role="dialog" aria-label="请输入密码">
      <svg class="stealth-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        <circle cx="12" cy="16" r="1"></circle>
      </svg>
      <div class="stealth-form">
        <input class="stealth-input" type="password" placeholder="请输入密码" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" />
        <div class="stealth-line"></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector(".stealth-input");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeStealthPrompt(overlay);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitStealthPassword(input);
    } else if (e.key === "Escape") {
      closeStealthPrompt(overlay);
    }
  });

  requestAnimationFrame(() => overlay.classList.add("visible"));
  setTimeout(() => input.focus(), 260);
}

function closeStealthPrompt(overlay) {
  overlay.classList.remove("visible");
  setTimeout(() => overlay.remove(), 250);
}

// ---------- 密码验证 ----------

async function submitStealthPassword(input) {
  const password = input.value;
  if (!password) return;
  input.disabled = true;
  try {
    await verifyAndRedirect(password);
  } finally {
    input.disabled = false;
  }
}

async function verifyAndRedirect(password) {
  // 拉取隐秘相册页面 HTML, 提取加密信息用于本地验证
  let html;
  try {
    const res = await fetch(CONFIG.albumPath, { credentials: "same-origin" });
    if (!res.ok) throw new Error("fetch failed");
    html = await res.text();
  } catch (e) {
    // fetch 不可用(如 file:// 直开): 退化为直接跳转, 由相册页自身验证
    window.location.href = CONFIG.albumPath;
    return;
  }

  // 方式1: 内容加密(生产构建后) — 用密码派生密钥尝试解密, 成功即密码正确
  const encMatch = html.match(
    /<script[^>]*type=["']?application\/x-gallery-encrypted["']?[^>]*data-salt=["']([^"']+)["'][^>]*>([^<]+)<\/script>/,
  );
  if (encMatch) {
    try {
      const salt = base64ToBytes(encMatch[1]);
      const key = await deriveKey(password, salt);
      const payload = base64ToBytes(encMatch[2].trim());
      const iv = payload.slice(0, 12);
      const data = payload.slice(12); // ciphertext + authTag(16)
      await decryptWithKey(key, iv, data);
      // 保存会话密钥 → 相册页自动解锁
      const raw = await crypto.subtle.exportKey("raw", key);
      sessionStorage.setItem(KEY_PREFIX + CONFIG.albumPath, bytesToBase64(new Uint8Array(raw)));
      window.location.href = CONFIG.albumPath;
      return;
    } catch (e) {
      stealthFail();
      return;
    }
  }

  // 方式2: SHA-256 哈希门禁(开发模式 / 未加密内容)
  const hashMatch = html.match(/data-password-hash="([0-9a-f]{64})"/);
  if (hashMatch) {
    const hash = await sha256(password);
    if (hash === hashMatch[1]) {
      sessionStorage.setItem(KEY_PREFIX + CONFIG.albumPath, "true");
      window.location.href = CONFIG.albumPath;
    } else {
      stealthFail();
    }
    return;
  }

  // 方式3: 页面无密码保护, 直接进入
  window.location.href = CONFIG.albumPath;
}

// 密码错误: 无任何反馈(仅清空输入框), 不暴露隐秘相册存在
function stealthFail() {
  const overlay = document.getElementById("stealth-prompt");
  const input = overlay ? overlay.querySelector(".stealth-input") : null;
  if (input) {
    input.value = "";
    input.focus();
  }
}

// ---------- 初始化 ----------

function initStealth() {
  const links = document.querySelectorAll("header a.btn");
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener("click", (e) => handleLogoClick(e, link));
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStealth);
} else {
  initStealth();
}
