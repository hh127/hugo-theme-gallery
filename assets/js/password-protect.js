// 密码保护功能
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function initPasswordProtect() {
  const lockScreen = document.getElementById('lock-screen');
  const galleryWrapper = document.getElementById('gallery-wrapper');
  const passwordInput = document.getElementById('password-input');
  const submitBtn = document.getElementById('submit-password');
  const errorMsg = document.getElementById('error-msg');
  
  if (!lockScreen || !galleryWrapper) return;
  
  // 获取存储的密码哈希
  const storedHash = lockScreen.dataset.passwordHash;
  
  // 检查 sessionStorage 中是否已验证
  const pageId = window.location.pathname;
  const isVerified = sessionStorage.getItem('gallery_' + pageId);
  
  if (isVerified) {
    // 已验证，直接显示画廊
    lockScreen.style.display = 'none';
    galleryWrapper.style.display = '';
    // 多次触发 resize 确保 gallery.js 能正确计算布局
    triggerGalleryResize();
    return;
  }
  
  // 未验证，隐藏画廊并显示锁屏
  galleryWrapper.style.display = 'none';
  
  async function verifyPassword() {
    const password = passwordInput.value;
    if (!password) {
      errorMsg.textContent = '请输入密码';
      return;
    }
    
    const hash = await sha256(password);
    if (hash === storedHash) {
      // 密码正确
      sessionStorage.setItem('gallery_' + pageId, 'true');
      lockScreen.style.display = 'none';
      galleryWrapper.style.display = '';
      errorMsg.textContent = '';
      
      // 多次触发 resize 确保 gallery.js 能正确计算布局
      triggerGalleryResize();
    } else {
      errorMsg.textContent = '密码错误，请重试';
      passwordInput.value = '';
      passwordInput.focus();
    }
  }
  
  submitBtn.addEventListener('click', verifyPassword);
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
  });
  
  // 自动聚焦
  passwordInput.focus();
}

// 触发 gallery 重新计算布局
function triggerGalleryResize() {
  // 多次触发 resize，确保 gallery.js 能正确计算
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 50);
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 200);
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 500);
}

// 确保在 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPasswordProtect);
} else {
  initPasswordProtect();
}
