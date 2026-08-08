// 收藏页: 渲染 localStorage 中的收藏照片 + 导入导出
import { render, exportFavorites, importFavorites } from "./favorites.js";
import "./lazysizes.js";

function initFavoritesPage() {
  const container = document.getElementById("favorites");
  if (!container) return;

  render(container);

  // 导入导出工具条
  const toolbar = document.createElement("div");
  toolbar.className = "favorites-toolbar";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "favorites-btn";
  exportBtn.textContent = "导出收藏";
  exportBtn.title = "下载收藏列表为 JSON 文件";
  exportBtn.addEventListener("click", () => exportFavorites());
  toolbar.appendChild(exportBtn);

  const importLabel = document.createElement("label");
  importLabel.className = "favorites-btn";
  importLabel.textContent = "导入收藏";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    importFavorites(file, (added, err) => {
      showMessage(
        err ? err : `已导入 ${added} 张照片`
      );
      render(container);
      if (window.lazySizes && typeof window.lazySizes.check === "function") {
        window.lazySizes.check();
      }
      fileInput.value = "";
    });
  });
  importLabel.appendChild(fileInput);
  toolbar.appendChild(importLabel);

  const msg = document.createElement("p");
  msg.className = "favorites-msg";
  msg.hidden = true;
  toolbar.appendChild(msg);

  function showMessage(text) {
    msg.textContent = text;
    msg.hidden = false;
    msg.classList.remove("favorites-msg-error");
    setTimeout(() => {
      msg.hidden = true;
    }, 3000);
  }

  // 插入工具条到容器最前
  container.insertBefore(toolbar, container.firstChild);

  // lazysizes 渲染后处理懒加载
  if (window.lazySizes && typeof window.lazySizes.check === "function") {
    window.lazySizes.check();
  }
  // 触发懒加载
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("resize"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFavoritesPage);
} else {
  initFavoritesPage();
}
