// --- 基础配置 ---
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isLocal ? 'http://localhost:3000/api' : 'http://120.79.120.7:3000/api';
const HOST_BASE = isLocal ? 'http://localhost:3000' : 'http://120.79.120.7:3000';

// --- 辅助函数：图片路径处理 ---
function getImgUrl(path) {
  if (!path) return 'https://placehold.co/400?text=No+Image';
  if (path.startsWith('http')) return path;
  
  // 修复：自动检测并拼接 /uploads/ 前缀
  // 如果数据库存的是 "123.jpg"，需要拼成 "/uploads/123.jpg" 再拼 HOST_BASE
  // 如果存的是 "/uploads/123.jpg"，直接拼 HOST_BASE
  let cleanPath = path;
  if (!cleanPath.startsWith('/') && !cleanPath.includes('uploads')) {
      cleanPath = `/uploads/${cleanPath}`;
  }
  
  return `${HOST_BASE}${cleanPath.startsWith('/') ? '' : '/'}${cleanPath}`;
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
      const imgUrl = getImgUrl(char.image || char.avatar);

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
}

// 点赞功能处理函数
async function likeChar(id, btn) {
  // 阻止冒泡，防止触发卡片点击跳转
  if (event) event.stopPropagation();

  try {
    // 1. 获取当前状态 (根据是否包含 active 类)
    const isActive = btn.classList.contains('active');
    
    // 2. 乐观 UI 更新 (Optimistic UI Update)
    if (isActive) {
      // 如果当前是激活状态 -> 变为非激活 (移除 active，图标变空心)
      btn.classList.remove('active');
      btn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`;
    } else {
      // 如果当前是非激活状态 -> 变为激活 (添加 active，图标变实心)
      btn.classList.add('active');
      btn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
    }

    // 3. 发送网络请求
    const res = await request(`/char/like/${id}`, { method: 'POST' });
    
    // 4. 状态一致性检查 (如果后端返回状态不一致，回滚 UI)
    // res.isLiked 是后端最新的真实状态
    // !isActive 是我们期望的新状态
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
    
  } catch (e) {
    if (e.message.includes('401') || e.message.includes('403') || e.message.includes('令牌') || e.message.includes('Token')) {
      if (confirm('您尚未登录或登录已过期，是否前往登录页？')) {
        window.location.href = '/pages/login.html';
      }
    } else {
      alert(e.message || '点赞失败');
    }
    // 发生错误，回滚 UI (由于无法获知原状态，这里只能简单移除 active，或者重新加载列表)
    // 简单回滚：如果是 active，移除；反之亦然 (假设失败意味着操作未生效)
    if (btn.classList.contains('active')) {
       btn.classList.remove('active');
       btn.innerHTML = `<i class="bi bi-hand-thumbs-up"></i>`;
    } else {
       btn.classList.add('active');
       btn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
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
    request('/char/public').then(list => {
      if (!selA) return;
      list.forEach(o => {
        const opt = `<option value="${o.id}">${o.name}</option>`;
        selA.insertAdjacentHTML('beforeend', opt);
        selB.insertAdjacentHTML('beforeend', opt);
      });
    });

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
        
        // 恢复图片预览
        if (char.image) {
          document.querySelector('#charAvatarPreview').src = getImgUrl(char.image);
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

    // 织梦生成逻辑 (genBtn 点击事件)
    // 1. 点击后显示 loadingArea (删除 d-none 类)
    // 2. 调用 /api/story/generate 接口
    // 3. 成功后隐藏 Loading，显示 resultCard 并将返回的故事填入 resultPre
    genBtn?.addEventListener('click', async () => {
      const charIdA = selA.value;
      const charIdB = selB.value;
      const keywords = document.querySelector('#keywords').value;
      
      // 允许配角B为空 (单人故事模式)
      if (!charIdA) return alert('请至少选择主角');
      if (!keywords) return alert('请输入场景关键词');

      // 显示 Loading
      genBtn.disabled = true;
      genBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 正在织梦...';
      document.querySelector('#loadingArea').classList.remove('d-none');
      document.querySelector('#resultCard').classList.add('d-none');

      try {
        // 调用后端生成接口
        const res = await request('/story/generate', {
          method: 'POST',
          body: { charIdA, charIdB, keywords }
        });

        // 隐藏 Loading，显示结果
        document.querySelector('#loadingArea').classList.add('d-none');
        document.querySelector('#resultCard').classList.remove('d-none');
        
        // 渲染故事内容 (打字机效果)
        const text = res.story.content;
        const pre = document.querySelector('#resultPre');
        pre.textContent = '';
        pre.classList.add('typewriter-cursor'); // 添加光标
        
        let i = 0;
        function type() {
          if (i < text.length) {
            const char = text.charAt(i);
            // 处理换行符，如果是普通文本容器需要用 <br>，如果是 pre-wrap 则不需要
            // 这里我们保持 textContent 以利用 white-space: pre-wrap
            pre.textContent += char;
            i++;
            // 随机打字速度，模拟真实感
            const delay = Math.random() * 30 + 10;
            setTimeout(type, delay);
          } else {
            pre.classList.remove('typewriter-cursor'); // 移除光标
            genBtn.disabled = false;
            genBtn.textContent = '✨ 再次生成';
            
            // 提示用户已自动保存
            alert('✨ 梦境已收录到您的故事集中');
          }
        }
        type();

      } catch (error) {
        console.error('Generate Story Failed:', error);
        showAlert('生成失败: ' + error.message);
        genBtn.disabled = false;
        genBtn.textContent = '✨ 开始织梦';
        document.querySelector('#loadingArea').classList.add('d-none');
      }
    });

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
      const appearance = document.querySelector('#charAppearance').value;
      const bio = document.querySelector('#charBio').value;
      const avatarFile = document.querySelector('#charAvatarInput').files[0];

      if (!name) return alert('请输入角色姓名');

      // 整合标签 (将种族和职业加入 Tags)
      // 注意：如果是编辑模式，需要避免重复添加，这里简单起见每次都重新生成
      const finalTags = [...currentTags.filter(t => t.key !== '种族' && t.key !== '职业')];
      if (race) finalTags.push({ key: '种族', value: race });
      if (job) finalTags.push({ key: '职业', value: job });

      // 构造请求体 (使用 FormData 以支持图片上传)
      const formData = new FormData();
      formData.append('name', name);
      formData.append('gender', gender);
      formData.append('age', age);
      formData.append('description', bio); // 对应后端 description
      formData.append('appearance', appearance);
      formData.append('isPublic', 'true');
      
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
        saveBtn.textContent = isUpdate ? '更新中...' : '保存中...';
        
        // 2. 异步提交
        const url = isUpdate ? `/char/update/${updateId}` : '/char/add';
        const method = isUpdate ? 'PUT' : 'POST';

        await request(url, {
          method: method,
          body: formData
        });

        await showAlert(isUpdate ? '✨ 角色更新成功！' : '✨ 角色创建成功！');
        
        // 如果是更新，返回个人中心；如果是新建，刷新页面
        if (isUpdate) {
            location.href = 'profile.html';
        } else {
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
    aiPolishBtn?.addEventListener('click', async () => {
      const name = document.querySelector('#charName').value;
      const race = document.querySelector('#charRace').value;
      const job = document.querySelector('#charJob').value;
      const bio = document.querySelector('#charBio').value;

      if (!name) return alert('请先输入角色姓名');

      try {
        aiPolishBtn.disabled = true;
        aiPolishBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 润色中...';

        // 尝试从标签中提取性格
        const personalityTag = currentTags.find(t => t.key === '性格' || t.key === 'Personality');
        const personality = personalityTag ? personalityTag.value : '';

        // 构建上下文对象
        const charContext = {
          name,
          race,
          job,
          bio,
          personality
        };
        
        // 调用新的润色接口
        const res = await request('/char/polish', {
          method: 'POST',
          body: { charContext }
        });

        if (res.polishedText) {
          const polished = res.polishedText;
          const target = document.querySelector('#charBio');
          const focusTarget = document.getElementById('focusBioInput');
          
          // 简单的逐字显现动画 (不阻塞 UI)
          let currentText = '';
          let i = 0;
          const speed = 15;
          
          target.value = ''; // 清空
          if(focusTarget) focusTarget.value = '';

          function typeWriter() {
            if (i < polished.length) {
              currentText += polished.charAt(i);
              target.value = currentText;
              if (focusTarget) focusTarget.value = currentText;
              i++;
              requestAnimationFrame(() => setTimeout(typeWriter, speed));
            } else {
               aiPolishBtn.disabled = false;
               aiPolishBtn.textContent = 'AI 润色';
            }
          }
          typeWriter();
          
          // 不要在 finally 里立即重置按钮，交给动画结束回调
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
    imgEl.src = getImgUrl(oc.image);
    imgEl.onerror = function() {
      // 金色调默认占位图 (使用 Placehold.co)
      this.src = 'https://placehold.co/400/f0e68c/ffffff?text=Image+N/A';
      this.onerror = null; // 防止无限循环
    };

    document.querySelector('#appearance').textContent = oc.appearance || '暂无';
    document.querySelector('#background').textContent = oc.description || oc.bio || '暂无'; // 后端字段可能是 description
    
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
      } else {
        likeBtn.classList.add('active');
        likeBtn.innerHTML = `<i class="bi bi-hand-thumbs-up-fill"></i>`;
      }

      // 3. 发送请求
      const res = await request(`/char/like/${id}`, { method: 'POST' });
      
      // 4. 校准
      if (res.isLiked !== !isActive) {
         console.warn('Like status mismatch, reverting UI');
         loadSocial(); 
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
              <div class="card h-100 shadow-sm">
                <div class="row g-0 h-100">
                  <div class="col-4">
                    <img src="${imgUrl}" class="img-fluid rounded-start h-100 object-fit-cover" alt="${char.name}" onerror="this.src='https://placehold.co/200?text=No+Image'">
                  </div>
                  <div class="col-8">
                    <div class="card-body d-flex flex-column h-100 py-2">
                      <h5 class="card-title text-truncate mb-1">${char.name}</h5>
                      <p class="card-text text-muted small mb-auto">${char.tags?.find(t=>t.key==='职业')?.value || '自由职业'}</p>
                      <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-outline-primary btn-sm flex-fill" onclick="location.href='workshop.html?edit=${char.id}'">编辑</button>
                        <button class="btn btn-outline-danger btn-sm" onclick="deleteChar(${char.id})">删除</button>
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
      // 需后端支持 DELETE 接口
      showAlert('删除功能需后端支持 DELETE /char/:id');
    } catch (e) {
      showAlert('删除失败');
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
            const img = getImgUrl(char.image);
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
