const express = require('express');
const router = express.Router();
const Character = require('../models/character');
const jwt = require('jsonwebtoken'); // 引入 JWT 用于鉴权
const { buildChar, polishBio, suggestProfile } = require('../services/aiService');
const { exportDoc, upload } = require('../utils/fileService'); // 引入已配置好的 upload 中间件 (DiskStorage)
// const multer = require('multer'); // 不再需要单独引入 multer
const { Op } = require('sequelize');

// --- 中间件: JWT 身份验证 ---
// 用于保护需要登录才能访问的接口 (如 /add, /update)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // 格式: Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  // 验证 Token (注意：生产环境应将密钥存入 .env)
  jwt.verify(token, 'secret_key_123456', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    req.user = user; // 将解析出的用户信息 (id, username) 挂载到 req 对象
    next();
  });
};

// 移除旧的内存存储配置
// const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });

// --- API: 获取广场列表 (OC 广场) ---
// 功能：展示公开的 OC 角色，供用户浏览和寻找联动对象。
// 逻辑：默认只查询 isPublic: true 的角色，按创建时间倒序排列。
router.get('/public', async (req, res) => {
  try {
    const list = await Character.findAll({
      where: { isPublic: true },
      order: [['createdAt', 'DESC']], // 按创建时间倒序
    });

    res.json(list);
  } catch (error) {
    console.error('获取广场角色失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取我的角色 (My OCs) ---
// 功能：获取当前登录用户创建的所有 OC 角色。
// 作用：用于个人中心展示和管理。
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const list = await Character.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });
    res.json(list);
  } catch (error) {
    console.error('获取我的角色失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 创建角色 (捏人) ---
// 权限：需要登录 (authenticateToken)
// 使用 multer 处理图片上传 (字段名: image)
router.post('/add', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const data = req.body;
    // 1. Token 解析：从鉴权中间件解析出的 user 对象中获取 userId
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Invalid User ID from token' });
    }

    // 2. 图片保存路径处理
    // 如果有上传文件，multer 会自动保存并挂载到 req.file
    let imgUrl = '';
    if (req.file) {
        // 构造可访问的 URL 路径 (对应 app.js 中的静态托管配置)
        imgUrl = `/uploads/${req.file.filename}`;
    }

    // --- 标签处理 (兼容逻辑) ---
    let tags = data.tags;
    if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
    }
    if (!Array.isArray(tags)) tags = [];

    // 3. 数据库保存 (Data Persistence)
    // 使用 Sequelize 将 OC 设定存入 Characters 表
    // 包含姓名、性别、年龄、外貌、背景(description)及自定义标签
    const newChar = await Character.create({
      userId: userId,        // 关联用户 ID
      name: data.name,
      description: data.description, // 角色设定 (背景故事)
      image: imgUrl,         // 立绘路径
      isPublic: data.isPublic === 'true' || data.isPublic === true, // 确保布尔值正确
      
      // 保留其他可选字段以兼容旧逻辑
      gender: data.gender,
      age: data.age,
      intro: data.intro, // 简介
      appearance: data.appearance, // 外貌
      personality: data.personality,
      tags: tags // 存储种族、职业等标签信息
    });

    res.status(201).json({ success: true, data: newChar });

  } catch (error) {
    console.error('创建角色失败:', error);
    // 增强报错信息：打印 SQL 错误代码和字段
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeDatabaseError') {
      console.error('SQL Error Code:', error.parent ? error.parent.errno : 'Unknown');
      console.error('SQL Message:', error.parent ? error.parent.sqlMessage : error.message);
    }
    res.status(500).json({ success: false, error: '服务器内部错误，无法创建角色' });
  }
});

