document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  if (loginForm) {
    // 1. 监听提交：拦截登录表单的点击事件
    loginForm.addEventListener('submit', async (e) => {
      // ... 登录逻辑 (保持不变) ...
      e.preventDefault(); 
      await handleAuth(e, 'login');
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleAuth(e, 'register');
    });
  }
});

// 通用认证处理函数
async function handleAuth(e, type) {
  const isLogin = type === 'login';
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const submitBtn = document.querySelector('.submit-btn');

  // 变量名：formData
  const formData = {
    username: usernameInput.value.trim(),
    password: passwordInput.value.trim()
  };

  if (!formData.username || !formData.password) {
    alert('请输入用户名和密码');
    return;
  }

  try {
    // UI Loading 状态
    submitBtn.disabled = true;
    submitBtn.textContent = isLogin ? '连接梦境中...' : '注册中...';

    // 基础 URL 配置 (兼容本地开发与远程部署)
    // 本地环境使用 localhost，线上环境使用指定 IP
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const endpoint = isLogin ? '/auth/login' : '/auth/register';
const targetUrl = `/api${endpoint}`;

    console.log(`📡 发起请求: ${targetUrl}`); // 打印完整 URL

    // 2. 发送请求：使用 fetch 发送用户名和密码
    // 变量名：response
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });

    // 变量名：result
    const result = await response.json();

    if (result.success) {
      if (isLogin) {
        // 3. Token 管理 (仅登录时)
        // 说明：登录成功后，后端会返回一个 JWT (JSON Web Token)。
        localStorage.setItem('token', result.token);
        console.log('登录成功，Token 已保存');
        
        // 4. 跳转流程：跳转到首页
        window.location.href = '../index.html';
      } else {
        // 注册成功逻辑
        alert('✨ 注册成功！请使用新账号登录。');
        window.location.href = 'login.html';
      }
    } else {
      // 失败处理
      console.warn('请求失败:', result); // 打印后端返回的错误详情
      alert(result.msg || (isLogin ? '登录失败' : '注册失败'));
      submitBtn.disabled = false;
      submitBtn.textContent = isLogin ? '进入梦境' : '开启织梦之旅';
    }

  } catch (error) {
    console.error(`${type} Error:`, error);
    
    // 智能错误诊断
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      alert('无法连接到服务器，请检查网络或后端服务是否启动。');
    } else {
      // 显示具体的错误信息 (包含状态码)
      alert(error.message);
    }
    
    submitBtn.disabled = false;
    submitBtn.textContent = isLogin ? '进入梦境' : '开启织梦之旅';
  }
}
