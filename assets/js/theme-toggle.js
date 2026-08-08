// 主题切换: dark/light + localStorage 持久化
// 通过 body 顶部 inline script 提前设置 html class 防闪烁 (FOUC)

(function () {
  const STORAGE_KEY = "gallery-theme";

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* ignore */
    }
  }

  function getDefaultTheme() {
    return document.documentElement.dataset.defaultTheme || "dark";
  }

  // 计算应显示的主题: 存储值 > 系统偏好 > 页面默认
  function resolveTheme() {
    const stored = getStoredTheme();
    if (stored === "dark" || stored === "light") return stored;
    return getDefaultTheme();
  }

  function applyTheme(theme, updateIcon) {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    if (updateIcon !== false) updateToggleIcon(theme);
  }

  function currentTheme() {
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    setStoredTheme(next);
    applyTheme(next);
  }

  function updateToggleIcon(theme) {
    const sun = document.getElementById("theme-icon-sun");
    const moon = document.getElementById("theme-icon-moon");
    if (!sun || !moon) return;
    const dark = theme === "dark";
    // 当前为 dark 时显示 sun (点击切到 light), 反之显示 moon
    sun.classList.toggle("hidden", !dark);
    moon.classList.toggle("hidden", dark);
  }

  // 初始化按钮
  function initToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", toggleTheme);
    updateToggleIcon(currentTheme());
  }

  // 暴露给全局 (供 menu/inline 调用)
  window.galleryTheme = {
    applyTheme,
    toggleTheme,
    currentTheme,
    resolveTheme,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToggle);
  } else {
    initToggle();
  }
})();
