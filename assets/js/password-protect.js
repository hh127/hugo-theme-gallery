// 密码保护功能 - 沉浸式版本
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
    triggerGalleryResize();
    return;
  }
  
  // 未验证，隐藏画廊并显示锁屏
  galleryWrapper.style.display = 'none';
  
  // 预加载背景图片
  const bgImage = lockScreen.dataset.bgImage;
  if (bgImage) {
    const bgElement = lockScreen.querySelector('.lock-bg');
    if (bgElement) {
      const img = new Image();
      img.onload = function() {
        bgElement.style.opacity = '1';
      };
      img.src = bgImage;
    }
  }
  
  async function verifyPassword() {
    const password = passwordInput.value;
    if (!password) {
      showError('请输入密码');
      return;
    }
    
    const hash = await sha256(password);
    if (hash === storedHash) {
      // 密码正确
      sessionStorage.setItem('gallery_' + pageId, 'true');
      
      // 添加成功动画
      const container = lockScreen.querySelector('.lock-container');
      if (container) {
        container.classList.add('success');
      }
      
      // 延迟后淡出解锁
      setTimeout(() => {
        lockScreen.classList.add('unlocking');
        setTimeout(() => {
          lockScreen.style.display = 'none';
          galleryWrapper.style.display = '';
          errorMsg.textContent = '';
          triggerGalleryResize();
        }, 500);
      }, 400);
    } else {
      showError('密码错误，请重试');
      passwordInput.value = '';
      passwordInput.focus();
      
      // 抖动动画
      const container = lockScreen.querySelector('.lock-container');
      if (container) {
        container.style.animation = 'none';
        container.offsetHeight; // 触发重排
        container.style.animation = 'shake 0.5s ease';
      }
    }
  }
  
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.opacity = '1';
    errorMsg.style.transform = 'translateY(0)';
  }
  
  submitBtn.addEventListener('click', verifyPassword);
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') verifyPassword();
  });
  
  // 自动聚焦
  setTimeout(() => {
    passwordInput.focus();
  }, 300);
}

// 触发 gallery 重新计算布局
function triggerGalleryResize() {
  // 单次 resize 足够，lazysizes 会自行加载可见图片
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
    if (window.lazySizes && typeof window.lazySizes.check === 'function') {
      window.lazySizes.check();
    }
  }, 50);
}

// 确保在 DOM 加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPasswordProtect);
} else {
  initPasswordProtect();
}
