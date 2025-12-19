const express = require('express');
const router = express.Router();
const Character = require('../models/character');
// 引入 AI 服务，用于后续辅助生成 OC 详情 (如：自动补全外貌、生成简介)
const { buildChar } = require('../services/aiService');
const { exportDoc, uploadImg } = require('../utils/fileService');
const multer = require('multer');
const { Op } = require('sequelize'); // 引入 Sequelize 操作符

// 配置内存存储，方便直接将 Buffer 传给 OSS
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- API: 获取广场列表 (OC 广场) ---
// 功能：展示公开的 OC 角色，供用户浏览和寻找联动对象。
// 逻辑：默认只查询 isPublic: true 的角色，按创建时间倒序排列。
router.get('/public', async (req, res) => {
  try {
    // 按创建时间倒序查询所有公开角色
    // 可扩展：支持按 likes 倒序查询热门角色
    const list = await Character.findAll({
      where: { isPublic: true },
      order: [['createdAt', 'DESC']],
      // 注意：sequelize 中关联查询需要 include，这里暂时省略 User 关联
      // include: [{ model: User, as: 'owner', attributes: ['username', 'avatar'] }]
    });

    res.json(list);
  } catch (error) {
    console.error('Get Public Chars Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API: 创建角色 (捏人) ---
// 功能：用户提交基础信息，创建属于自己的 OC。
// 扩展：未来可结合 buildChar 函数，通过 AI 自动丰富角色设定。
router.post('/add', async (req, res) => {
  try {
    const data = req.body;
    // 假设 req.user.id 是通过鉴权中间件解析出来的当前用户 ID
    // 暂时用 req.body.owner 模拟
    const ownerId = data.owner || req.body.userId; 

    if (!ownerId) {
      return res.status(401).json({ error: 'Unauthorized: Missing owner ID' });
    }

    // --- 标签处理 ---
    // 确保 tags 是一个合法的对象数组，结构如 [{key: 'MBTI', value: 'INTJ'}]
    // 如果前端传的是 JSON 字符串，尝试解析；如果不是数组，赋为空数组以防报错
    let tags = data.tags;
    if (typeof tags === 'string') {
        try {
            tags = JSON.parse(tags);
        } catch (e) {
            tags = [];
        }
    }
    if (!Array.isArray(tags)) {
        tags = [];
    }

    // 使用 Sequelize 的 create 方法
    const savedChar = await Character.create({
      ownerId: ownerId, // 注意字段名变化: owner -> ownerId
      name: data.name,
      gender: data.gender,
      age: data.age,
      avatar: data.avatar,
      intro: data.intro,
      appearance: data.appearance, // 外貌描述
      personality: data.personality, // 性格细节
      bio: data.bio || data.background, // 字段名已统一为 bio
      tags: tags, // 存储处理后的自定义标签 (JSON)
      isPublic: data.isPublic || false // 默认私密
    });

    res.status(201).json({ message: 'Character created successfully', char: savedChar });

  } catch (error) {
    console.error('Create Char Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
    console.error('Generate Bio Failed:', error);
    res.status(500).json({ error: 'Failed to generate character bio' });
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
    console.error('Export Char Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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

    // 调用 utils/fileService.js 中的 uploadImg 服务
    // 该服务会自动处理文件名重命名（防重名）和路径拼接
    const resUrl = await uploadImg(file.buffer, file.originalname);

    res.json({ 
      message: 'Upload successful', 
      url: resUrl 
    });

  } catch (error) {
    console.error('Upload Failed:', error);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// --- API: 点赞角色 (Like Character) ---
// 功能：增加指定 OC 的点赞数。
// 作用：用户在广场浏览时，点击爱心即可触发，热度越高的角色越容易被推荐。
router.post('/like/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 逻辑：原子操作更新 likes 字段，并发安全
    // Sequelize increment 方法
    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    await char.increment('likes', { by: 1 });
    // increment 后需要重新 reload 才能获取最新值，或者直接返回 char.likes + 1
    const updatedChar = await char.reload();

    // 反馈：返回最新的点赞数，供前端实时刷新 UI
    res.json({ 
      message: 'Liked successfully', 
      count: updatedChar.likes 
    });

  } catch (error) {
    console.error('Like Char Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
