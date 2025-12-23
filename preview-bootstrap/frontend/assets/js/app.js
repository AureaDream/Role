// --- 基础配置 ---
const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
const API_BASE = isLocal ? 'http://localhost:3000/api' : 'http://120.79.120.7:3000/api';
const HOST_BASE = isLocal ? 'http://localhost:3000' : 'http://120.79.120.7:3000';

// --- 辅助函数：图片路径处理 ---
function getImgUrl(path, type = 'default') {
  if (!path) return 'https://placehold.co/400?text=No+Image';
  if (path.startsWith('http')) return path;
  
  // 如果路径已经是 /api 开头 (view 接口)，直接返回完整 URL
  if (path.startsWith('/api')) {
      return `${HOST_BASE}${path}`;
  }
  
  let cleanPath = path;
  
  // 检查是否已经包含路径前缀 (uploads/ 或 image/ 或 /image/ 等)
  const hasPrefix = cleanPath.startsWith('/') || cleanPath.startsWith('uploads/') || cleanPath.startsWith('image/');
  
  // 仅在没有前缀时进行拼接
  if (!hasPrefix) {
      if (type === 'avatar') {
          cleanPath = `/image/${cleanPath}`;
      } else {
          cleanPath = `/uploads/${cleanPath}`;
      }
  }
  
  return `${HOST_BASE}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
}

// --- 通用 UI 工具 ---
window.showAlert = function(msg) {
  return new Promise(resolve => {
    // 简单转义处理，防止 script 注入，但保留基础标签如 <br>
    // 这里为了简便直接渲染，生产环境建议使用 DOMPurify
    const modalHtml = `
      <div class="modal fade" id="globalAlertModal" tabindex="-1" style="z-index: 1056;">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title">提示</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body py-4">
              ${msg}
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-primary px-4 rounded-pill" data-bs-dismiss="modal">知道了</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const old = document.getElementById('globalAlertModal');
    if (old) old.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const el = document.getElementById('globalAlertModal');
    const modal = new bootstrap.Modal(el);
    
    el.addEventListener('hidden.bs.modal', () => {
      el.remove();
      resolve();
    });
    
    modal.show();
  });
};

window.showConfirm = function(msg) {
  return new Promise(resolve => {
    const modalHtml = `
      <div class="modal fade" id="globalConfirmModal" tabindex="-1" style="z-index: 1056;">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-0 pb-0">
              <h5 class="modal-title">确认</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body py-4">
              ${msg}
            </div>
            <div class="modal-footer border-0 pt-0">
              <button type="button" class="btn btn-secondary px-4 rounded-pill" data-bs-dismiss="modal" id="confirmCancelBtn">取消</button>
              <button type="button" class="btn btn-primary px-4 rounded-pill" id="confirmOkBtn">确定</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const old = document.getElementById('globalConfirmModal');
    if (old) old.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const el = document.getElementById('globalConfirmModal');
    const modal = new bootstrap.Modal(el);
    
    let isConfirmed = false;
    
    el.querySelector('#confirmOkBtn').addEventListener('click', () => {
      isConfirmed = true;
      modal.hide();
    });
    
    el.addEventListener('hidden.bs.modal', () => {
      el.remove();
      resolve(isConfirmed);
    });
    
    modal.show();
  });
};

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

      // Token 失效自动清除
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
      }

      throw new Error(errorMsg);
    }

    const data = await res.json();
    if (data.success === false) throw new Error(data.msg);
    return data;
  } catch (e) {
    console.error(`API 错误 [${endpoint}]:`, e);
    
    // 统一处理鉴权失败 (401/403)
    // 注意：request 函数内部抛出的 Error(msg) 可能包含状态码描述，也可能只是后端返回的 msg
    // 我们主要依赖 res.status 但这里已经 catch 了，fetch 层的 res 对象不可见
    // 所以最好在 throw 之前处理，或者在这里通过错误信息判断
    
    // 但更优的方式是在上方 !res.ok 的时候处理
    // 这里只负责兜底 alert，除非调用方 catch 了
    if (e.name === 'AbortError') {
      console.error('请求超时');
      throw new Error('请求超时，请检查网络连接或稍后重试');
    }
    throw e;
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
      console.log('已保存Token', res.token);
    }
    return res;
  } catch (err) {
    console.error('Login 错误:', err);
    throw err;
  }
}

// 暴露给全局以便测试
window.login = login;

// --- 页面初始化逻辑 ---

// 1. 首页 (index.html)
async function initHome() {
  const grid = document.querySelector('#squareGrid');
  if (!grid) return; // 确保在首页

  try {
    // 骨架屏加载动画 (Skeleton Screen)
    grid.innerHTML = Array(6).fill(0).map(() => `
      <div class="col">
        <div class="card h-100 border-0 shadow-sm">
          <div class="skeleton" style="padding-bottom: 100%;"></div>
          <div class="card-body">
            <div class="skeleton mb-2" style="height: 24px; width: 60%;"></div>
            <div class="skeleton" style="height: 16px; width: 90%;"></div>
          </div>
        </div>
      </div>
    `).join('');

    // 获取后端动态数据 (OC 广场列表)
    const charList = await request('/char/public');

    // --- 热门 OC 推荐渲染逻辑 ---
    try {
        const hotList = await request('/char/hot');
        const carouselInner = document.querySelector('#popularCarousel .carousel-inner');
        if (carouselInner && hotList.length > 0) {
            carouselInner.innerHTML = hotList.map((char, index) => {
                const imgUrl = getImgUrl(char.image || char.avatar);
                // 检查是否需要水印 (假设热门接口返回了 isWatermarkRequired 字段)
                // 如果后端没有返回该字段，这里可能需要补充。暂且假设有。
                const watermarkHtml = char.isWatermarkRequired ? `
                  <div class="watermark-overlay">
                    <div class="watermark-text">COPYRIGHT PROTECTED</div>
                  </div>
                ` : '';

                return `
                <div class="carousel-item ${index === 0 ? 'active' : ''}">
                    <div class="d-flex justify-content-center">
                        <div class="card shadow-sm" style="max-width: 600px; width: 100%;" onclick="location.href='pages/detail.html?id=${char.id}'">
                            <div class="row g-0">
                                <div class="col-md-5 position-relative overflow-hidden">
                                    <img src="${imgUrl}" class="img-fluid rounded-start h-100 object-fit-cover" alt="${char.name}" style="min-height: 250px;">
                                    ${watermarkHtml}
                                    <!-- 热度值角标 -->
                                    <div class="position-absolute top-0 start-0 m-2 badge bg-warning text-dark bg-gradient shadow" style="z-index: 3;">
                                        🔥 热度: ${char.heatValue}
                                    </div>
                                </div>
                                <div class="col-md-7">
                                    <div class="card-body d-flex flex-column h-100">
                                        <h5 class="card-title fw-bold">${char.name}</h5>
                                        <p class="card-text text-muted small flex-grow-1">${char.description ? char.description.slice(0, 80) + '...' : '暂无描述'}</p>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <small class="text-muted"><i class="bi bi-heart-fill text-danger"></i> ${char.likes}</small>
                                            <button class="btn btn-sm btn-outline-primary">查看详情</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            // 如果没有热门数据，隐藏卡片或显示提示
            document.querySelector('#popularCarousel').closest('.card').style.display = 'none';
        }
    } catch (e) {
        console.error('Load Hot OCs Failed:', e);
    }
    
    // 渲染广场卡片
    grid.innerHTML = ''; // 清空占位
    
    // 遍历数据生成卡片
    // 变量名: charList (数据源), container (容器), cardHtml (HTML片段)
    const container = document.createDocumentFragment();

    charList.forEach(char => {
      // --- 图片地址转换逻辑 ---
      // 1. 如果是完整 URL (http开头)，直接使用
      // 2. 如果是相对路径 (/uploads/xxx)，拼接 HOST_BASE
      // 3. 如果为空，使用默认占位图
      const imgUrl = getImgUrl(char.image || char.avatar, 'char');

      // --- HTML 拼接逻辑 ---
      // 构建 Bootstrap 卡片结构
      // 包含: 图片(img-top), 名字(card-title), 描述(card-text)
      // 优化：点赞按钮样式 (Square, Bottom-Right)
      // 如果已点赞，使用 .active 类和实心图标；否则使用空心图标
      const isLiked = char.isLiked;
      const likeBtnClass = isLiked ? 'btn-like-square active' : 'btn-like-square';
      const likeIconClass = isLiked ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up';
      
      const cardHtml = `
        <div class="col">
          <div class="card h-100 shadow-sm hover-lift position-relative" onclick="console.log('Selected Char ID:', ${char.id}); location.href='pages/detail.html?id=${char.id}'" style="cursor:pointer;">
            <img src="${imgUrl}" class="card-img-top" style="aspect-ratio: 1/1; object-fit: cover;" alt="${char.name}" onerror="this.src='https://placehold.co/400?text=No+Image'">
            <div class="card-body pb-5">
              <h5 class="card-title text-truncate">${char.name}</h5>
              <div class="card-text text-muted small text-truncate-2" style="min-height: 2.5em;">
                ${char.description || char.intro || '暂无描述'}
              </div>
              <div class="d-flex align-items-center gap-3 mt-3 text-muted small">
                  <span title="点赞"><i class="bi bi-heart-fill text-danger me-1"></i>${char.likes || 0}</span>
                  <span title="评论"><i class="bi bi-chat-fill text-primary me-1"></i>${char.commentsCount || 0}</span>
              </div>
            </div>
            
            <!-- Floating Action Button -->
            <div class="card-footer-action">
              <button class="${likeBtnClass} shadow-sm" onclick="likeChar(${char.id}, this)" title="点赞">
                <i class="bi ${likeIconClass}"></i>
              </button>
            </div>
          </div>
        </div>
      `;
      
      grid.insertAdjacentHTML('beforeend', cardHtml);
    });

  } catch (error) {
    console.error('Home Render Error:', error);
    grid.innerHTML = `<div class="col-12 text-center text-muted py-5">
      <div class="alert alert-warning">暂无角色或服务连接失败</div>
    </div>`;
  }

  // --- 自动弹出“致创作者”弹窗 ---
  // 逻辑：每次会话 (Session) 只弹出一次
  const hasShownManifesto = sessionStorage.getItem('hasShownManifesto');
  if (!hasShownManifesto) {
      const manifestoModalEl = document.getElementById('manifestoModal');
      if (manifestoModalEl) {
          // 延迟一点弹出，体验更好
          setTimeout(() => {
              const modal = new bootstrap.Modal(manifestoModalEl);
              modal.show();
              sessionStorage.setItem('hasShownManifesto', 'true');
          }, 800);
      }
  }
}

