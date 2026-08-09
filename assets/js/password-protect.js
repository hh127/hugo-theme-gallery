// 密码保护功能 - 加密版
// 安全模型: 相册内容在构建时用 AES-256-GCM 加密，密码经 PBKDF2 派生密钥解密。
// 未输入正确密码，页面源码中不包含任何图片 URL / EXIF 等明文信息。

const PBKDF2_ITERATIONS = 150000;
const KEY_PREFIX = "gallery_key_";

// ---------- 工具函数 ----------

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

// 密码 + 盐 → AES-256-GCM 密钥（可导出，用于会话内复用）
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
    true, // extractable: 允许导出 raw key 存 sessionStorage
    ["decrypt"],
  );
}

async function importSessionKey(raw) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}

// 用密钥解密相册内容，返回明文 HTML
async function decryptWithKey(key, iv, ciphertext) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}

// ---------- 主流程 ----------

function initPasswordProtect() {
  const lockScreen = document.getElementById("lock-screen");
  const galleryWrapper = document.getElementById("gallery-wrapper");
  const gallery = document.getElementById("gallery");
  const passwordInput = document.getElementById("password-input");
  const submitBtn = document.getElementById("submit-password");
  const errorMsg = document.getElementById("error-msg");

  if (!lockScreen || !galleryWrapper || !gallery) return;

  // 加密数据挂载在 gallery 容器内的 script 标签中（由构建后脚本注入）
  const encScript = gallery.querySelector('script[type="application/x-gallery-encrypted"]');
  const storedHash = lockScreen.dataset.passwordHash;
  const pageId = window.location.pathname;

  // 未加密（无脚本标签）且无哈希 → 没有真正受保护，直接放行
  const isEncrypted = !!encScript;

  function unlockAndShow(plainHtml) {
    // 移除加密数据容器
    if (encScript) encScript.remove();
    // 注入明文相册内容
    gallery.innerHTML = plainHtml;
    galleryWrapper.style.display = "";

    // 成功动画
    const container = lockScreen.querySelector(".lock-container");
    if (container) container.classList.add("success");

    setTimeout(() => {
      lockScreen.classList.add("unlocking");
      setTimeout(() => {
        lockScreen.style.display = "none";
        errorMsg.textContent = "";
        // 重新初始化布局与灯箱（内容为动态注入）
        if (window.galleryApi) window.galleryApi.initGallery();
        if (window.lightboxApi) window.lightboxApi.initLightbox();
        triggerGalleryResize();
      }, 500);
    }, 400);
  }

  // 解析加密负载: base64( iv(12) || ciphertext || authTag(16) )
  // 注意: WebCrypto AES-GCM 要求 tag 附在密文末尾（GCM 标准格式）
  function parseEncryptedPayload() {
    const raw = base64ToBytes(encScript.textContent.trim());
    return {
      salt: base64ToBytes(encScript.dataset.salt),
      iv: raw.slice(0, 12),
      data: raw.slice(12), // ciphertext + authTag(16)
    };
  }

  async function unlockWithKey(key) {
    const { iv, data } = parseEncryptedPayload();
    const plainHtml = await decryptWithKey(key, iv, data);
    unlockAndShow(plainHtml);
  }

  // 会话内已解锁（sessionStorage 存派生密钥）：直接解密显示
  async function restoreFromSession() {
    if (!isEncrypted) {
      // 无加密内容：保持旧版行为，仅作门禁
      if (sessionStorage.getItem(KEY_PREFIX + pageId)) {
        lockScreen.style.display = "none";
        galleryWrapper.style.display = "";
        triggerGalleryResize();
        return true;
      }
      return false;
    }
    const savedKeyB64 = sessionStorage.getItem(KEY_PREFIX + pageId);
    if (!savedKeyB64) return false;
    try {
      const key = await importSessionKey(base64ToBytes(savedKeyB64));
      await unlockWithKey(key);
      return true;
    } catch (e) {
      sessionStorage.removeItem(KEY_PREFIX + pageId);
      return false;
    }
  }

  // 输入密码验证 + 解密
  async function verifyPassword() {
    const password = passwordInput.value;
    if (!password) {
      showError("请输入密码");
      return;
    }

    if (isEncrypted) {
      try {
        const { salt } = parseEncryptedPayload();
        const key = await deriveKey(password, salt);
        // AES-GCM 解密失败（认证失败）即密码错误
        await unlockWithKey(key);
        // 会话内复用：保存派生密钥（非密码明文）
        const raw = await crypto.subtle.exportKey("raw", key);
        sessionStorage.setItem(KEY_PREFIX + pageId, bytesToBase64(new Uint8Array(raw)));
      } catch (e) {
        fail();
      }
    } else if (storedHash) {
      // 旧版兼容：哈希门禁（内容未加密，仅隐藏）
      const hash = await sha256(password);
      if (hash === storedHash) {
        sessionStorage.setItem(KEY_PREFIX + pageId, "true");
        lockScreen.style.display = "none";
        galleryWrapper.style.display = "";
        triggerGalleryResize();
      } else {
        fail();
      }
    } else {
      // 无密码无加密：直接放行
      galleryWrapper.style.display = "";
      lockScreen.style.display = "none";
    }
  }

  function fail() {
    showError("密码错误，请重试");
    passwordInput.value = "";
    passwordInput.focus();
    const container = lockScreen.querySelector(".lock-container");
    if (container) {
      container.style.animation = "none";
      container.offsetHeight; // 触发重排
      container.style.animation = "shake 0.5s ease";
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.opacity = "1";
    errorMsg.style.transform = "translateY(0)";
  }

  submitBtn.addEventListener("click", verifyPassword);
  passwordInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") verifyPassword();
  });

  // 自动聚焦
  setTimeout(() => {
    passwordInput.focus();
  }, 300);

  // 初始：尝试会话恢复
  restoreFromSession().then((restored) => {
    if (restored) return;
    // 未解锁，隐藏画廊并显示锁屏
    galleryWrapper.style.display = "none";

    // 预加载背景图片
    const bgImage = lockScreen.dataset.bgImage;
    if (bgImage) {
      const bgElement = lockScreen.querySelector(".lock-bg");
      if (bgElement) {
        const img = new Image();
        img.onload = function () {
          bgElement.style.opacity = "1";
        };
        img.src = bgImage;
      }
    }
  });
}

// 触发 gallery 重新计算布局
function triggerGalleryResize() {
  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    if (window.lazySizes && typeof window.lazySizes.check === "function") {
      window.lazySizes.check();
    }
  }, 50);
}

// 确保在 DOM 加载完成后初始化
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPasswordProtect);
} else {
  initPasswordProtect();
}
