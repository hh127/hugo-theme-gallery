// 照片收藏模块: localStorage 存取 + 收藏页渲染
// 被 lightbox.js (灯箱按钮) 和收藏页 (favorites.js bundle) 共用

const STORAGE_KEY = "gallery-favorites";

export function getFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveFavorites(favs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  } catch (e) {
    /* storage full / unavailable */
  }
}

export function isFavorite(src) {
  return getFavorites().some((f) => f.src === src);
}

export function toggleFavorite(data) {
  const favs = getFavorites();
  const idx = favs.findIndex((f) => f.src === data.src);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push({
      src: data.src,
      thumb: data.thumb || "",
      title: data.title || "",
      description: data.description || "",
      camera: data.camera || "",
      date: data.date || "",
      addedAt: Date.now(),
    });
  }
  saveFavorites(favs);
  return idx < 0; // true = 已收藏
}

// 从 localStorage 移除
export function removeFavorite(src) {
  const favs = getFavorites().filter((f) => f.src !== src);
  saveFavorites(favs);
}

// 导出收藏为 JSON 文件下载
export function exportFavorites() {
  const favs = getFavorites();
  const blob = new Blob([JSON.stringify(favs, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gallery-favorites-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 从 JSON 文件导入收藏 (合并, 按 src 去重)
export function importFavorites(file, onDone) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("格式错误");
      const existing = getFavorites();
      const seen = new Set(existing.map((f) => f.src));
      let added = 0;
      parsed.forEach((f) => {
        if (f && f.src && !seen.has(f.src)) {
          existing.push({
            src: f.src,
            thumb: f.thumb || "",
            title: f.title || "",
            description: f.description || "",
            camera: f.camera || "",
            date: f.date || "",
            addedAt: f.addedAt || Date.now(),
          });
          seen.add(f.src);
          added++;
        }
      });
      saveFavorites(existing);
      onDone(added);
    } catch (e) {
      onDone(null, "文件格式无效，无法导入");
    }
  };
  reader.onerror = () => onDone(null, "读取文件失败");
  reader.readAsText(file);
}

// 收藏页渲染
export function render(container, opts) {
  const favs = getFavorites();
  const o = Object.assign(
    {
      emptyText: "还没有收藏的照片，点击灯箱中的 ♥ 添加",
      showRemove: true,
    },
    opts || {}
  );

  container.innerHTML = "";

  if (favs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "favorites-empty";
    empty.textContent = o.emptyText;
    container.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "favorites-grid";

  favs
    .slice()
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .forEach((f) => {
      const item = document.createElement("a");
      item.className = "favorite-item";
      item.href = f.src;
      item.target = "_blank";
      item.rel = "noopener";
      item.dataset.src = f.src;

      const fig = document.createElement("figure");
      fig.style.backgroundColor = "#333";
      const img = document.createElement("img");
      img.className = "lazyload";
      img.dataset.src = f.thumb || f.src;
      img.alt = f.title || "收藏照片";
      img.width = 600;
      img.height = 400;
      fig.appendChild(img);

      const cap = document.createElement("figcaption");
      cap.className = "favorite-caption";
      const title = document.createElement("span");
      title.className = "favorite-title";
      title.textContent = f.title || "(无标题)";
      cap.appendChild(title);
      if (f.camera) {
        const cam = document.createElement("span");
        cam.className = "favorite-camera";
        cam.textContent = f.camera;
        cap.appendChild(cam);
      }

      if (o.showRemove) {
        const rm = document.createElement("button");
        rm.className = "favorite-remove";
        rm.type = "button";
        rm.title = "取消收藏";
        rm.setAttribute("aria-label", "取消收藏");
        rm.textContent = "×";
        rm.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeFavorite(f.src);
          render(container, o);
        });
        cap.appendChild(rm);
      }

      item.appendChild(fig);
      item.appendChild(cap);
      grid.appendChild(item);
    });

  container.appendChild(grid);
}
