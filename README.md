# Hugo Gallery Theme

A very simple and opinionated photo gallery theme for Hugo.

[简体中文](#中文说明) | [English](#features)

- [Demo](https://nicokaiser.github.io/hugo-theme-gallery/)
- [Example site source](https://github.com/nicokaiser/hugo-theme-gallery/tree/main/exampleSite)

---

![Screenshot](https://github.com/nicokaiser/hugo-theme-gallery/raw/main/images/screenshot.jpg)

---

## Features

### Original Features

- Responsive design
- Dark color scheme (can be set per page)
- Private albums
- Justified album views with [Flickr's Justified Layout](https://github.com/flickr/justified-layout)
- Lightbox with [PhotoSwipe](https://photoswipe.com/)
- SEO with Open Graph tags
- Automatic (or manual) selection of feature/cover images

### Added Features (by hh127)

#### 1. EXIF Information Panel / EXIF 信息面板

Display camera metadata (EXIF data) for photos in a stylish panel. Shows camera model, lens, aperture, shutter speed, ISO, focal length, and more.

在照片下方展示相机元数据（EXIF 信息），支持相机型号、镜头、光圈、快门速度、ISO、焦距等拍摄参数。

**Files added / 新增文件:**
- 样式已并入 `assets/css/main.scss`（信息面板样式）

#### 2. Password Protection / 密码保护

Protect private albums with a password. Visitors must enter the correct password to view the album content.

为私密相册添加密码保护，访客需输入正确密码才能查看相册内容。

**Features / 功能特点:**
- Immersive fullscreen UI with blurred album cover background / 沉浸式全屏界面，模糊相册封面背景
- Minimalist borderless input with animated focus glow / 极简无边框输入框，聚焦时发光
- Gradient unlock button with hover effects / 渐变解锁按钮，带悬停效果
- Success/failure animations / 成功/失败动画
- SHA-256 password hashing / SHA-256 密码哈希

**Files added / 新增文件:**
- `assets/css/password-protect.css` - Immersive UI styling / 沉浸式界面样式
- `assets/js/password-protect.js` - Password verification logic / 密码验证逻辑
- `layouts/partials/password-protect.html` - Password form template / 密码表单模板

#### 3. Keyboard Navigation / 键盘导航

Navigate through photos in the lightbox using keyboard shortcuts:
- Left/Right arrows: Previous/Next photo
- Escape: Close lightbox
- F: Toggle fullscreen
- I: Toggle EXIF info panel

支持在灯箱中用键盘快捷键浏览照片：
- 左/右方向键：上一张/下一张
- Escape：关闭灯箱
- F：切换全屏
- I：切换 EXIF 信息面板

**Files modified / 修改文件:**
- `assets/js/lightbox.js` - Added keyboard event listeners / 添加键盘事件监听

#### 4. Gallery Hover Micro-interactions / 画廊悬停微交互

Smooth hover effects for gallery items:
- Image zoom to 1.04x with brightness dim
- Title caption slides up from bottom with fade-in
- Camera info displayed in caption
- Gradient overlay for better readability

画廊项目的悬停微交互效果：
- 图片平滑放大到 1.04 倍并变暗
- 标题从底部滑入淡入
- 标题中显示相机信息
- 渐变蒙版提升可读性

**Files modified / 修改文件:**
- `assets/css/main.scss` - Hover animation styles / 悬停动画样式
- `layouts/partials/gallery.html` - Added figcaption overlay / 添加标题蒙版

#### 5. CDN Remote Images / CDN 远程图片

Support for remote images via CDN with automatic metadata extraction:
- Use `remote_images` in front matter to specify CDN URLs
- Automatic EXIF extraction from remote images
- Auto-generated thumbnail URLs with resize parameters
- Images cached locally for faster rebuilds

支持通过 CDN 使用远程图片，并自动提取元数据：
- 在 front matter 中用 `remote_images` 指定 CDN 链接
- 自动提取远程图片的 EXIF 信息
- 自动生成带缩放参数的缩略图链接
- 图片本地缓存，加速构建

**Usage / 使用方式:**
```yaml
---
title: "Album Name"
remote_images:
  - "https://cdn.example.com/photo1.jpg"
  - "https://cdn.example.com/photo2.jpg"
---
```

**Files modified / 修改文件:**
- `layouts/partials/gallery.html` - Added remote image support / 添加远程图片支持
- `layouts/partials/get-gallery.html` - Support remote image covers / 支持远程图片封面
- `layouts/partials/album-card.html` - Support remote image thumbnails / 支持远程图片缩略图

#### 6. Lightbox Info Panel Redesign / 灯箱信息面板重新设计

Completely redesigned the lightbox info panel with a cinematic, story-driven layout:
- Story text (title & description) positioned at bottom-right corner
- Fixed 380px panel width on the right side
- Image auto-centers in remaining space when panel opens
- Frosted glass effect with backdrop blur
- Minimal horizontal metadata display (camera, lens, settings, date)
- Metadata hidden by default, reveals on hover
- Smooth slide-in animation from right
- Magazine-style typography with decorative elements
- Photo index (e.g. 03/12) in magazine page-number style / 照片索引（杂志页码风格）
- Iconized metadata rows (camera / lens / settings / date) / 元数据图标化
- Radial-gradient backdrop and soft ambient shadow around photos / 背景径向渐变 + 照片环境阴影
- Loop navigation so both arrows stay visible / 循环浏览，箭头常驻
- Next arrow shifts left of the panel when it opens (avoids being covered) / 面板打开时 next 箭头移到面板左侧，避免被遮挡

重新设计的灯箱信息面板，采用电影感、故事驱动的布局：
- 故事文字（标题和描述）位于右下角
- 右侧固定 380px 面板宽度
- 打开面板时，图片在剩余空间自动居中
- 磨砂玻璃效果，背景模糊
- 极简横向元数据（相机、镜头、参数、日期）
- 元数据默认隐藏，悬停时显示
- 从右侧平滑滑入
- 杂志风格排版，带装饰性元素
- 照片索引（如 03/12），杂志页码风格
- 元数据图标化（相机 / 镜头 / 参数 / 日期）
- 背景径向渐变 + 照片四周柔和环境阴影
- 循环浏览，两个箭头始终可用
- 面板打开时 next 箭头移到面板左侧，避免被遮挡

**Files modified / 修改文件:**
- `assets/css/main.scss` - Panel styling with frosted glass / 磨砂玻璃面板样式
- `assets/js/lightbox.js` - Panel logic with dynamic viewport / 面板逻辑，动态视口调整

#### 7. Gallery Performance Optimization / 画廊性能优化

Optimized gallery interactions for smoother experience:
- Hover scale effect (1.04x) with faster transition (0.3s)
- Removed dynamic caption plugin to reduce overhead
- Changed title attribute to data-title to prevent browser tooltip
- Optimized transition timing for better performance

优化画廊交互，提升流畅度：
- 悬停放大（1.04 倍），过渡更快（0.3s）
- 移除动态标题插件，降低开销
- 将 title 改为 data-title，避免浏览器 tooltip
- 优化过渡时机，提升性能

**Files modified / 修改文件:**
- `assets/css/main.scss` - Hover styles with faster transition / 悬停样式，更快过渡
- `assets/js/lightbox.js` - Removed caption plugin / 移除标题插件
- `layouts/partials/gallery.html` - Changed title to data-title / 将 title 改为 data-title

#### 8. Stealth Album / 隐秘相册

Hidden album accessible only through a secret easter-egg entry, combined with password protection:
- Trigger: click the site title (logo) in the header 5 times quickly / 触发方式：连点站点标题 5 次
- A minimal password prompt appears; correct password redirects to the hidden album / 弹出极简密码框，密码正确后跳转隐秘相册
- Wrong password gives no feedback at all — the album's existence stays hidden / 密码错误无任何反馈，不暴露隐秘相册的存在
- Album is fully invisible: excluded from homepage, sitemap, RSS, related albums, and marked `noindex` / 完全不可见：首页、sitemap、RSS、相关推荐全部排除，并标记 noindex
- Content encrypted with AES-256-GCM on build (reuses the password-protection pipeline) / 内容构建时 AES-256-GCM 加密（复用现有密码保护管线）
- Works on mobile, tablet and desktop (tap / click) / 兼容手机、平板、电脑（触摸/鼠标点击）

**Usage / 使用方式:**
1. Create an album with `private: true` and a `password` in front matter, e.g. `content/vault-xxxxx/index.md` / 创建相册并设置 `private: true` 和 `password`（目录名用随机字符串）
2. Set the album path in `assets/js/stealth.js` (`CONFIG.albumPath`) / 在 `assets/js/stealth.js` 的 `CONFIG.albumPath` 填写相册路径
3. Adjust click count if desired (`CONFIG.clicks`) / 可按需调整触发次数（`CONFIG.clicks`）

**Files added / 新增文件:**
- `assets/js/stealth.js` - Easter-egg entry, password verification, auto-unlock / 彩蛋入口、密码验证、自动解锁
- `assets/js/main.js` - Import stealth.js / 引入 stealth.js

---

## 中文说明

这是一个简洁、风格鲜明的 Hugo 照片画廊主题，基于 [nicokaiser/hugo-theme-gallery](https://github.com/nicokaiser/hugo-theme-gallery) 改造而成。

### 原版功能

- 响应式设计
- 深色配色方案（可按页面单独设置）
- 私密相册
- 基于 Flickr Justified Layout 的瀑布流相册视图
- 基于 PhotoSwipe 的灯箱效果
- SEO 优化（Open Graph 标签）
- 封面图自动（或手动）选择

### 新增功能

#### 1. EXIF 信息面板

在照片详情页展示拍摄参数，包括：
- 相机型号
- 镜头信息
- 光圈、快门速度、ISO
- 焦距、拍摄时间等

#### 2. 密码保护

为相册提供沉浸式密码保护：
- 全屏模糊背景（使用相册封面图）
- 极简无边框输入框，聚焦时发光
- 渐变解锁按钮，带悬停效果
- 成功/失败动画反馈
- SHA-256 密码哈希存储

#### 3. 键盘导航

在灯箱浏览模式下支持键盘操作：
- `←` / `→`：上一张/下一张照片
- `Esc`：关闭灯箱
- `F`：切换全屏
- `I`：切换 EXIF 信息面板

#### 4. 画廊悬停微交互

鼠标悬停时的平滑过渡效果：
- 图片放大到 1.04 倍并变暗
- 标题从底部滑入淡入
- 相机信息显示在标题中
- 渐变蒙版提升可读性

#### 5. CDN 远程图片

支持通过 CDN 使用远程图片：
- 在 front matter 中使用 `remote_images` 字段
- 自动提取 EXIF 元数据
- 自动生成缩略图链接
- 本地缓存加速构建

**使用方式：**
```yaml
---
title: "相册名称"
remote_images:
  - "https://cdn.example.com/photo1.jpg"
  - "https://cdn.example.com/photo2.jpg"
---
```

#### 6. 灯箱信息面板重新设计

全新设计的灯箱信息面板，采用电影感、故事驱动的布局：
- 故事文字（标题和描述）位于右下角
- 右侧固定 380px 面板宽度
- 打开面板时，图片在剩余空间自动居中
- 磨砂玻璃效果，背景模糊
- 极简横向元数据（相机、镜头、参数、日期）
- 元数据默认隐藏，悬停时显示
- 从右侧平滑滑入
- 杂志风格排版，带装饰性元素

#### 7. 画廊性能优化

优化画廊交互，提升流畅度：
- 悬停放大（1.04 倍），过渡更快（0.3s）
- 移除动态标题插件，降低开销
- 将 title 改为 data-title，避免浏览器 tooltip
- 优化过渡时机，提升性能

#### 8. 隐秘相册

只能通过隐秘彩蛋入口 + 密码访问的隐藏相册：
- 触发方式：快速连点页面顶部站点标题 5 次
- 弹出极简密码框，密码正确后自动跳转隐秘相册
- 密码错误无任何反馈，不暴露隐秘相册的存在
- 完全不可见：首页、sitemap、RSS、相关推荐全部排除，并标记 noindex
- 内容构建时 AES-256-GCM 加密（复用现有密码保护管线）
- 兼容手机、平板、电脑（触摸/鼠标点击）

**使用方式：**
1. 创建相册并设置 `private: true` 和 `password`（目录名用随机字符串，如 `content/vault-xxxxx/`）
2. 在 `assets/js/stealth.js` 的 `CONFIG.albumPath` 填写相册路径
3. 可按需调整触发次数（`CONFIG.clicks`）

**新增文件：**
- `assets/js/stealth.js` - 彩蛋入口、密码验证、自动解锁
- `assets/js/main.js` - 引入 stealth.js

---

## Installation

This theme requires Hugo Extended >= 0.123.0.

### As a Hugo Module

```sh
hugo mod init github.com/<your_user>/<your_project>
```

Then add the theme to your `hugo.toml`:

```toml
[module]
  [[module.imports]]
    path = "github.com/hh127/hugo-theme-gallery/v4"
```

### As Git Submodule

```sh
git submodule add --depth=1 https://github.com/hh127/hugo-theme-gallery.git themes/gallery
```

---

## Credits / 致谢

- Original theme by [Nico Kaiser](https://kaiser.me/)
- EXIF panel, password protection, keyboard navigation, hover interactions, and CDN support by [hh127](https://github.com/hh127)

## Author

- [Nico Kaiser](https://kaiser.me/)
