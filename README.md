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

在照片下方展示相机元数据（EXIF 信息）。支持显示相机型号、镜头、光圈、快门速度、ISO、焦距等拍摄参数。

**Files added / 新增文件:**
- `assets/css/exif-panel.css` - Panel styling / 面板样式

#### 2. Password Protection / 密码保护

Protect private albums with a password. Visitors must enter the correct password to view the album content.

为私密相册添加密码保护功能。访问者需要输入正确的密码才能查看相册内容。

**Features / 功能特点:**
- Immersive fullscreen UI with blurred album cover background / 沉浸式全屏界面，模糊相册封面背景
- Minimalist borderless input with animated focus glow / 极简无边框输入框，聚焦发光动画
- Gradient unlock button with hover effects / 渐变解锁按钮，悬停效果
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

支持在灯箱（Lightbox）中使用键盘快捷键浏览照片：
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
- 标题从底部向上滑入淡入显示
- 相机信息显示在标题中
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

支持通过 CDN 使用远程图片，自动提取元数据：
- 在 front matter 中使用 `remote_images` 指定 CDN 链接
- 自动提取远程图片的 EXIF 信息
- 自动生成缩略图链接（带 resize 参数）
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

---

## 中文说明

这是一个简洁的 Hugo 照片画廊主题，基于 [nicokaiser/hugo-theme-gallery](https://github.com/nicokaiser/hugo-theme-gallery) 改造。

### 原版功能

- 响应式设计
- 深色配色方案（可按页面设置）
- 私密相册
- 使用 Flickr Justified Layout 的 justified 视图
- 使用 PhotoSwipe 的灯箱效果
- SEO 优化（Open Graph 标签）
- 自动或手动选择封面图片

### 新增功能

#### 1. EXIF 信息面板

在照片详情页展示相机拍摄参数，包括：
- 相机型号
- 镜头信息
- 光圈、快门速度、ISO
- 焦距、拍摄时间等

#### 2. 密码保护

为相册添加沉浸式密码保护：
- 全屏模糊背景（使用相册封面图）
- 极简无边框输入框，聚焦发光动画
- 渐变解锁按钮，悬停效果
- 成功/失败动画反馈
- SHA-256 密码哈希存储

#### 3. 键盘导航

在灯箱浏览模式下支持键盘操作：
- `←` / `→`：切换上一张/下一张照片
- `Esc`：关闭灯箱
- `F`：切换全屏
- `I`：切换 EXIF 信息面板

#### 4. 画廊悬停微交互

鼠标悬停时的平滑过渡效果：
- 图片放大到 1.04 倍并变暗
- 标题从底部滑入淡入显示
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
