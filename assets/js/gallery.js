import justifiedLayout from "./justified-layout.js";
import * as params from "@params";

const gallery = document.getElementById("gallery");

// 全局状态（支持重新初始化：密码解锁后注入图片再调用 initGallery）
let items = [];
let aspectRatios = [];
let bound = false;
let rafId = null;
let containerWidth = 0;

function collectItems() {
  items = gallery.querySelectorAll(".gallery-item");
  aspectRatios = Array.from(items).map((item) => {
    const img = item.querySelector("img");
    img.style.width = "100%";
    img.style.height = "auto";
    const w = parseFloat(img.getAttribute("width"));
    const h = parseFloat(img.getAttribute("height"));
    // 防御: 缺少宽高属性时回退 1:1，避免布局 NaN
    if (!w || !h) return 1;
    return w / h;
  });
}

function updateGallery() {
  const width = gallery.getBoundingClientRect().width;
  // 容器不可见（如密码保护未解锁）时跳过，避免 rowWidth=0 布局错误
  if (width <= 0) return;
  if (containerWidth === width) return;
  containerWidth = width;

  const layout = justifiedLayout(aspectRatios, {
    rowWidth: containerWidth,
    spacing: Number.isInteger(params.boxSpacing) ? params.boxSpacing : 8,
    rowHeight: params.targetRowHeight || 288,
    heightTolerance: Number.isInteger(params.targetRowHeightTolerance) ? params.targetRowHeightTolerance : 0.25,
  });

  items.forEach((item, i) => {
    const { width, height, top, left } = layout.boxes[i];
    item.style.position = "absolute";
    item.style.width = width + "px";
    item.style.height = height + "px";
    item.style.top = top + "px";
    item.style.left = left + "px";
    item.style.overflow = "hidden";
  });

  gallery.style.position = "relative";
  gallery.style.height = layout.containerHeight + "px";
  gallery.style.visibility = "";
}

// rAF 节流: 避免 resize 高频重复计算布局
function onResize() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    updateGallery();
  });
}

export function initGallery() {
  if (!gallery) return;
  collectItems();
  updateGallery();
}

// 暴露给密码解锁等动态注入场景
window.galleryApi = { initGallery };

if (gallery) {
  if (!bound) {
    bound = true;
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
  }
  initGallery();
}