// 点赞功能处理函数
async function likeChar(id, btn) {
  // 阻止冒泡，防止触发卡片点击跳转
  if (event) event.stopPropagation();

  // 尝试获取计数元素 (首页卡片结构)
  const card = btn.closest('.card');
  const countSpan = card ? card.querySelector('span[title="点赞"]') : null;
  let originalCountText = '';
  
  if (countSpan) {
      originalCountText = countSpan.innerHTML;
  }

  try {
    // 1. 获取当前状态 (根据是否包含 active 类)
    const isActive = btn.classList.contains('active');
    
    // 2. 乐观 UI 更新 (Optimistic UI Update)
    if (isActive) {
      // 如果当前是激活状态 -> 变为非激活 (移除 active，图标变空心)
      btn.classList.remove('active');
      btn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`;
      // 乐观减少计数
      if (countSpan) {
          const currentCount = parseInt(countSpan.textContent.trim()) || 0;
          countSpan.innerHTML = `<i class="bi bi-heart-fill text-danger me-1"></i>${Math.max(0, currentCount - 1)}`;
      }
    } else {
      // 如果当前是非激活状态 -> 变为激活 (添加 active，图标变实心)
      btn.classList.add('active');
      btn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
      // 乐观增加计数
      if (countSpan) {
          const currentCount = parseInt(countSpan.textContent.trim()) || 0;
          countSpan.innerHTML = `<i class="bi bi-heart-fill text-danger me-1"></i>${currentCount + 1}`;
      }
    }

    // 3. 发送网络请求
    const res = await request(`/char/like/${id}`, { method: 'POST' });
    
    // 4. 状态一致性检查 (如果后端返回状态不一致，回滚 UI)
    if (res.isLiked !== !isActive) {
       console.warn('UI state mismatch, reverting...');
       if (res.isLiked) {
         btn.classList.add('active');
         btn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
       } else {
         btn.classList.remove('active');
         btn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`;
       }
    }

    // 5. 使用后端返回的准确计数更新
    if (res.likeCount !== undefined && countSpan) {
        countSpan.innerHTML = `<i class="bi bi-heart-fill text-danger me-1"></i>${res.likeCount}`;
    }
    
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('403') || e.message.includes('令牌') || e.message.includes('Token')) {
      if (confirm('您尚未登录或登录已过期，是否前往登录页？')) {
        window.location.href = '/pages/login.html';
      }
    } else {
      alert(e.message || '点赞失败');
    }
    // 发生错误，回滚 UI
    if (btn.classList.contains('active')) {
       btn.classList.remove('active');
       btn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`;
    } else {
       btn.classList.add('active');
       btn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
    }
    // 回滚计数
    if (countSpan && originalCountText) {
        countSpan.innerHTML = originalCountText;
    }
  }
}
window.likeChar = likeChar; // 暴露给全局

  // 2. 工作台 (workshop.html)
  async function initWorkshop() {
    const genBtn = document.querySelector('#genBtn');
    const selA = document.querySelector('#selectA');
    const selB = document.querySelector('#selectB');
    
    // 初始化下拉框数据 (获取所有角色)
    // 优先使用 available 接口获取（含联动角色），如果失败降级为 public
    request('/char/available').then(list => {
      fillSelects(list);
    }).catch(() => {
        request('/char/public').then(list => fillSelects(list));
    });

    function fillSelects(list) {
      if (!selA) return;
      list.forEach(o => {
        const opt = `<option value="${o.id}">${o.name}</option>`;
        selA.insertAdjacentHTML('beforeend', opt);
        selB.insertAdjacentHTML('beforeend', opt);
      });
    }

    // --- 头像上传预览逻辑 (集成裁剪) ---
    const avatarInput = document.querySelector('#charAvatarInput');
    const avatarPreview = document.querySelector('#charAvatarPreview');
    const cropModalEl = document.getElementById('cropModal');
    const cropImage = document.getElementById('cropImage');
    let cropper = null;

    if (avatarInput && avatarPreview && cropModalEl) {
      const cropModal = new bootstrap.Modal(cropModalEl);

      avatarInput.addEventListener('change', function() {
        const file = this.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = function(e) {
            cropImage.src = e.target.result;
            // 每次打开前先销毁旧的实例（如果有），防止重复
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            cropModal.show();
          };
          reader.readAsDataURL(file);
        }
      });

      cropModalEl.addEventListener('shown.bs.modal', () => {
          cropper = new Cropper(cropImage, {
              aspectRatio: 1,
              viewMode: 1,
              dragMode: 'move',
              autoCropArea: 1,
          });
      });

      cropModalEl.addEventListener('hidden.bs.modal', () => {
          if (cropper) {
              cropper.destroy();
              cropper = null;
          }
          // 如果取消了，input 仍保留原文件（虽然没剪裁）。
      });

      document.getElementById('cropConfirmBtn')?.addEventListener('click', () => {
          if (!cropper) return;
          
          cropper.getCroppedCanvas({
              width: 512,
              height: 512
          }).toBlob((blob) => {
              // 创建新文件对象
              const file = new File([blob], "avatar_cropped.jpg", { type: "image/jpeg" });
              
              // 使用 DataTransfer 更新 input.files
              const dataTransfer = new DataTransfer();
              dataTransfer.items.add(file);
              avatarInput.files = dataTransfer.files;
              
              // 更新预览
              avatarPreview.src = URL.createObjectURL(blob);
              
              cropModal.hide();
          }, 'image/jpeg');
      });
    }

    // 绑定“保存设定”按钮 (创建/更新 OC)
    const saveBtn = document.querySelector('#saveCharBtn');
    const tagKeyInput = document.querySelector('#tagKey');
    const tagValInput = document.querySelector('#tagVal');
    const addTagBtn = document.querySelector('#addTagBtn');
    const tagListEl = document.querySelector('#tagList');
    
    // 临时存储标签
    let currentTags = [];

    // 检查是否是编辑模式
    const params = new URLSearchParams(window.location.search);
    const editId = params.get('edit');
    if (editId) {
      // 加载已有数据
      try {
        const char = await request(`/char/${editId}`);
        document.querySelector('#charName').value = char.name;
        document.querySelector('#charGender').value = char.gender || '男';
        document.querySelector('#charAge').value = char.age || '';
        document.querySelector('#charAppearance').value = char.appearance || '';
        document.querySelector('#charBio').value = char.description || char.bio || '';
        
        // 恢复水印开关
        if (char.isWatermarkRequired) {
            const wSwitch = document.querySelector('#watermarkSwitch');
            const wCheck = document.querySelector('#watermarkCheck');
            if(wSwitch) wSwitch.checked = true;
            if(wCheck) wCheck.checked = true;
        }

        // 恢复图片预览
        if (char.image) {
          document.querySelector('#charAvatarPreview').src = getImgUrl(char.image, 'char');
        }

        // 恢复 Tags
        if (Array.isArray(char.tags)) {
          currentTags = char.tags;
          renderTags();
          
          // 尝试回填种族和职业到下拉框 (如果 tags 里有)
          const raceTag = currentTags.find(t => t.key === '种族');
          if (raceTag) document.querySelector('#charRace').value = raceTag.value;
          
          const jobTag = currentTags.find(t => t.key === '职业');
          if (jobTag) document.querySelector('#charJob').value = jobTag.value;
          
          const personalityTag = currentTags.find(t => t.key === '性格');
          if (personalityTag) document.querySelector('#charPersonality').value = personalityTag.value;
        }

        // 修改按钮状态
        if (saveBtn) {
          saveBtn.textContent = '更新设定';
          saveBtn.setAttribute('data-mode', 'update');
          saveBtn.setAttribute('data-id', editId);
        }
      } catch (e) {
        console.error('Failed to load char for edit:', e);
        showAlert('无法加载角色数据: ' + e.message);
      }
    }

    // 织梦生成逻辑 (genBtn 点击事件) - 重构为两阶段共创模式
    let selectedPath = ''; // 存储用户选中的走向
    let storyContext = ''; // 存储故事前半段上下文

    // --- 自定义走向逻辑 (Feature 1) ---
    const customPathInput = document.querySelector('#customPathInput');
    const useCustomPathBtn = document.querySelector('#useCustomPathBtn');
    
    useCustomPathBtn?.addEventListener('click', () => {
        const customPath = customPathInput.value.trim();
        if (!customPath) return alert('请先输入自定义走向描述');
        
        // 选中自定义走向
        selectedPath = customPath;
        
        // UI 反馈
        document.querySelectorAll('#optionList button').forEach(b => b.classList.remove('active', 'border-primary', 'bg-light'));
        useCustomPathBtn.classList.add('active', 'btn-dark');
        useCustomPathBtn.classList.remove('btn-outline-dark');
        useCustomPathBtn.textContent = '已选择自定义走向';
        
        // 启用确认按钮
        const confirmBtn = document.querySelector('#confirmPathBtn');
        if (confirmBtn) confirmBtn.disabled = false;
    });

    genBtn?.addEventListener('click', async () => {
      const charIdA = selA.value;
      const charIdB = selB.value;
      const keywords = document.querySelector('#keywords').value;
      
      // 获取新增参数
      const storyTone = document.querySelector('#storyTone').value.trim();
      const storyPeriod = document.querySelector('#storyPeriod').value.trim();
      
      if (!charIdA) return alert('请至少选择主角');
      if (!keywords) return alert('请输入场景关键词');

      // --- 第一阶段：获取灵感走向 ---
      // 1. UI 状态切换
      genBtn.disabled = true;
      genBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 正在寻找灵感...';
      document.querySelector('#loadingArea').classList.remove('d-none');
      document.querySelector('#loadingArea .text-muted').textContent = 'AI正在构思命运走向...';
      document.querySelector('#resultCard').classList.add('d-none');
      document.querySelector('#inspirationArea').classList.add('d-none'); // 确保先隐藏
      
      // 重置自定义走向状态
      if (useCustomPathBtn) {
          useCustomPathBtn.classList.remove('active', 'btn-dark');
          useCustomPathBtn.classList.add('btn-outline-dark');
          useCustomPathBtn.textContent = '使用此走向';
          if (customPathInput) customPathInput.value = '';
      }

      try {
        // 2. 请求 /propose-paths
        const res = await request('/story/propose-paths', {
          method: 'POST',
          body: { charIdA, charIdB, keywords, storyTone, storyPeriod }
        });

        // 3. 渲染选项
        const optionList = document.querySelector('#optionList');
        optionList.innerHTML = ''; // 清空旧选项
        selectedPath = ''; // 重置选中状态
        document.querySelector('#confirmPathBtn').disabled = true;

        if (res.options && Array.isArray(res.options)) {
            res.options.forEach((opt, index) => {
                // 使用 Bootstrap 按钮组风格 (Radio behavior)
                const btn = document.createElement('button');
                btn.className = 'btn btn-outline-secondary text-start p-3 position-relative';
                btn.innerHTML = `<span class="badge bg-light text-dark border me-2">${index + 1}</span>${opt}`;
                
                btn.onclick = () => {
                    // 移除其他按钮的 active 状态
                    optionList.querySelectorAll('button').forEach(b => b.classList.remove('active', 'border-primary', 'bg-light'));
                    // 重置自定义按钮状态
                    if (useCustomPathBtn) {
                        useCustomPathBtn.classList.remove('active', 'btn-dark');
                        useCustomPathBtn.classList.add('btn-outline-dark');
                        useCustomPathBtn.textContent = '使用此走向';
                    }
                    
                    // 激活当前按钮
                    btn.classList.add('active', 'border-primary', 'bg-light');
                    // 记录选择
                    selectedPath = opt;
                    // 启用确认按钮
                    document.querySelector('#confirmPathBtn').disabled = false;
                };
                
                optionList.appendChild(btn);
            });
        }

        // 4. 显示灵感区，隐藏 Loading
        document.querySelector('#loadingArea').classList.add('d-none');
        document.querySelector('#inspirationArea').classList.remove('d-none');
        
        // 恢复生成按钮 (或者保持禁用直到流程结束? 建议保持禁用以免重复点击)
        // genBtn.disabled = false; 
        genBtn.textContent = '✨ 重新构思'; // 允许用户如果不满意重新生成选项
        genBtn.disabled = false;

      } catch (error) {
        console.error('Propose Paths Failed:', error);
        showAlert('灵感获取失败: ' + error.message);
        genBtn.disabled = false;
        genBtn.textContent = '✨ 开始织梦';
        document.querySelector('#loadingArea').classList.add('d-none');
      }
    });

    // --- 第二阶段：分段式生成 (Feature 3) ---
    const confirmPathBtn = document.querySelector('#confirmPathBtn');
    const interactionZone = document.querySelector('#interactionZone');
    const userReactionInput = document.querySelector('#userReaction');
    const continueStoryBtn = document.querySelector('#continueStoryBtn');
    
    // 步骤 1: 开始编织 (前半段)
    confirmPathBtn?.addEventListener('click', async () => {
        if (!selectedPath) return alert('请先选择一个走向');

        const charIdA = selA.value;
        const charIdB = selB.value;
        const keywords = document.querySelector('#keywords').value;
        const storyTone = document.querySelector('#storyTone').value.trim();
        const storyPeriod = document.querySelector('#storyPeriod').value.trim();

        // 1. UI 状态切换
        confirmPathBtn.disabled = true;
        confirmPathBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 编织前半段...';
        document.querySelector('#inspirationArea').classList.add('d-none'); // 隐藏选项区
        document.querySelector('#loadingArea').classList.remove('d-none');
        document.querySelector('#loadingArea .text-muted').textContent = 'AI正在铺垫故事的冲突...';
        
        // 重置结果区
        document.querySelector('#resultPre').textContent = '';
        interactionZone.classList.add('d-none');

        try {
            // 2. 请求 /story/start (发送角色+走向+侧重)
            const res = await request('/story/start', {
                method: 'POST',
                body: { charIdA, charIdB, keywords, selectedPath, storyTone, storyPeriod }
            });
            
            storyContext = res.storySegment; // 保存前半段上下文

            // 3. 隐藏 Loading，显示结果
            document.querySelector('#loadingArea').classList.add('d-none');
            document.querySelector('#resultCard').classList.remove('d-none');

            // 渲染前半段 (打字机效果)
            const pre = document.querySelector('#resultPre');
            pre.classList.add('typewriter-cursor');
            
            await typeWriter(pre, storyContext);
            pre.classList.remove('typewriter-cursor');
            
            // 4. 暂停生成，等待用户输入交互反应 (Feature 3 - Pause Logic)
            // 显示交互气泡
            interactionZone.classList.remove('d-none');
            // 滚动到底部以便用户看到气泡
            interactionZone.scrollIntoView({ behavior: 'smooth' });
            
            confirmPathBtn.textContent = '前半段完成';

        } catch (error) {
            console.error('Story Start Failed:', error);
            showAlert('生成失败: ' + error.message);
            // 恢复状态以便重试
            document.querySelector('#loadingArea').classList.add('d-none');
            document.querySelector('#inspirationArea').classList.remove('d-none');
            confirmPathBtn.disabled = false;
            confirmPathBtn.textContent = '确认编织';
        }
    });
    
    // 步骤 2: 继续编织 (后半段)
    continueStoryBtn?.addEventListener('click', async () => {
        const userReaction = userReactionInput.value.trim();
        if (!userReaction) return alert('请描述角色的反应，AI 需要指引！');
        
        // 1. UI 状态切换
        continueStoryBtn.disabled = true;
        continueStoryBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 结局生成中...';
        
        try {
            // 2. 请求 /story/continue (发送前半段 + 用户反应)
            const res = await request('/story/continue', {
                method: 'POST',
                body: { 
                    prevContext: storyContext, 
                    userReaction: userReaction,
                    charIdA: selA.value, // 需要重新传ID以便后端关联
                    charIdB: selB.value
                }
            });
            
            const endingSegment = res.storySegment;
            
            // 3. 拼接显示后半段
            const pre = document.querySelector('#resultPre');
            
            // 添加分割线或换行
            pre.textContent += '\n\n（你的抉择改变了命运...）\n\n';
            
            pre.classList.add('typewriter-cursor');
            await typeWriter(pre, endingSegment);
            pre.classList.remove('typewriter-cursor');
            
            // 4. 结束流程
            interactionZone.classList.add('d-none'); // 隐藏交互区
            genBtn.disabled = false;
            genBtn.textContent = '✨ 再次织梦';
            confirmPathBtn.textContent = '确认编织'; // 重置按钮文本
            
            alert('✨ 完整梦境已收录到您的故事集中');
            
        } catch (error) {
            console.error('Story Continue Failed:', error);
            showAlert('续写失败: ' + error.message);
            continueStoryBtn.disabled = false;
            continueStoryBtn.innerHTML = '<i class="bi bi-play-circle me-1"></i> 继续编织';
        }
    });

    // 通用打字机函数
    function typeWriter(element, text) {
        return new Promise(resolve => {
            let i = 0;
            // 如果元素已有内容，从追加模式开始
            const startLen = element.textContent.length;
            
            function type() {
                if (i < text.length) {
                    element.textContent += text.charAt(i);
                    i++;
                    setTimeout(type, Math.random() * 15 + 5); // 稍微加快速度
                } else {
                    resolve();
                }
            }
            type();
        });
    }

    // 绑定“保存设定”按钮 (创建 OC)
    // 逻辑已前置定义
    
    // --- 标签系统逻辑 ---
    function renderTags() {
      if (!tagListEl) return;
      tagListEl.innerHTML = '';
      currentTags.forEach((t, i) => {
          const span = document.createElement('span');
          span.className = 'badge bg-light text-dark border me-2 mb-2 p-2';
          span.innerHTML = `${t.key}: ${t.value} <i class="bi bi-x ms-2" style="cursor:pointer;"></i>`;
          span.querySelector('i').addEventListener('click', () => {
              currentTags.splice(i, 1);
              renderTags();
          });
          tagListEl.appendChild(span);
      });
    }

    addTagBtn?.addEventListener('click', () => {
      const key = tagKeyInput.value.trim();
      const val = tagValInput.value.trim();
      if (key && val) {
        currentTags.push({ key, value: val });
        tagKeyInput.value = '';
        tagValInput.value = '';
        renderTags();
      }
    });

    // 数据采集与异步提交 (saveCharacter 逻辑)
    // 点击“保存设定”按钮时，采集姓名、性别、年龄、种族、职业、外貌描述、背景故事及标签数据
    // 使用 fetch 以 POST 方式将数据发送至 /api/char/add (Header 需携带 Token)
    saveBtn?.addEventListener('click', async () => {
      // 1. 数据采集
      const name = document.querySelector('#charName').value;
      const gender = document.querySelector('#charGender').value;
      const age = document.querySelector('#charAge').value;
      const race = document.querySelector('#charRace').value;
      const job = document.querySelector('#charJob').value;
      const personality = document.querySelector('#charPersonality').value;
      const appearance = document.querySelector('#charAppearance').value;
      const bio = document.querySelector('#charBio').value;
      const avatarFile = document.querySelector('#charAvatarInput').files[0];
      // 获取水印选项 (优先使用新开关)
      const isWatermarkRequired = document.querySelector('#watermarkSwitch')?.checked || document.querySelector('#watermarkCheck')?.checked;

      if (!name) return alert('请输入角色姓名');

      // 整合标签 (将种族、职业、性格加入 Tags)
      // 注意：如果是编辑模式，需要避免重复添加，这里简单起见每次都重新生成
      const finalTags = [...currentTags.filter(t => t.key !== '种族' && t.key !== '职业' && t.key !== '性格')];
      if (race) finalTags.push({ key: '种族', value: race });
      if (job) finalTags.push({ key: '职业', value: job });
      if (personality) finalTags.push({ key: '性格', value: personality });

      // 构造请求体 (使用 FormData 以支持图片上传)
      const formData = new FormData();
      formData.append('name', name);
      formData.append('gender', gender);
      formData.append('age', age);
      formData.append('description', bio); // 对应后端 description
      formData.append('appearance', appearance);
      formData.append('isPublic', 'true');
      formData.append('isWatermarkRequired', isWatermarkRequired); // 发送水印选项
      
      // 标记创作模式: 如果用户使用了 AI 辅助 (aiPolishBtn 被点击过)，则标记为 assisted，否则 manual
      // 这里通过检查全局变量 window.hasUsedAI 来判断 (需在 aiPolishBtn 点击时设置)
      const creationMode = window.hasUsedAI ? 'assisted' : 'manual';
      formData.append('creationMode', creationMode);

      // 复杂对象需转为 JSON 字符串
      formData.append('tags', JSON.stringify(finalTags));

      // 如果有图片，添加图片
      if (avatarFile) {
        formData.append('image', avatarFile);
      }

      const isUpdate = saveBtn.getAttribute('data-mode') === 'update';
      const updateId = saveBtn.getAttribute('data-id');

      try {
        saveBtn.disabled = true;
        if (!isUpdate) saveBtn.textContent = '保存中...';
        
        // 2. 异步提交
        const url = isUpdate ? `/char/update/${updateId}` : '/char/add';
        const method = isUpdate ? 'PUT' : 'POST';

        await request(url, {
          method: method,
          body: formData
        });

        // 如果是更新，直接跳转详情页；如果是新建，提示成功并刷新
        if (isUpdate) {
            location.href = 'detail.html?id=' + updateId;
        } else {
            await showAlert('✨ 角色创建成功！');
            location.reload(); 
        }
        
      } catch (error) {
        alert((isUpdate ? '更新失败: ' : '创建失败: ') + error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = isUpdate ? '更新设定' : '保存设定';
      }
    });

    // --- 沉浸编辑同步逻辑 ---
    const focusModalEl = document.getElementById('focusModal');
    const charBioInput = document.getElementById('charBio');
    const focusBioInput = document.getElementById('focusBioInput');

    if (focusModalEl && charBioInput && focusBioInput) {
      // 打开时同步：主编辑框 -> 沉浸框
      focusModalEl.addEventListener('show.bs.modal', () => {
        focusBioInput.value = charBioInput.value;
      });

      // 关闭时同步：沉浸框 -> 主编辑框
      focusModalEl.addEventListener('hide.bs.modal', () => {
        charBioInput.value = focusBioInput.value;
      });
      
      // 实时同步：防止意外关闭导致数据丢失
      focusBioInput.addEventListener('input', () => {
        charBioInput.value = focusBioInput.value;
      });
    }

    // --- 随机骰子逻辑 (智能升级版) ---
    const diceBtn = document.querySelector('#diceBtn');
    diceBtn?.addEventListener('click', async () => {
      const nameInput = document.querySelector('#charName');
      const raceInput = document.querySelector('#charRace');
      const jobInput = document.querySelector('#charJob');
      const name = nameInput.value.trim();
      const race = raceInput.value.trim();
      
      // 策略选择：如果用户只填了姓名（且种族为空），则触发 AI 智能建议
      // 注意：如果用户想使用【无】作为配角B，charIdB 将为空字符串，这里只校验 name
      if (name && !race) {
        try {
           diceBtn.disabled = true;
           diceBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 构思中...';
           
           const res = await request('/char/suggest', {
             method: 'POST',
             body: { name }
           });
           
           const aiSuggestion = res.aiSuggestion;
           if (aiSuggestion) {
             if (aiSuggestion.race) raceInput.value = aiSuggestion.race;
             if (aiSuggestion.job) jobInput.value = aiSuggestion.job;
             // 可选：如果返回了 personality，尝试添加到标签或提示用户
             if (aiSuggestion.personality) {
               // 简单起见，如果当前没有 tags，可以自动添加一个性格标签
               // 这里仅做 toast 提示或 log
               console.log('AI Suggested Personality:', aiSuggestion.personality);
               // 自动加入 Tags
               currentTags.push({ key: '性格', value: aiSuggestion.personality });
               
               // 同步到基础信息输入框
               const personalityInput = document.querySelector('#charPersonality');
               if (personalityInput) personalityInput.value = aiSuggestion.personality;

               renderTags();
             }
           }
        } catch (e) {
          console.error('Smart Dice Failed:', e);
          // 降级为随机逻辑
          applyRandomDice();
        } finally {
          diceBtn.disabled = false;
          diceBtn.innerHTML = '🎲 随机骰子';
        }
      } else {
        // 默认随机逻辑
        applyRandomDice();
      }
      
      function applyRandomDice() {
        const races = ['人类', '精灵', '兽人', '龙族', '机械生命', '亡灵'];
        const jobs = ['战士', '法师', '游侠', '刺客', '牧师', '吟游诗人'];
        const firstNames = ['亚瑟', '露娜', '凯尔', '艾薇', '索尔', '米娅'];
        const lastNames = ['风行者', '光辉', '暗影', '铁壁', '星语', '炎魔'];
        
        // 仅在空值时填充，避免覆盖用户已输入的内容 (除非是完全随机模式)
        // 这里保持原逻辑：覆盖式随机
        document.querySelector('#charName').value = `${firstNames[Math.floor(Math.random() * firstNames.length)]}·${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
        document.querySelector('#charAge').value = Math.floor(Math.random() * 80) + 16;
        document.querySelector('#charRace').value = races[Math.floor(Math.random() * races.length)];
        document.querySelector('#charJob').value = jobs[Math.floor(Math.random() * jobs.length)];
        document.querySelector('#charGender').value = ['男', '女', '其他'][Math.floor(Math.random() * 3)];
      }
    });

    // --- AI 润色逻辑 (上下文集成版) ---
    const aiPolishBtn = document.querySelector('#aiPolishBtn');
    
    // 暴露给全局以便 HTML onclick 调用
    window.polishWithInstruction = async (instruction) => {
        const btn = document.querySelector('#aiPolishBtn');
        if (btn) btn.click(instruction); // 触发主逻辑，传入 instruction
    };

    aiPolishBtn?.addEventListener('click', async (evtOrInstruction) => {
      const name = document.querySelector('#charName').value;
      const race = document.querySelector('#charRace').value;
      const job = document.querySelector('#charJob').value;
      const bio = document.querySelector('#charBio').value;
      const personality = document.querySelector('#charPersonality').value;
      const appearance = document.querySelector('#charAppearance').value;

      // 判断是否是指令调用 (如果第一个参数是字符串，说明是 onclick 传来的)
      const instruction = typeof evtOrInstruction === 'string' ? evtOrInstruction : '';

      if (!name) { showAlert('请先输入角色姓名'); return; }

      try {
        aiPolishBtn.disabled = true;
        aiPolishBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 润色中...';

        // 构建上下文对象
        const charContext = {
          name,
          race,
          job,
          bio,
          personality,
          appearance
        };
        
        // 调用新的润色接口
        const res = await request('/char/polish', {
          method: 'POST',
          body: { charContext, instruction }
        });

        // 处理返回的 JSON 对象 { bio, appearance }
        if (res.polishedText) {
          const { bio: newBio, appearance: newAppearance } = res.polishedText;
          
          const bioTarget = document.querySelector('#charBio');
          const focusBioTarget = document.getElementById('focusBioInput');
          const appTarget = document.querySelector('#charAppearance');
          
          // 清空
          bioTarget.value = '';
          if(focusBioTarget) focusBioTarget.value = '';
          appTarget.value = '';

          // 简单的逐字显现动画 (并行)
          function animateText(target, text, syncTarget) {
            let i = 0;
            function step() {
              if (i < text.length) {
                const current = text.slice(0, i + 1);
                target.value = current;
                if (syncTarget) syncTarget.value = current;
                i++;
                requestAnimationFrame(step); 
              }
            }
            step();
          }

          if (newBio) animateText(bioTarget, newBio, focusBioTarget);
          if (newAppearance) animateText(appTarget, newAppearance);

          // 显示反馈气泡
          document.querySelector('#polishFeedback')?.classList.remove('d-none');

          // 动画结束后恢复按钮
          setTimeout(() => {
             aiPolishBtn.disabled = false;
             aiPolishBtn.textContent = 'AI 润色';
          }, Math.max(newBio?.length || 0, newAppearance?.length || 0) * 16 + 500);
          
          return; 
        }

      } catch (error) {
        console.error('AI Polish Failed:', error);
        showAlert('AI 润色失败: ' + error.message);
        aiPolishBtn.disabled = false;
        aiPolishBtn.textContent = 'AI 润色';
      }
    });

    // --- 预览卡片逻辑 ---
    const previewBtn = document.querySelector('#previewCardBtn');
    previewBtn?.addEventListener('click', () => {
      const name = document.querySelector('#charName').value || '未命名';
      const bio = document.querySelector('#charBio').value || '暂无描述';
      
      // 获取当前预览的头像 (如果是默认占位图，则显示 Preview 文字)
      const avatarPreview = document.querySelector('#charAvatarPreview');
      let imgUrl = 'https://placehold.co/400?text=Preview';
      if (avatarPreview && !avatarPreview.src.includes('text=Upload')) {
        imgUrl = avatarPreview.src;
      }

      // 动态创建一个 Modal 进行预览
      const modalHtml = `
        <div class="modal fade" id="previewModal" tabindex="-1">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">角色卡片预览</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="card shadow-sm">
                  <img src="${imgUrl}" class="card-img-top" alt="${name}">
                  <div class="card-body">
                    <h5 class="card-title">${name}</h5>
                    <p class="card-text text-muted small">${bio.slice(0, 100)}...</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // 移除旧的 modal (如果有)
      const oldModal = document.getElementById('previewModal');
      if (oldModal) oldModal.remove();

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      const modal = new bootstrap.Modal(document.getElementById('previewModal'));
      modal.show();
    });
  }

  // 3. 详情页 (detail.html)
async function initDetail() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) return;

  try {
    // 调用新的详情接口
    const oc = await request(`/char/${id}`);
    
    if (!oc) throw new Error('角色不存在');

    // 填充数据
    document.querySelector('#name').textContent = oc.name;
    
    // 图片处理：
    // 1. 使用 correct 字段名 'image' (原代码误用了 avatar)
    // 2. 添加加载失败时的金色占位图
    const imgEl = document.querySelector('#avatar');
    imgEl.className = 'rounded avatar-frame'; // 应用新样式类
    imgEl.src = getImgUrl(oc.image, 'char');
    imgEl.onerror = function() {
      // 金色调默认占位图 (使用 Placehold.co)
      this.src = 'https://placehold.co/400/f0e68c/ffffff?text=Image+N/A';
      this.onerror = null; // 防止无限循环
    };

    document.querySelector('#appearance').textContent = oc.appearance || '暂无';
    document.querySelector('#background').textContent = oc.description || oc.bio || '暂无'; // 后端字段可能是 description

    // 填充性格 (从 Tags 中获取)
    const personalityTag = Array.isArray(oc.tags) ? oc.tags.find(t => t.key === '性格') : null;
    const traitsEl = document.querySelector('#traits');
    if (traitsEl) {
      traitsEl.textContent = personalityTag ? personalityTag.value : '暂无';
    }

    // 版权标识控制与防复制增强
    if (oc.isWatermarkRequired) {
        document.querySelector('#copyrightBadge').classList.remove('d-none');
        
        // 增强防复制逻辑 (覆盖详细设定区域的所有文本)
        // 目标：详细设定卡片的 body (使用 ID 选择器)
        const detailContainer = document.querySelector('#detailCard .card-body');
        
        if (detailContainer) {
            // 1. CSS 强力覆盖 (使用 style 注入以覆盖所有子元素)
            // 不仅给容器加，还注入全局样式强制覆盖其下所有子元素
            detailContainer.style.userSelect = 'none';
            detailContainer.style.webkitUserSelect = 'none';
            detailContainer.classList.add('no-select');
            
            // 动态创建 style 标签来强制覆盖子元素 (因为 user-select 虽然继承，但可能被子元素特定样式覆盖)
            const style = document.createElement('style');
            style.innerHTML = `
                #detailCard .card-body * {
                    user-select: none !important;
                    -webkit-user-select: none !important;
                }
            `;
            document.head.appendChild(style);

            // 2. JS 事件拦截
            const preventAction = (e) => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                return false; 
            };
            
            // 拦截更多事件
            const events = ['copy', 'cut', 'contextmenu', 'selectstart', 'dragstart', 'keydown', 'mousedown'];
            events.forEach(evt => {
                 detailContainer.addEventListener(evt, (e) => {
                     // 针对键盘事件的特殊处理
                     if (evt === 'keydown') {
                         if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'a')) {
                             preventAction(e);
                         }
                         return;
                     }
                     // 针对鼠标按下，如果是右键也拦截
                     if (evt === 'mousedown' && e.button === 2) {
                         preventAction(e);
                         return;
                     }
                     
                     preventAction(e);
                 }, true); // 使用捕获阶段 (true) 确保优先处理
            });
            
            // 额外：全局监听键盘，当鼠标在区域内时拦截 (防止先聚焦再按键)
            detailContainer.addEventListener('mouseenter', () => {
                 document.addEventListener('keydown', preventCopyGlobal);
            });
            detailContainer.addEventListener('mouseleave', () => {
                 document.removeEventListener('keydown', preventCopyGlobal);
            });
            
            function preventCopyGlobal(e) {
                 if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'a')) {
                     e.preventDefault();
                     e.stopPropagation();
                 }
            }
        }
    }
    
    // 原创性标识
    if (oc.creationMode === 'manual') {
        document.querySelector('#originalityBadge')?.classList.remove('d-none');
    }

    // 创作演化史 (History)
    if (oc.history && Array.isArray(oc.history) && oc.history.length > 0) {
        // 在详情卡片下方，详细设定上方插入历史记录
        const historyHtml = `
          <div class="card mt-3">
            <div class="card-header bg-light border-0 fw-bold text-secondary">
              <i class="bi bi-clock-history me-2"></i>创作演化路径
            </div>
            <div class="card-body">
              <div class="timeline">
                ${oc.history.map((h, i) => `
                  <div class="d-flex mb-3 position-relative">
                    <div class="flex-shrink-0 me-3">
                      <div class="rounded-circle bg-${h.action === 'create' ? 'success' : 'primary'} text-white d-flex align-items-center justify-content-center" style="width:32px;height:32px;font-size:14px;">
                        ${i + 1}
                      </div>
                      ${i < oc.history.length - 1 ? '<div class="vr position-absolute start-0 ms-3 mt-1 h-100" style="left:16px;z-index:-1;opacity:0.2;"></div>' : ''}
                    </div>
                    <div>
                      <div class="small text-muted">${new Date(h.timestamp).toLocaleString()}</div>
                      <div class="fw-semibold">${h.note || (h.action === 'create' ? '角色诞生' : '设定修订')}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
        document.querySelector('.card.mt-3').insertAdjacentHTML('beforebegin', historyHtml);
    }
    // 优化：详细设定区域背景
    document.querySelector('.card.mt-3 .card-body').classList.add('detail-section');
    
    // 渲染 Tags (及年龄)
    const tagWrap = document.querySelector('#tags');
    if (tagWrap) {
      let tagHtml = '';
      
      // 1. 添加年龄标签
      if (oc.age) {
        tagHtml += `<span class="badge rounded-pill border border-warning text-dark bg-transparent fw-normal me-2 mb-2 p-2">
          年龄: ${oc.age}
         </span>`;
      }

      // 2. 添加其他标签
      if (Array.isArray(oc.tags)) {
        tagHtml += oc.tags.map(t => 
          `<span class="badge rounded-pill border border-warning text-dark bg-transparent fw-normal me-2 mb-2 p-2">
            ${t.key}: ${t.value}
           </span>`
        ).join('');
      }
      
      tagWrap.innerHTML = tagHtml;
    }

    // --- 角色故事索引 (新增) ---
    // 逻辑：加载与该角色相关的所有故事
    // 策略：优先尝试 /char/:id/stories 接口，如果失败则尝试获取所有故事并根据 RID (Character ID) 过滤
    const storyGrid = document.querySelector('#charStoryGrid');
    if (storyGrid) {
      try {
          // 尝试调用专用接口
          let stories = [];
          try {
             stories = await request(`/char/${id}/stories`);
          } catch (apiErr) {
             console.warn('Dedicated stories API failed, fallback to manual filter:', apiErr);
             // 降级策略：获取所有故事 (或者公开故事列表) 并过滤
             // 注意：这在数据量大时效率低，仅作 Bootstrap 演示用
             // 假设 request('/story/public') 获取公开故事
             const allStories = await request('/story/public').catch(() => []);
             // 过滤条件：participants 数组中包含当前角色 ID (rid 或 id)
             stories = allStories.filter(s => 
                 s.participants && s.participants.some(p => String(p.id || p.rid) === String(id))
             );
          }
          
          if (stories && stories.length > 0) {
              storyGrid.innerHTML = stories.map(story => `
                <div class="col">
                  <div class="card h-100 shadow-sm border-0" onclick="location.href='story.html?id=${story.id}'" style="cursor:pointer; background: #fffdf5;">
                    <div class="card-body">
                      <div class="h6 text-truncate mb-2" title="${story.title}" style="color: #8a6d3b;">
                        <i class="bi bi-book-half me-2"></i>${story.title || '无题梦境'}
                      </div>
                      <p class="text-muted small mb-0 text-truncate-2">${story.content ? story.content.slice(0, 60) : ''}...</p>
                      <div class="mt-2 text-end text-muted" style="font-size: 0.75rem;">
                         ${new Date(story.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              `).join('');
              const countBadge = document.querySelector('#storyCountBadge');
              if(countBadge) countBadge.textContent = stories.length;
          }
      } catch (e) {
          console.warn('Load char stories failed', e);
      }
    }

  } catch (error) {
    console.error('Detail Load Error:', error);
    alert('加载详情失败: ' + error.message);
  }

  // --- 社交功能初始化 (Social Features) ---
  const likeBtn = document.querySelector('#likeBtn');
  const likeCountEl = document.querySelector('#likeCount');
  const commentInput = document.querySelector('#commentInput');
  const postBtn = document.querySelector('#postBtn');
  const commentListEl = document.querySelector('#commentList');

  const toCommentBtn = document.querySelector('#toCommentBtn');
  
  // 1. 获取社交数据
  async function loadSocial() {
    try {
      const res = await request(`/char/${id}/social`);
      
      // 更新点赞状态 (Square Button Logic)
      const isLiked = res.isLiked;
      
      // 更新评论数 Badge
      const countBadge = document.querySelector('#commentCountBadge');
      if (countBadge) {
          // 优先使用后端返回的准确计数，如果未返回则回退到列表长度
          const count = res.commentsCount !== undefined ? res.commentsCount : res.commentList.length;
          countBadge.textContent = count;
      }
      
      if (isLiked) {
        likeBtn.classList.add('active');
        likeBtn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
      } else {
        likeBtn.classList.remove('active');
        likeBtn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`; // 空心图标
      }

      // 渲染评论列表
      renderComments(res.commentList);

    } catch (e) {
      console.warn('Load Social Failed:', e);
    }
  }

  // 滚动到评论区 (移除 toCommentBtn 监听，因为按钮已删除)
  // toCommentBtn?.addEventListener('click', ...);

  function renderComments(list) {
    if (!list || list.length === 0) {
      commentListEl.innerHTML = '<li class="list-group-item text-center text-muted border-0 py-4">暂无评论，快来抢沙发吧~</li>';
      return;
    }
    
    // 使用 commentTmpl 模板渲染
    commentListEl.innerHTML = list.map(c => {
      // 头像占位符 (如果是真实项目，这里应该有 userAvatar 字段)
      const avatarUrl = 'https://placehold.co/100?text=' + (c.author?.username?.[0] || 'U');
      
      return `
      <li class="list-group-item border-0 border-bottom comment-item py-3">
        <div class="d-flex gap-3">
          <img src="${avatarUrl}" class="rounded-circle comment-avatar object-fit-cover" alt="User">
          <div class="flex-grow-1">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-bold text-dark small">${c.author?.username || '神秘访客'}</span>
              <span class="text-muted small" style="font-size: 12px;">${new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p class="mb-0 text-secondary" style="font-size: 14px; line-height: 1.6;">${c.content}</p>
          </div>
        </div>
      </li>
    `}).join('');
  }

  // 2. 点赞事件 (Detail Page)
  likeBtn?.addEventListener('click', async () => {
    try {
      // 1. 获取当前状态
      const isActive = likeBtn.classList.contains('active');
      
      // 2. 乐观更新
      if (isActive) {
        likeBtn.classList.remove('active');
        likeBtn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`;
        if (likeCountEl) {
            const current = parseInt(likeCountEl.textContent) || 0;
            likeCountEl.textContent = Math.max(0, current - 1);
        }
      } else {
        likeBtn.classList.add('active');
        likeBtn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
        if (likeCountEl) {
            const current = parseInt(likeCountEl.textContent) || 0;
            likeCountEl.textContent = current + 1;
        }
      }

      // 3. 发送请求
      const res = await request(`/char/like/${id}`, { method: 'POST' });
      
      // 4. 校准与更新
      if (res.isLiked !== !isActive) {
         console.warn('Like status mismatch, reverting UI');
         loadSocial(); 
      } else {
         // 即使状态一致，也同步最新的点赞数
         if (res.likeCount !== undefined && likeCountEl) {
             likeCountEl.textContent = res.likeCount;
         }
      }
      
    } catch (e) {
      if (e.message.includes('401') || e.message.includes('403') || e.message.includes('令牌') || e.message.includes('Token')) {
         if (confirm('您尚未登录或登录已过期，是否前往登录页？')) {
           window.location.href = '/pages/login.html';
         }
      } else {
         alert(e.message || '点赞失败');
      }
      loadSocial();
    }
  });

  // --- 联动申请逻辑 ---
  const applyBtn = document.querySelector('#applyBtn');
  const applyModalEl = document.getElementById('applyModal');
  const confirmApplyBtn = document.getElementById('confirmApplyBtn');
  const agreementCheck = document.getElementById('agreementCheck');
  let applyModal;

  if (applyModalEl) {
      applyModal = new bootstrap.Modal(applyModalEl);
  }

  applyBtn?.addEventListener('click', () => {
      applyModal?.show();
  });

  confirmApplyBtn?.addEventListener('click', async () => {
      if (!agreementCheck.checked) {
          alert('请勾选“我承诺尊重对方 OC 版权”协议');
          return;
      }
      
      try {
          confirmApplyBtn.disabled = true;
          confirmApplyBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 提交中...';
          
          // 发送申请 (假设接口 POST /link/request)
          await request('/link/request', {
              method: 'POST',
              body: { targetCharId: id }
          });
          
          alert('✅ 申请已提交，请等待对方审批');
          applyModal.hide();
      } catch (e) {
          alert('申请失败: ' + e.message);
      } finally {
          confirmApplyBtn.disabled = false;
          confirmApplyBtn.textContent = '提交申请';
      }
  });

  // --- 导出图片功能 ---
  const exportBtn = document.querySelector('#exportImgBtn');
  exportBtn?.addEventListener('click', async () => {
      try {
          exportBtn.disabled = true;
          exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 生成中...';
          
          // 选择要截图的区域：包含顶部卡片和详细设定卡片
          // 这里我们创建一个临时的容器将两者包裹起来，或者分别截图拼接，
          // 为了简单效果好，我们可以克隆这两个卡片到一个隐藏容器中进行截图
          
          // 1. 准备截图容器
          const captureContainer = document.createElement('div');
          captureContainer.style.position = 'fixed';
          captureContainer.style.top = '-9999px';
          captureContainer.style.left = '-9999px';
          captureContainer.style.width = '800px'; // 固定宽度保证排版
          captureContainer.style.backgroundColor = '#f8f9fa'; // 背景色
          captureContainer.style.padding = '40px';
          
          // 2. 克隆内容
          const card1 = document.querySelector('.card').cloneNode(true); // 顶部卡片
          const card2 = document.querySelector('#detailCard').cloneNode(true); // 详细设定
          
          // 移除按钮等不需要的元素
          card1.querySelector('.ms-auto')?.remove(); 
          
          // 注入版权水印
          const watermarkDiv = document.createElement('div');
          watermarkDiv.className = 'text-center text-muted mt-4 small';
          watermarkDiv.innerHTML = 'Generated by www.aureadream.xyz · 禁止盗用';
          
          captureContainer.appendChild(card1);
          captureContainer.appendChild(document.createElement('br'));
          captureContainer.appendChild(card2);
          captureContainer.appendChild(watermarkDiv);
          
          document.body.appendChild(captureContainer);
          
          // 3. 等待图片加载 (如果有)
          const imgs = captureContainer.querySelectorAll('img');
          await Promise.all(Array.from(imgs).map(img => {
              if (img.complete) return Promise.resolve();
              return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
          }));
          
          // 4. 执行截图
          const canvas = await html2canvas(captureContainer, {
              useCORS: true, // 允许跨域图片
              scale: 2, // 高清
              backgroundColor: '#f4f6f9'
          });
          
          // 5. 触发下载
          const charName = document.querySelector('#name')?.textContent || 'OC';
          const link = document.createElement('a');
          link.download = `${charName}_Card.png`;
          link.href = canvas.toDataURL('image/png');
          link.click();
          
          // 6. 清理
          document.body.removeChild(captureContainer);
          
      } catch (e) {
          console.error('Export Image Failed:', e);
          showAlert('导出图片失败: ' + e.message);
      } finally {
          exportBtn.disabled = false;
          exportBtn.textContent = '导出图片';
      }
  });

  // 3. 发布评论
  postBtn?.addEventListener('click', async () => {
    const content = commentInput.value.trim();
    if (!content) return alert('请输入评论内容');

    let isProcessing = true; // 处理状态锁

    try {
      postBtn.disabled = true;
      postBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
      
      // 模拟插入 (Optimistic UI): 立即显示在列表顶部
      // 注意：这里没有真实 ID 和时间，仅作视觉反馈
      const tempId = 'temp-' + Date.now();
      const currentUser = { username: '我' }; // 假设当前用户
      
      // 如果之前是空状态，先清空
      if (commentListEl.innerHTML.includes('暂无评论')) {
        commentListEl.innerHTML = '';
      }

      const tempHtml = `
        <li id="${tempId}" class="list-group-item border-0 border-bottom comment-item py-3 bg-light">
          <div class="d-flex gap-3">
            <img src="https://placehold.co/100?text=Me" class="rounded-circle comment-avatar object-fit-cover">
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold text-dark small">我 (发送中...)</span>
                <span class="text-muted small">刚刚</span>
              </div>
              <p class="mb-0 text-secondary">${content}</p>
            </div>
          </div>
        </li>
      `;
      commentListEl.insertAdjacentHTML('afterbegin', tempHtml);
      commentInput.value = ''; // 清空输入框

      // 发送真实请求
      const res = await request(`/char/comment/${id}`, {
        method: 'POST',
        body: { content }
      });
      
      // 请求成功，移除临时节点，重新加载列表 (或替换临时节点为真实节点)
      // 为简单起见，这里重新加载列表以确保时间戳和用户信息准确
      document.getElementById(tempId)?.remove();
      loadSocial();
      
    } catch (e) {
      if (e.message.includes('401') || e.message.includes('403') || e.message.includes('令牌') || e.message.includes('Token')) {
         if (confirm('您尚未登录或登录已过期，是否前往登录页？')) {
           window.location.href = '/pages/login.html';
         }
      } else {
         alert('评论失败: ' + e.message);
      }
      // 移除临时节点并恢复输入
      const tempNode = commentListEl.querySelector('.bg-light'); // 假设只有一个临时节点
      if(tempNode) tempNode.remove();
      commentInput.value = content;
    } finally {
      isProcessing = false;
      postBtn.disabled = false;
      postBtn.textContent = '发布';
    }
  });

  // 初始加载
  loadSocial();
}

// 4. 登录页 (login.html) - 已迁移至 auth.js
  // function initLogin() { ... }
  
  // 5. 个人中心 (profile.html)
  async function initProfile() {
    const myOcGrid = document.querySelector('#myOcGrid');
    const myStoryGrid = document.querySelector('#myStoryGrid');
    const reqTbody = document.querySelector('#reqTbody');
    
    // --- 个人信息逻辑 ---
    const userAvatarEl = document.querySelector('#userAvatar');
    const userNicknameEl = document.querySelector('#userNickname');
    const userNameEl = document.querySelector('#userName');
    const avatarInput = document.querySelector('#userAvatarInput');
    
    // 加载个人信息
    try {
        const res = await request('/auth/me');
        if (res.success && res.user) {
            const u = res.user;
            if (userNicknameEl) userNicknameEl.textContent = u.nickname || '未设置昵称';
            if (userNameEl) userNameEl.textContent = `@${u.username}`;
            if (userAvatarEl) userAvatarEl.src = getImgUrl(u.avatar, 'avatar');
        }
    } catch (e) {
        console.error('Load Profile Failed:', e);
    }
    
    // 头像上传
    avatarInput?.addEventListener('change', async () => {
        const file = avatarInput.files[0];
        if (!file) return;
        
        // 预览
        const reader = new FileReader();
        reader.onload = e => userAvatarEl.src = e.target.result;
        reader.readAsDataURL(file);
        
        // 上传
        const formData = new FormData();
        formData.append('avatar', file);
        
        try {
            await request('/auth/profile', { method: 'PUT', body: formData });
            showAlert('头像更新成功');
        } catch (e) {
            showAlert('头像上传失败: ' + e.message);
        }
    });
    
    // 昵称编辑
    window.editNickname = async () => {
        const current = userNicknameEl.textContent;
        const newName = prompt('请输入新昵称:', current === '未设置昵称' ? '' : current);
        if (newName !== null && newName.trim() !== '') {
            try {
                await request('/auth/profile', { 
                    method: 'PUT', 
                    body: { nickname: newName.trim() } 
                });
                userNicknameEl.textContent = newName.trim();
                showAlert('昵称已更新');
            } catch (e) {
                showAlert('昵称更新失败: ' + e.message);
            }
        }
    };
    
    // 退出登录
    window.logout = () => {
        if (confirm('确定要退出登录吗？')) {
            localStorage.removeItem('token');
            location.href = '../pages/login.html';
        }
    };

    if (!myOcGrid) return; // 确保在个人中心页

    // --- 数据加载 ---
    try {
      // 1. 获取我的 OC 库
      // 调用 /api/char/my 接口，Token 由 request 函数自动携带
      const myChars = await request('/char/my');
      
      // 2. 渲染 OC 卡片
      myOcGrid.innerHTML = '';
      if (myChars.length === 0) {
        myOcGrid.innerHTML = `<div class="col-12 text-center text-muted py-5">暂无角色，快去工作台创造一个吧！</div>`;
      } else {
        myChars.forEach(char => {
          const imgUrl = getImgUrl(char.image || char.avatar);
          const cardHtml = `
            <div class="col">
              <div class="card h-100 shadow-sm hover-lift" onclick="location.href='detail.html?id=${char.id}'" style="cursor:pointer;">
                <div class="row g-0 h-100">
                  <div class="col-4">
                    <img src="${imgUrl}" class="img-fluid rounded-start h-100 object-fit-cover" alt="${char.name}" onerror="this.src='https://placehold.co/200?text=No+Image'">
                  </div>
                  <div class="col-8">
                    <div class="card-body d-flex flex-column h-100 py-2">
                      <h5 class="card-title text-truncate mb-1">${char.name}</h5>
                      <p class="card-text text-muted small mb-auto">${char.tags?.find(t=>t.key==='职业')?.value || '自由职业'}</p>
                      
                      <!-- 隐私状态切换开关 -->
                      <div class="form-check form-switch mt-2" onclick="event.stopPropagation()">
                        <input class="form-check-input" type="checkbox" id="privacySwitch_${char.id}" ${char.isPublic !== false ? 'checked' : ''} onchange="togglePrivacy(${char.id}, this.checked)">
                        <label class="form-check-label small text-muted" for="privacySwitch_${char.id}">
                          ${char.isPublic !== false ? '公开' : '私密'}
                        </label>
                      </div>

                      <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-outline-primary btn-sm flex-fill" onclick="event.stopPropagation(); location.href='workshop.html?edit=${char.id}'">编辑</button>
                        <button class="btn btn-outline-danger btn-sm" onclick="event.stopPropagation(); deleteChar(${char.id})">删除</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
          myOcGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
      }

      // 3. 获取我的故事集
      const myStories = await request('/story/my');
      
      // 4. 渲染故事卡片
      myStoryGrid.innerHTML = '';
      
      // 过滤掉已归档的故事 (假设 status === 'archived' 为归档状态)
      // 后端返回的数据如果包含 status 字段
      const activeStories = myStories.filter(s => s.status !== 'archived');
      
      if (activeStories.length === 0) {
        myStoryGrid.innerHTML = `<div class="col-12 text-center text-muted py-3">暂无故事，去工作台“织梦”吧</div>`;
      } else {
        activeStories.forEach(story => {
          const cardHtml = `
            <div class="col">
              <div class="card h-100">
                <div class="card-body position-relative">
                  <!-- 右上角参与者标签 -->
                  <div class="position-absolute top-0 end-0 m-2">
                     ${story.participants?.map(p => `
                       <span class="badge bg-warning text-dark border border-light shadow-sm mb-1" title="RID: ${p.rid || 'N/A'}">
                         ${p.name} <small class="text-muted" style="font-size:0.7em;">${p.rid || ''}</small>
                       </span>
                     `).join('<br>') || ''}
                  </div>
                  
                  <div class="h6 text-truncate pe-4" title="${story.title}">${story.title}</div>
                  <p class="text-muted small mb-2 text-truncate-2 mt-3">${story.content.slice(0, 50)}...</p>
                  <div class="d-flex gap-2">
                    <button class="btn btn-primary btn-sm" onclick="location.href='story.html?id=${story.id}'">预览</button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="archiveStory(${story.id})">归档</button>
                    <button class="btn btn-outline-danger btn-sm" onclick="deleteStory(${story.id})">删除</button>
                  </div>
                </div>
              </div>
            </div>
          `;
          myStoryGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
      }

      // 5. 获取联动审批列表 (需补充 /api/request/my 接口)
      // 暂时用 try-catch 包裹以防接口未就绪报错影响页面
      try {
        // 请求 /api/link/my (根据 link.js 路由前缀)
        const reqList = await request('/link/my');
        
        reqTbody.innerHTML = '';
        if (reqList.length === 0) {
          reqTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">暂无待处理申请</td></tr>`;
        } else {
          reqList.forEach(req => {
            const statusBadge = {
              'pending': '<span class="badge text-bg-warning">待审批</span>',
              'approved': '<span class="badge text-bg-success">已通过</span>',
              'rejected': '<span class="badge text-bg-secondary">已拒绝</span>'
            }[req.status] || req.status;

            const rowHtml = `
              <tr>
                <td>用户 #${req.senderId}</td>
                <td>OC #${req.targetCharId}</td>
                <td>${new Date(req.createdAt).toLocaleDateString()}</td>
                <td>${statusBadge}</td>
                <td>
                  ${req.status === 'pending' ? `
                    <button class="btn btn-sm btn-success me-1" onclick="handleReq(${req.id}, 'approved')">通过</button>
                    <button class="btn btn-sm btn-danger" onclick="handleReq(${req.id}, 'rejected')">拒绝</button>
                  ` : '-'}
                </td>
              </tr>
            `;
            reqTbody.insertAdjacentHTML('beforeend', rowHtml);
          });
        }
      } catch (e) {
        console.warn('Load Requests Failed:', e);
      }

    } catch (error) {
      console.error('Profile Init Failed:', error);
      // 如果是 Token 失效 (401/403)，request 函数内部通常会抛出错误
      if (error.message.includes('401') || error.message.includes('403')) {
        alert('登录已过期，请重新登录');
        location.href = '../login.html';
      }
    }
  }

  // --- 辅助动作函数 ---
  window.deleteChar = async (id) => {
    if (!(await showConfirm('确定要删除这个角色吗？此操作不可恢复。'))) return;
    try {
      await request(`/char/${id}`, { method: 'DELETE' });
      await showAlert('角色删除成功');
      initProfile(); // 重新加载列表
    } catch (e) {
      showAlert('删除失败: ' + e.message);
    }
  };

  // 隐私切换
  window.togglePrivacy = async (id, isPublic) => {
    try {
      // 乐观更新 UI 文字
      const label = document.querySelector(`label[for="privacySwitch_${id}"]`);
      if(label) label.textContent = isPublic ? '公开' : '私密';

      await request(`/char/update/${id}`, { 
        method: 'PUT', 
        body: { isPublic: isPublic.toString() } 
      });
      // console.log('Privacy updated');
    } catch (e) {
      showAlert('设置失败: ' + e.message);
      // 回滚
      const sw = document.getElementById(`privacySwitch_${id}`);
      if(sw) {
        sw.checked = !isPublic;
        const label = document.querySelector(`label[for="privacySwitch_${id}"]`);
        if(label) label.textContent = !isPublic ? '公开' : '私密';
      }
    }
  };

  // 删除故事
  window.deleteStory = async (id) => {
    if (!(await showConfirm('确定要将这段记忆从梦境中抹去吗？此操作不可恢复。'))) return;
    try {
      await request(`/story/${id}`, { method: 'DELETE' });
      await showAlert('记忆已抹去');
      initProfile(); // 重新加载列表
    } catch (e) {
      showAlert('删除失败: ' + e.message);
    }
  };

  // 归档故事
  window.archiveStory = async (id) => {
    if (!confirm('确定要将此故事归档吗？归档后故事不会删除，但将不再显示在您的“故事集”中。')) return;
    try {
      await request(`/story/${id}/archive`, { method: 'PATCH' });
      alert('已归档');
      initProfile(); // 重新加载列表
    } catch (e) {
      alert('归档失败: ' + e.message);
    }
  };

  window.handleReq = async (reqId, status) => {
    try {
      await request(`/link/request/${reqId}`, {
        method: 'PUT',
        body: { status, userId: 1 } // userId 需动态获取，此处由 Token 解析，body 可不传 userId
      });
      alert('操作成功');
      location.reload();
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
  };

  // 6. 故事阅读页 (story.html)
  async function initStory() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (!id) {
      alert('未指定故事ID');
      location.href = 'profile.html';
      return;
    }

    const storyArea = document.querySelector('#storyArea');
    const errorArea = document.querySelector('#errorArea');
    const loading = document.querySelector('#loading');
    
    // 元素引用
    const titleEl = document.querySelector('#storyTitle');
    const timeEl = document.querySelector('#storyTime');
    const contentEl = document.querySelector('#storyContent');
    const charListEl = document.querySelector('#charList');
    
    if (!storyArea) return; // 不在故事页

    try {
      // 获取详情
      const story = await request(`/story/${id}`);
      
      // 填充数据
      titleEl.textContent = story.title || '无题梦境';
      timeEl.textContent = new Date(story.createdAt).toLocaleString();
      contentEl.textContent = story.content; // 使用 textContent 保持格式 (pre-wrap)

      // 渲染参与角色头像
      if (story.participants && story.participants.length > 0) {
        charListEl.innerHTML = story.participants.map(char => {
            const img = getImgUrl(char.image, 'char');
            return `<img src="${img}" class="char-avatar-small" title="${char.name}" alt="${char.name}">`;
        }).join('');
      }

      // 显示内容
      loading.classList.add('d-none');
      storyArea.classList.remove('d-none');

    } catch (e) {
      console.error('Story Load Failed:', e);
      loading.classList.add('d-none');
      errorArea.classList.remove('d-none');
    }

    // --- 故事卡片生成 (新增) ---
    const genCardBtn = document.querySelector('#genCardBtn');
    genCardBtn?.addEventListener('click', async () => {
        if (typeof html2canvas === 'undefined') return alert('组件加载中，请稍候再试');
        
        try {
            genCardBtn.disabled = true;
            const originalText = genCardBtn.innerHTML;
            genCardBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 生成中...';
            
            // 准备截图区域 (克隆以避免影响当前视图)
            const storyContainer = document.querySelector('.story-container');
            const clone = storyContainer.cloneNode(true);
            
            // 样式调整
            clone.style.width = '800px'; // 固定宽度
            clone.style.position = 'fixed';
            clone.style.top = '-9999px';
            clone.style.left = '-9999px';
            clone.style.zIndex = '10000';
            clone.style.height = 'auto';
            clone.style.overflow = 'visible';
            clone.style.background = '#fffdf5'; // 确保背景色
            
            // 移除不需要的元素
            clone.querySelector('#loading')?.remove();
            clone.querySelector('#errorArea')?.remove();
            
            // 添加水印
            const wm = document.createElement('div');
            wm.className = 'text-center text-muted mt-5 mb-3 small';
            wm.innerHTML = '<div style="border-top: 1px solid rgba(0,0,0,0.1); width: 50%; margin: 20px auto;"></div>Generated by 流金梦坊 · 织梦者';
            clone.appendChild(wm);
            
            document.body.appendChild(clone);
            
            // 等待图片加载
            const imgs = clone.querySelectorAll('img');
            await Promise.all(Array.from(imgs).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
            }));
            
            // 截图
            const canvas = await html2canvas(clone, {
                useCORS: true,
                scale: 2, // 高清
                backgroundColor: '#fffdf5'
            });
            
            // 下载
            const link = document.createElement('a');
            const title = document.querySelector('#storyTitle')?.textContent?.trim() || `Story_${id}`;
            link.download = `${title}_Card.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            document.body.removeChild(clone);
            
            // 恢复按钮
            genCardBtn.innerHTML = originalText;
            genCardBtn.disabled = false;
            
        } catch (e) {
            console.error('Card Gen Failed:', e);
            alert('生成失败: ' + e.message);
            genCardBtn.disabled = false;
            genCardBtn.innerHTML = '<i class="bi bi-card-image"></i> 生成卡片';
        }
    });
  }

  // --- 全局入口 ---
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.getAttribute('data-page');
    if (page === 'home') initHome();
    if (page === 'workshop') initWorkshop();
    if (page === 'detail') initDetail();
    if (page === 'profile') initProfile();
    if (page === 'story') initStory();
  });
