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

**Files added / 新增文件:**
- `assets/css/password-protect.css` - Protection page styling / 保护页面样式
- `assets/js/password-protect.js` - Password verification logic / 密码验证逻辑
- `layouts/partials/password-protect.html` - Password form template / 密码表单模板

#### 3. Keyboard Navigation / 键盘导航

Navigate through photos in the lightbox using keyboard shortcuts:
- Left/Right arrows: Previous/Next photo
- Escape: Close lightbox

支持在灯箱（Lightbox）中使用键盘快捷键浏览照片：
- 左/右方向键：上一张/下一张
- Escape：关闭灯箱

**Files modified / 修改文件:**
- `assets/js/lightbox.js` - Added keyboard event listeners / 添加键盘事件监听
- `layouts/partials/gallery.html` - EXIF panel integration / 集成 EXIF 面板
- `layouts/partials/head.html` - Added CSS/JS includes / 添加 CSS/JS 引用
- `layouts/_default/single.html` - Password protection support / 密码保护支持

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

为相册添加访问密码保护：
- 支持为不同相册设置不同密码
- 访问私密相册前需输入密码
- 密码通过 SHA-256 哈希存储，安全可靠

#### 3. 键盘导航

在灯箱浏览模式下支持键盘操作：
- `←` / `→`：切换上一张/下一张照片
- `Esc`：关闭灯箱

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
- EXIF panel, password protection, and keyboard navigation by [hh127](https://github.com/hh127)

## Author

- [Nico Kaiser](https://kaiser.me/)
