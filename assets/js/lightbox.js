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

  // EXIF 信息按钮
  lightbox.on("uiRegister", () => {
    lightbox.pswp.ui.registerElement({
      name: "exif-button",
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
        el.classList.add("pswp__button--exif");
        
        const exifPanel = document.createElement("div");
        exifPanel.className = "pswp__exif-panel";
        exifPanel.innerHTML = `
          <div class="exif-content">
            <div class="exif-title"></div>
            <div class="exif-details"></div>
          </div>
        `;
        document.body.appendChild(exifPanel);
        
        let panelVisible = false;
        
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          panelVisible = !panelVisible;
          exifPanel.classList.toggle("visible", panelVisible);
          if (panelVisible) {
            updateExifPanel(pswp);
          }
        });
        
        pswp.on("change", () => {
          if (panelVisible) {
            updateExifPanel(pswp);
          }
        });
        
        pswp.on("close", () => {
          panelVisible = false;
          exifPanel.classList.remove("visible");
        });
      },
    });
  });

  function updateExifPanel(pswp) {
    const el = pswp.currSlide?.data?.element;
    const panel = document.querySelector(".pswp__exif-panel");
    if (!el || !panel) return;

    const title = el.getAttribute("title") || "";
    const camera = el.dataset.camera || "";
    const lens = el.dataset.lens || "";
    const iso = el.dataset.iso || "";
    const aperture = el.dataset.aperture || "";
    const exposure = el.dataset.exposure || "";
    const focal = el.dataset.focal || "";
    const date = el.dataset.date || "";

    panel.querySelector(".exif-title").textContent = title;
    
    let details = "";
    if (camera) details += `<div class="exif-row"><span class="exif-label">📷</span><span>${camera}</span></div>`;
    if (lens && lens !== "-- mm f/1") details += `<div class="exif-row"><span class="exif-label">🔭</span><span>${lens}</span></div>`;
    if (aperture) details += `<div class="exif-row"><span class="exif-label">⊙</span><span>${aperture}</span></div>`;
    if (exposure) details += `<div class="exif-row"><span class="exif-label">⏱</span><span>${exposure}</span></div>`;
    if (iso) details += `<div class="exif-row"><span class="exif-label">💡</span><span>${iso}</span></div>`;
    if (focal && focal !== "0 mm") details += `<div class="exif-row"><span class="exif-label">🎯</span><span>${focal}</span></div>`;
    if (date && date !== "1970:01:01 08:00:00") details += `<div class="exif-row"><span class="exif-label">📅</span><span>${date}</span></div>`;
    
    panel.querySelector(".exif-details").innerHTML = details || "<div class='exif-empty'>无 EXIF 信息</div>";
  }

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
        const exifBtn = document.querySelector(".pswp__button--exif");
        if (exifBtn) exifBtn.click();
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
