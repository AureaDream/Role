// --- 基础配置 ---
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = isLocal ? 'http://localhost:3000/api' : 'http://120.79.120.7:3000/api';

/**
 * 通用 Fetch 封装
 * @param {string} endpoint - 接口路径 (如 '/char/public')
 * @param {Object} options - fetch 配置项
 * @returns {Promise<any>} - 返回解析后的 JSON 数据
 */
async function request(endpoint, options = {}) {
  try {
    const url = `${API_BASE}${endpoint}`;
    
    // 默认 Header 设置
    if (!options.headers) {
      options.headers = {};
    }
    // 如果有 body 且不是 FormData (上传文件)，则默认设置为 JSON
    if (options.body && !(options.body instanceof FormData)) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, options);
    const data = await res.json();

    // 统一错误处理：如果后端返回 { success: false, msg: ... }
    if (data.success === false) {
      alert(`请求失败: ${data.msg}`);
      throw new Error(data.msg);
    }

    // 如果后端直接返回数组或不带 success 字段的对象，也视为成功
    return data;

  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    // 避免重复 alert
    if (!err.message.includes('请求失败')) {
        alert('网络连接异常，请检查服务器是否启动。');
    }
    throw err;
  }
}

// --- 核心功能接口 ---

/**
 * 1. 获取广场列表 (OC 广场)
 * 对应后端路由: GET /api/char/public
 * 作用: 获取所有公开的角色列表，用于首页展示
 */
async function getChars() {
  return await request('/char/public');
}

/**
 * 2. 创建 OC (捏人)
 * 对应后端路由: POST /api/char/add
 * @param {Object} charData - 包含 name, gender, age, tags 等信息的对象
 * 作用: 提交用户填写的表单，保存新角色
 */
async function addChar(charData) {
  return await request('/char/add', {
    method: 'POST',
    body: charData
  });
}

/**
 * 3. 织梦生成故事 (AI 创作)
 * 对应后端路由: POST /api/story/create
 * @param {Array} charIds - 参与角色的 ID 数组
 * @param {string} scene - 场景描述关键词
 * @param {string} userId - 当前用户 ID (用于权限校验)
 * 作用: 调用 DeepSeek 生成互动短剧
 */
async function generateStory(charIds, scene, userId) {
  return await request('/story/create', {
    method: 'POST',
    body: { charIds, scene, userId }
  });
}

// --- 扩展功能接口 (按需使用) ---

/**
 * 4. AI 智能补全人设
 * 对应后端路由: POST /api/char/generate-bio
 * @param {string} name - 角色名
 * @param {string} personality - 性格
 * @param {string} keywords - 关键词
 */
async function generateBio(name, personality, keywords) {
  return await request('/char/generate-bio', {
    method: 'POST',
    body: { name, personality, keywords }
  });
}

/**
 * 5. 点赞角色
 * 对应后端路由: POST /api/char/like/:id
 * @param {string} id - 角色 ID
 */
async function likeChar(id) {
  return await request(`/char/like/${id}`, {
    method: 'POST'
  });
}

/**
 * 6. 图片上传
 * 对应后端路由: POST /api/char/upload
 * @param {File} file - 图片文件对象
 */
async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);
  
  return await request('/char/upload', {
    method: 'POST',
    body: formData
  });
}

// 导出接口供其他 JS 文件使用
// 如果不使用模块化，这些函数默认挂载在 window 上
window.api = {
  getChars,
  addChar,
  generateStory,
  generateBio,
  likeChar,
  uploadImage
};
