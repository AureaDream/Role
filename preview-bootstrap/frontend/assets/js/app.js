// --- 基础配置 ---
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isLocal ? 'http://localhost:3000/api' : 'http://120.79.120.7:3000/api';
const HOST_BASE = isLocal ? 'http://localhost:3000' : 'http://120.79.120.7:3000';

// --- 辅助函数：图片路径处理 ---
function getImgUrl(path) {
  if (!path) return 'https://placehold.co/400?text=No+Image';
  if (path.startsWith('http')) return path;
  // 如果是相对路径 (如 /uploads/xxx)，拼接 HOST_BASE
  return `${HOST_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// --- 核心工具：请求封装 ---
async function request(endpoint, options = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    if (!options.headers) options.headers = {};
    if (options.body && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    
    // 自动添加 Token (如果有)
    const token = localStorage.getItem('token');
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    console.log(`📡 [App.js] 发起请求: ${url}`); // 增加调试日志

    const res = await fetch(url, options);

    // --- 健壮性处理 ---
    // 优先检查 HTTP 状态码，处理 404/500 等非 200 情况
    if (!res.ok) {
      const errorText = await res.text();
      let errorMsg = `请求失败 (${res.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.msg || errorJson.error || errorMsg;
      } catch (e) {
        errorMsg += `: ${errorText.slice(0, 50)}...`;
      }
      throw new Error(errorMsg);
    }

    const data = await res.json();
    if (data.success === false) throw new Error(data.msg);
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    alert(err.message || '网络请求失败');
    throw err;
  }
}

// --- 用户认证 ---
async function login(username, password) {
  try {
    const res = await request('/auth/login', {
      method: 'POST',
      body: { username, password }
    });

    // 保存 token 到 localStorage
    if (res.token) {
      localStorage.setItem('token', res.token);
      console.log('Token saved:', res.token);
    }
    return res;
  } catch (err) {
    console.error('Login error:', err);
    throw err;
  }
}

// 暴露给全局以便测试
window.login = login;

// --- 页面初始化逻辑 ---

// 1. 首页 (index.html)
async function initHome() {
  const carouselInner = document.querySelector('#popularCarousel .carousel-inner');
  const grid = document.querySelector('#squareGrid');

  if (!grid) return; // 确保在首页

  try {
    // 获取后端动态数据
    const list = await request('/char/public');
    
    // 渲染广场卡片
    grid.innerHTML = ''; // 清空占位
    list.forEach(item => {
      // 处理头像：如果是相对路径，加上 API_BASE 的前缀 (去除 /api)
      const avatarUrl = item.avatar.startsWith('http') 
        ? item.avatar 
        : `${API_BASE}${item.avatar}`;

      const card = `
        <div class="col">
          <div class="card h-100" onclick="location.href='pages/detail.html?id=${item.id}'" style="cursor:pointer">
            <img src="${avatarUrl}" class="card-img-top" style="aspect-ratio:1/1;object-fit:cover;" onerror="this.src='https://placehold.co/400?text=No+Image'"/>
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center">
                <div class="fw-semibold text-truncate">${item.name}</div>
                <span class="badge text-bg-success">公开</span>
              </div>
              <div class="caps my-2">
                <span class="cap">${item.gender}</span>
                <span class="cap">${item.age}岁</span>
              </div>
              <div class="text-muted small text-truncate-2" style="min-height:40px;">${item.intro || '暂无简介'}</div>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-outline-primary btn-sm w-100" onclick="event.stopPropagation(); likeChar(${item.id}, this)">
                  ❤️ ${item.likes || 0}
                </button>
              </div>
            </div>
          </div>
        </div>`;
      grid.insertAdjacentHTML('beforeend', card);
    });

  } catch (error) {
    grid.innerHTML = `<div class="col-12 text-center text-muted py-5">加载失败，请检查后端服务</div>`;
  }
}

// 点赞功能
async function likeChar(id, btn) {
  try {
    const res = await request(`/char/like/${id}`, { method: 'POST' });
    btn.innerHTML = `❤️ ${res.count}`;
  } catch (e) {
    // error handled by request
  }
}