// --- API: 更新角色 ---
// 权限：需要登录且是角色的拥有者
router.put('/update/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const userId = req.user.id;

    // 1. 查找角色
    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }

    // 2. 权限校验：只能修改自己的角色
    if (char.userId !== userId) {
      return res.status(403).json({ success: false, error: 'You do not have permission to edit this character' });
    }

    // 3. 图片处理
    let imgUrl = char.image;
    if (req.file) {
        imgUrl = `/uploads/${req.file.filename}`;
    }

    // 4. 处理标签
    let tags = data.tags;
    if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
    }
    // 如果没有传 tags，则保持原样；如果传了且不是数组，设为空
    if (data.tags !== undefined && !Array.isArray(tags)) tags = [];

    // 5. 更新字段
    await char.update({
      name: data.name || char.name,
      description: data.description || char.description,
      image: imgUrl,
      isPublic: data.isPublic !== undefined ? (data.isPublic === 'true' || data.isPublic === true) : char.isPublic,
      
      // 兼容字段更新
      gender: data.gender || char.gender,
      age: data.age || char.age,
      intro: data.intro || char.intro,
      appearance: data.appearance || char.appearance,
      personality: data.personality || char.personality,
      tags: tags !== undefined ? tags : char.tags,
    });

    res.json({ success: true, message: '角色更新成功', data: char });

  } catch (error) {
    console.error('更新角色失败:', error);
    if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeDatabaseError') {
      console.error('SQL Error Code:', error.parent ? error.parent.errno : 'Unknown');
      console.error('SQL Message:', error.parent ? error.parent.sqlMessage : error.message);
    }
    res.status(500).json({ success: false, error: '服务器内部错误，无法更新角色' });
  }
});

// --- API: 智能补全人设 (AI 辅助) ---
// 功能：用户提供姓名和性格，调用 DeepSeek API 补全角色的外貌描述和背景故事。
// 作用：降低创作门槛，为用户提供灵感。
router.post('/generate-bio', async (req, res) => {
  try {
    const { name, personality, keywords } = req.body;
    
    // 简单的输入校验
    if (!name && !personality && !keywords) {
      return res.status(400).json({ error: 'Please provide at least a name, personality or keywords.' });
    }

    // 组装输入信息
    const info = `姓名：${name || '未命名'}，性格：${personality || '未知'}，关键词：${keywords || '无'}`;
    
    // 调用 services/aiService.js 中的 buildChar 函数
    // buildChar 内部已经封装了 System Prompt 和 JSON 解析逻辑
    // 它会引导 AI 以‘流金梦坊的织梦者’身份，生成梦幻且富有文学感的设定
    const aiRes = await buildChar(info);

    // 直接返回 AI 生成的结果给前端预览
    // 前端展示后，用户可以选择“应用”或“重新生成”
    res.json(aiRes);

  } catch (error) {
    console.error('生成人设失败:', error);
    res.status(500).json({ error: '无法生成角色设定' });
  }
});

// --- API: 角色润色 (AI Polish) ---
router.post('/polish', async (req, res) => {
  try {
    const { charContext } = req.body;
    if (!charContext) {
      return res.status(400).json({ error: 'Missing character context' });
    }
    
    // 调用 aiService.js 中的 polishBio
    const polishedText = await polishBio(charContext);
    
    res.json({ polishedText });
  } catch (error) {
    console.error('润色失败:', error);
    res.status(500).json({ error: '无法润色文本' });
  }
});

// --- API: 智能设定建议 (AI Suggest) ---
router.post('/suggest', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    
    // 调用 aiService.js 中的 suggestProfile
    const aiSuggestion = await suggestProfile(name);
    
    res.json({ aiSuggestion });
  } catch (error) {
    console.error('建议失败:', error);
    res.status(500).json({ error: '无法生成建议' });
  }
});

// --- API: 导出角色档案 (Export Doc) ---
// 功能：根据 ID 查找 OC 完整信息，生成 Markdown 文件供用户下载。
// 作用：让用户可以本地保存自己心爱的角色设定。
router.get('/export/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. 数据提取 (Sequelize findByPk)
    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 2. 格式化逻辑
    // 调用 utils/fileService.js 中的 exportDoc 函数
    // 该函数会将 OC 的基础信息、核心设定及自定义标签 (tags) 转换为排版精美的 Markdown 文本
    // 尤其注意 tags 数组会被转化为表格形式，提升阅读体验
    const fileBuffer = exportDoc(char);
    const fileName = `${encodeURIComponent(char.name)}_设定存档.md`;

    // 3. 文件推送
    // 设置响应头，告知浏览器这是一个需要下载的文件
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    // 将 Buffer 直接写入响应流
    res.send(fileBuffer);

  } catch (error) {
    console.error('导出角色失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 图片上传 (Upload Avatar) ---
// 功能：接收前端上传的图片文件，转发至阿里云 OSS。
// 流程：Multer 解析 -> 校验文件 -> OSS 上传 -> 返回 URL
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // 文件已由 multer 自动保存到 utils/fileService.js 配置的 UPLOAD_DIR
    // 直接构造返回 URL
    const resUrl = `/uploads/${file.filename}`;

    res.json({ 
      message: '图片上传成功', 
      url: resUrl 
    });

  } catch (error) {
    console.error('上传图片失败:', error);
    res.status(500).json({ error: '图片上传失败' });
  }
});

