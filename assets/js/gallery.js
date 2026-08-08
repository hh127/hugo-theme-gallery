import justifiedLayout from "./justified-layout.js";
import * as params from "@params";

const gallery = document.getElementById("gallery");

if (gallery) {
  let containerWidth = 0;
  let rafId = null;
  const items = gallery.querySelectorAll(".gallery-item");

  const aspectRatios = Array.from(items).map((item) => {
    const img = item.querySelector("img");
    img.style.width = "100%";
    img.style.height = "auto";
    const w = parseFloat(img.getAttribute("width"));
    const h = parseFloat(img.getAttribute("height"));
    // 防御: 缺少宽高属性时回退 1:1，避免布局 NaN
    if (!w || !h) return 1;
    return w / h;
  });

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

  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  // 首次调用即可（不可见时 updateGallery 内部会跳过）
  updateGallery();
}
