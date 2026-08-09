import PhotoSwipeLightbox from "./photoswipe/photoswipe-lightbox.esm.js";
import PhotoSwipe from "./photoswipe/photoswipe.esm.js";
import * as params from "@params";
import { getFavorites, toggleFavorite, isFavorite, render } from "./favorites.js";

const gallery = document.getElementById("gallery");

// 收藏存取工具 (挂到 window 供收藏页复用) — 无论是否受保护都暴露
window.galleryFavorites = {
  get: getFavorites,
  toggle: toggleFavorite,
  isFavorite,
  render,
};

export function initLightbox() {
  if (!gallery) return;
  if (window.__lightboxInited) return;
  // 受保护页面且尚未解密时延迟初始化（密码解锁注入图片后由 password-protect.js 重新调用）
  if (document.getElementById("lock-screen") && !gallery.querySelector(".gallery-item")) return;
  window.__lightboxInited = true;

  // 面板可见状态(供 getViewportSizeFn 读取: 面板打开时视口让出 380px)
  let panelVisible = false;

  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children: ".gallery-item",
    showHideAnimationType: "zoom",
    bgOpacity: 1,
    loop: true, // 循环浏览: 首尾相接, 两个箭头始终可用
    pswpModule: PhotoSwipe,
    imageClickAction: "close",
    closeTitle: params.closeTitle,
    zoomTitle: params.zoomTitle,
    arrowPrevTitle: params.arrowPrevTitle,
    arrowNextTitle: params.arrowNextTitle,
    errorMsg: params.errorMsg,
    // 官方扩展点: 自定义视口尺寸(面板打开时减去面板宽度)
    // 配合 updateSize(force) 走完整布局流程, 避免手动改 viewportSize 导致 slide 错位
    getViewportSizeFn: () => ({
      x: document.documentElement.clientWidth - (panelVisible ? 380 : 0),
      y: document.documentElement.clientHeight,
    }),
  });

  // 下载按钮
  if (params.enableDownload) {
    lightbox.on("uiRegister", () => {
      lightbox.pswp.ui.registerElement({
        name: "download-button",
        order: 8,
        isButton: true,
        tagName: "a",
        html: {
          isCustomSVG: true,
          inner: '<path d="M20.5 14.3 17.1 18V10h-2.2v7.9l-3.4-3.6L10 16l6 6.1 6-6.1ZM23 23H9v2h14Z" id="pswp__icn-download"/>',
          outlineID: "pswp__icn-download",
        },
        onInit: (el, pswp) => {
          el.setAttribute("download", "");
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener");
          el.setAttribute("title", params.downloadTitle || "Download");
          pswp.on("change", () => {
            el.href = pswp.currSlide.data.element.href;
          });
        },
      });
    });
  }

  // 收藏按钮
  lightbox.on("uiRegister", () => {
    lightbox.pswp.ui.registerElement({
      name: "favorite-button",
      order: 9,
      isButton: true,
      tagName: "button",
      html: {
        isCustomSVG: true,
        inner: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" id="pswp__icn-favorite"/>',
        outlineID: "pswp__icn-favorite",
      },
      onInit: (el, pswp) => {
        el.setAttribute("title", "收藏 (L)");
        el.classList.add("pswp__button--favorite");

        // 从当前图片的 element 读取收藏数据
        function currentFavoriteData() {
          const el2 = pswp.currSlide?.data?.element;
          if (!el2) return null;
          return {
            src: el2.href,
            thumb: el2.querySelector("img")?.dataset?.src || "",
            title: el2.dataset.title || "",
            description: el2.dataset.description || "",
            camera: el2.dataset.camera || "",
            date: el2.dataset.date || "",
          };
        }

        function updateState() {
          const data = currentFavoriteData();
          const favs = getFavorites();
          const isFav = data ? favs.some((f) => f.src === data.src) : false;
          el.classList.toggle("is-favorite", isFav);
        }

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const data = currentFavoriteData();
          if (!data) return;
          toggleFavorite(data);
          updateState();
        });

        pswp.on("change", updateState);
        pswp.on("close", () => {
          el.classList.remove("is-favorite");
        });
      },
    });
  });

  // ============================================
  // 右侧信息面板
  // ============================================

  let infoPanel = null;

  // 创建信息面板
  function createInfoPanel() {
    if (infoPanel) return infoPanel;

    infoPanel = document.createElement("div");
    infoPanel.className = "pswp__info-panel";
    infoPanel.innerHTML = `
      <div class="info-index" aria-hidden="true">
        <span class="info-index-current">01</span>
        <span class="info-index-sep">/</span>
        <span class="info-index-total">01</span>
      </div>
      <div class="info-story">
        <div class="info-title-wrapper">
          <h3 class="info-title"></h3>
        </div>
        <div class="info-description-wrapper">
          <p class="info-description"></p>
        </div>
      </div>
      <div class="info-panel-meta">
        <div class="meta-item info-camera-section">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l1.5 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5L9 3z"/><circle cx="12" cy="13" r="4"/></svg>
          <span class="meta-label">CAMERA</span>
          <span class="meta-value info-camera"></span>
        </div>
        <div class="meta-item info-lens-section">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>
          <span class="meta-label">LENS</span>
          <span class="meta-value info-lens"></span>
        </div>
        <div class="meta-item info-settings-section">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/></svg>
          <span class="meta-label">SETTINGS</span>
          <span class="meta-value info-settings"></span>
        </div>
        <div class="meta-item info-date-section">
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
          <span class="meta-label">DATE</span>
          <span class="meta-value info-date"></span>
        </div>
      </div>
    `;
    document.body.appendChild(infoPanel);

    // 点击面板外关闭
    infoPanel.addEventListener("click", (e) => {
      if (e.target === infoPanel) {
        toggleInfoPanel();
      }
    });

    return infoPanel;
  }

  // 更新面板内容
  function updateInfoPanel(pswp) {
    const el = pswp.currSlide?.data?.element;
    if (!el || !infoPanel) {
      return;
    }

    // 更新照片索引 (当前 / 总数)
    const indexCurrent = infoPanel.querySelector(".info-index-current");
    const indexTotal = infoPanel.querySelector(".info-index-total");
    if (indexCurrent) {
      indexCurrent.textContent = String(pswp.currIndex + 1).padStart(2, "0");
    }
    if (indexTotal) {
      indexTotal.textContent = String(pswp.getNumItems()).padStart(2, "0");
    }

    const title = el.dataset.title || el.getAttribute("title") || "";
    const description = el.dataset.description || "";
    const camera = el.dataset.camera || "";
    const lens = el.dataset.lens || "";
    const iso = el.dataset.iso || "";
    const aperture = el.dataset.aperture || "";
    const exposure = el.dataset.exposure || "";
    const focal = el.dataset.focal || "";
    const date = el.dataset.date || "";

    // 更新标题
    const titleElement = infoPanel.querySelector(".info-title");
    if (title) {
      titleElement.textContent = title;
      infoPanel.querySelector(".info-title-wrapper").style.display = "block";
    } else {
      infoPanel.querySelector(".info-title-wrapper").style.display = "none";
    }

    // 更新描述
    const descWrapper = infoPanel.querySelector(".info-description-wrapper");
    const descElement = infoPanel.querySelector(".info-description");
    if (description) {
      descElement.textContent = description;
      descWrapper.style.display = "block";
    } else {
      descWrapper.style.display = "none";
    }

    // 检查是否有参数信息
    let hasParams = false;

    // 更新镜头信息
    const lensSection = infoPanel.querySelector(".info-lens-section");
    const lensValue = infoPanel.querySelector(".info-lens");
    if (lens && lens !== "-- mm f/1") {
      lensValue.textContent = lens;
      lensSection.style.display = "flex";
      hasParams = true;
    } else {
      lensSection.style.display = "none";
    }

    // 更新参数信息
    const settingsSection = infoPanel.querySelector(".info-settings-section");
    const settingsValue = infoPanel.querySelector(".info-settings");
    let settings = [];
    if (aperture) settings.push(aperture);
    if (exposure) settings.push(exposure);
    if (iso) settings.push(iso);
    if (focal && focal !== "0 mm") settings.push(focal);

    if (settings.length > 0) {
      settingsValue.textContent = settings.join("  ·  ");
      settingsSection.style.display = "flex";
      hasParams = true;
    } else {
      settingsSection.style.display = "none";
    }

    // 更新日期
    const dateSection = infoPanel.querySelector(".info-date-section");
    const dateValue = infoPanel.querySelector(".info-date");
    if (date && date !== "1970:01:01 08:00:00") {
      dateValue.textContent = date;
      dateSection.style.display = "flex";
      hasParams = true;
    } else {
      dateSection.style.display = "none";
    }

    // 相机部分
    const cameraSection = infoPanel.querySelector(".info-camera-section");
    const cameraValue = infoPanel.querySelector(".info-camera");
    if (camera) {
      cameraValue.textContent = camera;
      cameraSection.style.display = "flex";
      hasParams = true;
    } else {
      cameraSection.style.display = "none";
    }

    // 根据是否有参数来显示/隐藏整个参数区域
    const metaPanel = infoPanel.querySelector(".info-panel-meta");
    if (hasParams) {
      metaPanel.style.display = "flex";
    } else {
      metaPanel.style.display = "none";
    }

    // 根据是否有故事文本来调整面板位置
    const storyPanel = infoPanel.querySelector(".info-story");
    if (title || description) {
      storyPanel.style.display = "flex";
    } else {
      storyPanel.style.display = "none";
    }
  }

  // 切换面板显示
  function toggleInfoPanel() {
    createInfoPanel();
    panelVisible = !panelVisible;
    infoPanel.classList.toggle("visible", panelVisible);

    // 给 PhotoSwipe 容器添加 class 控制布局
    if (lightbox.pswp && lightbox.pswp.element) {
      lightbox.pswp.element.classList.toggle("pswp--panel-open", panelVisible);
    }

    // 官方方式: 强制重算视口(getViewportSizeFn 返回 全宽-380 或 全宽),
    // updateSize 内部会完整重排 mainScroll 与所有 slide, 修复切换照片时错位
    if (lightbox.pswp) {
      const pswp = lightbox.pswp;
      pswp.updateSize(true);
      // 兜底: 确保所有已挂载 slide 的图片尺寸一并重算
      if (pswp.mainScroll && pswp.mainScroll.itemHolders) {
        pswp.mainScroll.itemHolders.forEach((holder) => {
          if (holder && holder.slide) holder.slide.resize();
        });
      }
      if (pswp.currSlide) pswp.currSlide.resize();
    }

    if (panelVisible && lightbox.pswp) {
      updateInfoPanel(lightbox.pswp);
    }
  }

  // 注册信息按钮
  lightbox.on("uiRegister", () => {
    lightbox.pswp.ui.registerElement({
      name: "info-button",
      order: 9,
      isButton: true,
      tagName: "button",
      html: {
        isCustomSVG: true,
        inner: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" id="pswp__icn-info"/>',
        outlineID: "pswp__icn-info",
      },
      onInit: (el, pswp) => {
        el.setAttribute("title", "照片信息 (I)");
        el.classList.add("pswp__button--info");

        el.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleInfoPanel();
        });

        pswp.on("change", () => {
          if (panelVisible) {
            updateInfoPanel(pswp);
          }
        });

        pswp.on("close", () => {
          panelVisible = false;
          if (infoPanel) {
            infoPanel.classList.remove("visible");
          }
        });
      },
    });
  });

  // URL hash 支持
  lightbox.on("change", () => {
    const target = lightbox.pswp.currSlide?.data?.element?.dataset["pswpTarget"];
    history.replaceState("", document.title, "#" + target);
  });

  lightbox.on("close", () => {
    history.replaceState("", document.title, window.location.pathname);
  });

  lightbox.init();

  // 自定义键盘快捷键
  // 注意: ArrowLeft/ArrowRight/Escape 由 PhotoSwipe 内置键盘处理,
  // 这里若重复监听会导致按一次方向键跳两张照片(双重触发)
  document.addEventListener("keydown", (e) => {
    if (!lightbox.pswp) return;

    switch (e.key) {
      case "f":
      case "F":
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
        e.preventDefault();
        break;
      case "i":
      case "I":
        toggleInfoPanel();
        e.preventDefault();
        break;
      case "l":
      case "L":
        // 收藏当前照片
        {
          const el2 = lightbox.pswp.currSlide?.data?.element;
          if (el2) {
            const data = {
              src: el2.href,
              thumb: el2.querySelector("img")?.dataset?.src || "",
              title: el2.dataset.title || "",
              description: el2.dataset.description || "",
              camera: el2.dataset.camera || "",
              date: el2.dataset.date || "",
            };
            toggleFavorite(data);
            // 刷新按钮状态
            const favBtn = lightbox.pswp.element?.querySelector(".pswp__button--favorite");
            if (favBtn) {
              favBtn.classList.toggle("is-favorite", isFavorite(data.src));
            }
          }
        }
        e.preventDefault();
        break;
    }
  });

  // URL hash 直接打开
  if (window.location.hash.substring(1).length > 1) {
    const target = window.location.hash.substring(1);
    const items = gallery.querySelectorAll("a");
    for (let i = 0; i < items.length; i++) {
      if (items[i].dataset["pswpTarget"] === target) {
        lightbox.loadAndOpen(i, { gallery });
        break;
      }
    }
  }
}

window.lightboxApi = { initLightbox };

initLightbox();