// --- API: 点赞角色 (Like Character) ---
// 功能：增加指定 OC 的点赞数。
// 作用：用户在广场浏览时，点击爱心即可触发，热度越高的角色越容易被推荐。
const { Like, Comment, User } = require('../models');

router.post('/like/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. 查找角色
    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 2. 检查点赞状态 (Toggle Logic)
    const existingLike = await Like.findOne({
      where: { userId, charId: id }
    });

    let isLiked = false;

    if (existingLike) {
      // 如果已点赞，则取消 (Destroy)
      await existingLike.destroy();
      // 减少计数 (decrement)
      if (char.likes > 0) {
        await char.decrement('likes', { by: 1 });
      }
      isLiked = false;
    } else {
      // 如果未点赞，则创建 (Create)
      await Like.create({ userId, charId: id });
      // 增加计数 (increment)
      await char.increment('likes', { by: 1 });
      isLiked = true;
    }

    // 获取最新计数
    const updatedChar = await char.reload();

    // 反馈：返回最新的点赞数和状态
    res.json({ 
      success: true,
      message: isLiked ? '已点赞' : '已取消点赞', 
      likeCount: updatedChar.likes,
      isLiked: isLiked
    });

  } catch (error) {
    console.error('点赞失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 提交评论 (Submit Comment) ---
router.post('/comment/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 创建评论
    const newComment = await Comment.create({
      userId,
      charId: id,
      content: content.trim()
    });

    // 返回带有用户信息的评论，方便前端渲染
    const commentWithUser = await Comment.findByPk(newComment.id, {
      include: [{ model: User, as: 'author', attributes: ['username', 'id'] }]
    });

    res.json({
      success: true,
      message: '评论成功',
      data: commentWithUser
    });

  } catch (error) {
    console.error('评论失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取社交数据 (Get Social Info) ---
// 获取角色的点赞数、评论列表、以及当前用户的点赞状态
router.get('/:id/social', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 尝试获取当前用户 ID (如果是登录用户)
    // 注意：这是一个公开接口，但也需要适配登录态来判断 isLiked
    let currentUserId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, 'secret_key_123456');
        currentUserId = decoded.id;
      } catch (e) { /* Ignore invalid token */ }
    }

    // 1. 获取角色及点赞数
    const char = await Character.findByPk(id);
    if (!char) return res.status(404).json({ error: 'Character not found' });

    // 2. 获取评论列表 (倒序)
    const commentList = await Comment.findAll({
      where: { charId: id },
      include: [{ model: User, as: 'author', attributes: ['username', 'id'] }],
      order: [['createdAt', 'DESC']]
    });

    // 3. 判断当前用户是否已点赞
    let isLiked = false;
    if (currentUserId) {
      const like = await Like.findOne({ where: { userId: currentUserId, charId: id } });
      isLiked = !!like;
    }

    res.json({
      likeCount: char.likes,
      isLiked: isLiked,
      commentList: commentList
    });

  } catch (error) {
    console.error('获取社交数据失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取角色详情 ---
// 功能：获取单个角色的详细信息
// 修复：确保 image 字段返回正确的相对路径
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 排除特殊关键词 (防止与 my, public, add 等路由冲突，虽然 Express 按顺序匹配，但多一层保障)
    if (['my', 'public', 'add', 'upload', 'generate-bio'].includes(id)) {
      return res.status(404).json({ error: 'Invalid Character ID' });
    }

    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 处理图片路径
    // 如果数据库只存了文件名 (如 "123.jpg")，补全为 "/uploads/123.jpg"
    // 如果已经是 "/uploads/..." 或 "http..." 则保持不变
    let imgUrl = char.image;
    if (imgUrl && !imgUrl.startsWith('/') && !imgUrl.startsWith('http')) {
      imgUrl = `/uploads/${imgUrl}`;
    }
    
    // 构造返回数据 (不直接修改数据库实例，而是返回处理后的 JSON)
    const charData = char.toJSON();
    charData.image = imgUrl;

    res.json(charData);

  } catch (error) {
    console.error('获取角色详情失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = router;