// 2. 工作台 (workshop.html)
function initWorkshop() {
  const genBtn = document.querySelector('#genBtn');
  const selA = document.querySelector('#selectA');
  const selB = document.querySelector('#selectB');
  
  // 初始化下拉框数据 (获取所有角色)
  // 实际场景应获取“我的角色”和“已授权角色”，这里暂时用 public 列表演示
  request('/char/public').then(list => {
    if (!selA) return;
    list.forEach(o => {
      const opt = `<option value="${o.id}">${o.name}</option>`;
      selA.insertAdjacentHTML('beforeend', opt);
      selB.insertAdjacentHTML('beforeend', opt);
    });
  });

  // 织梦生成逻辑
  genBtn?.addEventListener('click', async () => {
    const charIds = [selA.value, selB.value].filter(Boolean);
    const scene = document.querySelector('#keywords').value;
    
    if (charIds.length < 1) return alert('请至少选择一个角色');
    if (!scene) return alert('请输入场景关键词');

    // UI Loading
    genBtn.disabled = true;
    genBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 正在织梦...';
    document.querySelector('#loadingArea').classList.remove('d-none');
    document.querySelector('#resultCard').classList.add('d-none');

    try {
      // 调用后端生成接口
      const res = await request('/story/create', {
        method: 'POST',
        body: { charIds, scene, userId: 1 } // userId 暂时写死，需对接登录
      });

      // 显示结果
      document.querySelector('#loadingArea').classList.add('d-none');
      document.querySelector('#resultCard').classList.remove('d-none');
      
      const text = res.story.content;
      const pre = document.querySelector('#resultPre');
      pre.textContent = '';
      
      // 打字机效果
      let i = 0;
      function type() {
        if (i < text.length) {
          pre.textContent += text.charAt(i);
          i++;
          setTimeout(type, 20);
        } else {
          genBtn.disabled = false;
          genBtn.textContent = '✨ 再次生成';
        }
      }
      type();

    } catch (error) {
      genBtn.disabled = false;
      genBtn.textContent = '✨ 织梦生成';
      document.querySelector('#loadingArea').classList.add('d-none');
    }
  });

  // 绑定“保存设定”按钮 (创建 OC)
  const saveBtn = document.querySelector('#saveCharBtn');
  const tagKeyInput = document.querySelector('#tagKey');
  const tagValInput = document.querySelector('#tagVal');
  const addTagBtn = document.querySelector('#addTagBtn');
  const tagListEl = document.querySelector('#tagList');
  
  // 临时存储标签
  let currentTags = [];

  // 添加标签逻辑
  addTagBtn?.addEventListener('click', () => {
    const k = tagKeyInput.value.trim();
    const v = tagValInput.value.trim();
    if (k && v) {
      currentTags.push({ key: k, value: v });
      renderTags();
      tagKeyInput.value = '';
      tagValInput.value = '';
    }
  });

  function renderTags() {
    if (!tagListEl) return;
    tagListEl.innerHTML = currentTags.map(t => 
      `<span class="badge text-bg-light border me-1">${t.key}: ${t.value}</span>`
    ).join('');
  }

  // 保存逻辑
  saveBtn?.addEventListener('click', async () => {
    // 收集表单数据
    const name = document.querySelector('#charName').value;
    const gender = document.querySelector('#charGender').value;
    const age = document.querySelector('#charAge').value;
    const race = document.querySelector('#charRace').value;
    const job = document.querySelector('#charJob').value;
    const appearance = document.querySelector('#charAppearance').value;
    const bio = document.querySelector('#charBio').value;

    if (!name) return alert('请输入角色姓名');

    // 整合标签 (将种族和职业加入 Tags)
    const finalTags = [...currentTags];
    if (race) finalTags.push({ key: '种族', value: race });
    if (job) finalTags.push({ key: '职业', value: job });

    // 构造请求体
    const payload = {
      owner: 1, // 临时硬编码，后续对接用户系统
      name,
      gender,
      age,
      avatar: '/uploads/default.png', // 暂无上传，使用默认图
      intro: bio.slice(0, 30) + '...', // 自动截取简介
      appearance,
      bio,
      tags: finalTags,
      isPublic: true // 默认公开以便测试
    };

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      
      await request('/char/add', {
        method: 'POST',
        body: payload
      });

      alert('✨ 角色创建成功！');
      location.reload(); // 刷新页面
      
    } catch (error) {
      alert('创建失败: ' + error.message);
      saveBtn.disabled = false;
      saveBtn.textContent = '保存设定';
    }
  });
}

// 3. 详情页 (detail.html)
async function initDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;

  try {
    // 复用 export 接口或单独写一个 detail 接口，这里暂时用 public 列表筛选模拟
    // 建议后端增加 GET /api/char/:id 接口
    // 临时方案：前端 fetch list 过滤
    const list = await request('/char/public'); 
    const oc = list.find(x => String(x.id) === id);
    
    if (!oc) throw new Error('角色不存在');

    // 填充数据
    document.querySelector('#name').textContent = oc.name;
    document.querySelector('#avatar').src = getImgUrl(oc.avatar);
    document.querySelector('#appearance').textContent = oc.appearance || '暂无';
    document.querySelector('#background').textContent = oc.bio || '暂无'; // 注意后端字段是 bio
    
    // 渲染 Tags (保持与首页一致的金色风格)
    const tagWrap = document.querySelector('#tags');
    if (tagWrap && Array.isArray(oc.tags)) {
      tagWrap.innerHTML = oc.tags.map(t => 
        `<span class="badge rounded-pill border border-warning text-dark bg-transparent fw-normal me-2 mb-2 p-2">
          ${t.key}: ${t.value}
         </span>`
      ).join('');
    }

  } catch (error) {
    alert('加载详情失败');
  }
}

// 4. 登录页 (login.html) - 已迁移至 auth.js
// function initLogin() { ... }

// --- 全局入口 ---
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.getAttribute('data-page');
  if (page === 'home') initHome();
  if (page === 'workshop') initWorkshop();
  if (page === 'detail') initDetail();
  // if (page === 'login') initLogin(); // 由 auth.js 接管
});
