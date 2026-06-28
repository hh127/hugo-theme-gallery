import PhotoSwipeLightbox from "./photoswipe/photoswipe-lightbox.esm.js";
import PhotoSwipe from "./photoswipe/photoswipe.esm.js";
import PhotoSwipeDynamicCaption from "./photoswipe/photoswipe-dynamic-caption-plugin.esm.min.js";
import * as params from "@params";

const gallery = document.getElementById("gallery");

if (gallery) {
  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children: ".gallery-item",
    showHideAnimationType: "zoom",
    bgOpacity: 1,
    pswpModule: PhotoSwipe,
    imageClickAction: "close",
    closeTitle: params.closeTitle,
    zoomTitle: params.zoomTitle,
    arrowPrevTitle: params.arrowPrevTitle,
    arrowNextTitle: params.arrowNextTitle,
    errorMsg: params.errorMsg,
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

  // ============================================
  // 右侧信息面板
  // ============================================
  
  let infoPanel = null;
  let panelVisible = false;
  
  // 创建信息面板
  function createInfoPanel() {
    if (infoPanel) return infoPanel;
    
    infoPanel = document.createElement("div");
    infoPanel.className = "pswp__info-panel";
    infoPanel.innerHTML = `
      <div class="info-panel-content">
        <div class="info-panel-header">
          <h3 class="info-title"></h3>
          <p class="info-description"></p>
          <p class="info-subtitle"></p>
        </div>
        <div class="info-panel-divider"></div>
        <div class="info-panel-body">
          <div class="info-section info-camera-section">
            <div class="info-icon">📷</div>
            <div class="info-text">
              <span class="info-label">相机</span>
              <span class="info-value info-camera"></span>
            </div>
          </div>
          <div class="info-section info-lens-section">
            <div class="info-icon">🔭</div>
            <div class="info-text">
              <span class="info-label">镜头</span>
              <span class="info-value info-lens"></span>
            </div>
          </div>
          <div class="info-section info-settings-section">
            <div class="info-icon">⚙️</div>
            <div class="info-text">
              <span class="info-label">参数</span>
              <span class="info-value info-settings"></span>
            </div>
          </div>
          <div class="info-section info-date-section">
            <div class="info-icon">📅</div>
            <div class="info-text">
              <span class="info-label">拍摄时间</span>
              <span class="info-value info-date"></span>
            </div>
          </div>
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
    if (!el || !infoPanel) return;
    
    const title = el.getAttribute("title") || "未命名";
    const description = el.dataset.description || "";
    const camera = el.dataset.camera || "";
    const lens = el.dataset.lens || "";
    const iso = el.dataset.iso || "";
    const aperture = el.dataset.aperture || "";
    const exposure = el.dataset.exposure || "";
    const focal = el.dataset.focal || "";
    const date = el.dataset.date || "";
    
    // 更新标题
    infoPanel.querySelector(".info-title").textContent = title;
    
    // 更新描述
    const descElement = infoPanel.querySelector(".info-description");
    if (description) {
      descElement.textContent = description;
      descElement.style.display = "block";
    } else {
      descElement.style.display = "none";
    }
    
    // 更新副标题（相机型号）
    const subtitle = infoPanel.querySelector(".info-subtitle");
    if (camera) {
      subtitle.textContent = camera;
      subtitle.style.display = "block";
    } else {
      subtitle.style.display = "none";
    }
    
    // 更新镜头信息
    const lensSection = infoPanel.querySelector(".info-lens-section");
    const lensValue = infoPanel.querySelector(".info-lens");
    if (lens && lens !== "-- mm f/1") {
      lensValue.textContent = lens;
      lensSection.style.display = "flex";
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
      settingsValue.textContent = settings.join(" · ");
      settingsSection.style.display = "flex";
    } else {
      settingsSection.style.display = "none";
    }
    
    // 更新日期
    const dateSection = infoPanel.querySelector(".info-date-section");
    const dateValue = infoPanel.querySelector(".info-date");
    if (date && date !== "1970:01:01 08:00:00") {
      dateValue.textContent = date;
      dateSection.style.display = "flex";
    } else {
      dateSection.style.display = "none";
    }
    
    // 相机部分
    const cameraSection = infoPanel.querySelector(".info-camera-section");
    const cameraValue = infoPanel.querySelector(".info-camera");
    if (camera) {
      cameraValue.textContent = camera;
      cameraSection.style.display = "flex";
    } else {
      cameraSection.style.display = "none";
    }
  }
  
  // 切换面板显示
  function toggleInfoPanel() {
    createInfoPanel();
    panelVisible = !panelVisible;
    infoPanel.classList.toggle("visible", panelVisible);
    
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

  // 动态标题
  new PhotoSwipeDynamicCaption(lightbox, {
    mobileLayoutBreakpoint: 700,
    type: "auto",
    mobileCaptionOverlapRatio: 1,
  });

  lightbox.init();

  // 键盘导航
  document.addEventListener("keydown", (e) => {
    if (!lightbox.pswp) return;
    
    switch (e.key) {
      case "ArrowLeft":
        lightbox.pswp.prev();
        e.preventDefault();
        break;
      case "ArrowRight":
        lightbox.pswp.next();
        e.preventDefault();
        break;
      case "Escape":
        lightbox.pswp.close();
        e.preventDefault();
        break;
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
