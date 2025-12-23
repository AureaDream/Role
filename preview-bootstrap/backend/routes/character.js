const express = require('express');
const router = express.Router();
const Character = require('../models/character');
const jwt = require('jsonwebtoken'); // 引入 JWT 用于鉴权
const { buildChar, polishBio, suggestProfile } = require('../services/aiService');
const { exportDoc, upload } = require('../utils/fileService'); // 引入已配置好的 upload 中间件 (DiskStorage)
// const multer = require('multer'); // 不再需要单独引入 multer
const { Op } = require('sequelize');
const sharp = require('sharp'); // 引入图片处理库
const path = require('path');
const fs = require('fs');

// --- 中间件: JWT 身份验证 ---
// 用于保护需要登录才能访问的接口 (如 /add, /update)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // 格式: Bearer <token>

  if (!token) {
    return res.status(401).json({ error: '哎呀呀，授权用的令牌不见了！' });
  }

  // 验证 Token (注意：生产环境应将密钥存入 .env)
  jwt.verify(token, 'secret_key_123456', (err, user) => {
    if (err) {
      return res.status(403).json({ error: '令牌好像是无效或过期的哦' });
    }
    req.user = user; // 将解析出的用户信息 (id, username) 挂载到 req 对象
    next();
  });
};

// --- Multer 调试中间件 ---
// 包装 upload.single 以捕获错误并打印日志
const uploadMiddleware = (req, res, next) => {
  console.log(`[Multer] Start processing upload for ${req.path}`);
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('[Multer] Error:', err);
      return res.status(400).json({ error: '文件上传失败: ' + err.message });
    }
    console.log('[Multer] Success. File:', req.file ? req.file.filename : 'None', 'Body keys:', Object.keys(req.body));
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

    // 尝试获取当前用户 ID (用于判断 isLiked)
    let currentUserId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, 'secret_key_123456'); // 注意：密钥应与 authenticateToken 一致
        currentUserId = decoded.id;
      } catch (e) { /* Ignore */ }
    }

    // 构造返回数据 (不直接修改数据库实例，而是返回处理后的 JSON)
    let result = list.map(c => {
        const json = c.toJSON();
        // 列表页也使用动态预览接口 (或者为了性能可以使用缩略图接口，这里统一用 view)
        if (json.image && !json.image.startsWith('http')) {
             json.image = `/api/char/view/${c.id}`;
        }
        return json;
    });

    if (currentUserId) {
        const charIds = result.map(c => c.id);
        const likes = await Like.findAll({
            where: {
                userId: currentUserId,
                charId: { [Op.in]: charIds }
            }
        });
        const likedCharIds = new Set(likes.map(l => l.charId));
        
        result = result.map(c => ({
            ...c,
            isLiked: likedCharIds.has(c.id)
        }));
    }

    res.json(result);
  } catch (error) {
    console.error('获取广场角色失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取热门角色 (Hot OCs) ---
// 逻辑：近一周内的【1*点赞数+2*评论数】得出【热度值】
router.get('/hot', async (req, res) => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // 1. 获取所有公开角色
    const chars = await Character.findAll({
      where: { isPublic: true },
      attributes: ['id', 'name', 'description', 'image', 'likes', 'commentsCount', 'intro']
    });

    // 2. 统计近一周的点赞和评论
    // 优化：使用聚合查询
    const recentLikes = await Like.findAll({
      where: { createdAt: { [Op.gt]: oneWeekAgo } },
      attributes: ['charId', [sequelize.fn('COUNT', 'charId'), 'count']],
      group: ['charId']
    });
    
    const recentComments = await Comment.findAll({
      where: { createdAt: { [Op.gt]: oneWeekAgo } },
      attributes: ['charId', [sequelize.fn('COUNT', 'charId'), 'count']],
      group: ['charId']
    });

    // 3. 构建映射
    const likeMap = {};
    recentLikes.forEach(l => likeMap[l.charId] = parseInt(l.dataValues.count || 0));
    
    const commentMap = {};
    recentComments.forEach(c => commentMap[c.charId] = parseInt(c.dataValues.count || 0));

    // 4. 计算热度并排序
    const hotList = chars.map(c => {
        const l = likeMap[c.id] || 0;
        const cm = commentMap[c.id] || 0;
        const heat = l * 1 + cm * 2;
        
        const json = c.toJSON();
        // 统一使用 view 接口以支持水印和权限控制
        if (json.image && !json.image.startsWith('http')) {
             json.image = `/api/char/view/${c.id}`;
        }

        return {
            ...json,
            heatValue: heat
        };
    });

    // 排序：热度降序 -> 总点赞降序
    hotList.sort((a, b) => {
        if (b.heatValue !== a.heatValue) return b.heatValue - a.heatValue;
        return b.likes - a.likes;
    });

    // 取前 3
    res.json(hotList.slice(0, 3));

  } catch (error) {
    console.error('获取热门角色失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取可用角色 (Available OCs) ---
// 功能：获取当前用户可用于故事生成的角色列表
// 包括：
// 1. 自己的角色 (My)
// 2. 广场上的公开角色 (Public)
// 3. 已经联动通过的角色 (Linked - Approved)
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const LinkRequest = require('../models/linkrequest');

    // 1. 查找已通过的联动申请 (我是发起者，状态 approved)
    const approvedLinks = await LinkRequest.findAll({
      where: {
        senderId: userId,
        status: 'approved'
      },
      attributes: ['targetCharId']
    });
    
    const linkedCharIds = approvedLinks.map(link => link.targetCharId);

    // 2. 组合查询条件
    const list = await Character.findAll({
      where: {
        [Op.or]: [
          { isPublic: true },           // 公开的
          { userId: userId },           // 自己的
          { id: { [Op.in]: linkedCharIds } } // 联动的
        ]
      },
      order: [['createdAt', 'DESC']]
    });

    res.json(list);
  } catch (error) {
    console.error('获取可用角色失败:', error);
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
    
    const result = list.map(c => {
        const json = c.toJSON();
        // 自己的角色在管理页也显示水印预览，或者可以加参数 ?raw=true 来显示原图
        // 这里为了统一物理隔离，依然走 view 接口
        if (json.image && !json.image.startsWith('http')) {
             json.image = `/api/char/view/${c.id}`;
        }
        return json;
    });
    res.json(result);
  } catch (error) {
    console.error('获取我的角色失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 创建角色 (捏人) ---
// 权限：需要登录 (authenticateToken)
// 使用 multer 处理图片上传 (字段名: image)
router.post('/add', authenticateToken, uploadMiddleware, async (req, res) => {
  try {
    const data = req.body;
    console.log('Creating character for user:', req.user.id);
    // 1. Token 解析：从鉴权中间件解析出的 user 对象中获取 userId
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Invalid User ID from token' });
    }

    // 2. 图片保存路径处理
    // 如果有上传文件，multer 会自动保存并挂载到 req.file
    let imgUrl = '';
    if (req.file) {
        // 如果用户选择了“添加水印”，则处理图片
        // isWatermarkRequired 来自前端 form-data
        const isWatermarkRequired = data.isWatermarkRequired === 'true';
        
        if (isWatermarkRequired) {
            try {
                const inputPath = req.file.path;
                const outputPath = path.join(path.dirname(inputPath), `wm-${req.file.filename}`);
                
                // --- 水印合成逻辑 ---
                // 计算水印位置：右下角
                // 使用 sharp 创建一个 SVG 文本水印 (简单模拟 Logo/ID)
                // 也可以加载一个 png logo
                const watermarkText = `Created by User #${userId}`;
                const svgImage = `
                  <svg width="300" height="100">
                    <style>
                      .title { fill: rgba(255, 255, 255, 0.5); font-size: 24px; font-weight: bold; }
                    </style>
                    <text x="50%" y="50%" text-anchor="middle" class="title">${watermarkText}</text>
                  </svg>
                `;
                const watermarkImg = Buffer.from(svgImage);

                await sharp(inputPath)
                    .composite([{
                        input: watermarkImg,
                        gravity: 'southeast', // 右下角
                        blend: 'over'
                    }])
                    .toFile(outputPath);
                
                // 处理完成后，删除原图，将新图重命名为原图名，或者直接使用新图
                // 为简单起见，我们更新 imgUrl 为新文件名 (虽然 multer 已经返回了 filename)
                // 但为了保持一致性，最好是覆盖原文件
                // 这里我们选择覆盖原文件：
                // 1. 删除原 inputPath
                // 2. 重命名 outputPath -> inputPath
                
                // Windows 下文件占用可能导致问题，所以先用 sharp 输出到 temp，再移动
                // 上面的代码已经输出了 `wm-filename`
                
                // 异步等待文件释放
                await new Promise(resolve => setTimeout(resolve, 100));
                
                fs.unlinkSync(inputPath); // 删除无水印原图
                fs.renameSync(outputPath, inputPath); // 重命名带水印图为原文件名
                
                console.log('✅ 已为上传图片添加用户水印');
                
            } catch (err) {
                console.error('❌ 水印添加失败:', err);
                // 失败不阻断流程，继续使用原图
            }
        }

        // 构造文件名 (不含路径，由 view 接口动态读取)
        // 数据库只存文件名
        imgUrl = req.file.filename;
    }

    // --- 标签处理 (兼容逻辑) ---
    let tags = data.tags;
    if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
    }
    if (!Array.isArray(tags)) tags = [];

    // 3. 数据库保存 (Data Persistence)
    // 生成 RID
    const rid = 'R' + Math.floor(Math.random() * 900000 + 100000); // R + 6位数字

    // 使用 Sequelize 将 OC 设定存入 Characters 表
    // 包含姓名、性别、年龄、外貌、背景(description)及自定义标签
    const newChar = await Character.create({
      userId: userId,        // 关联用户 ID
      name: data.name,
      rid: rid,              // 随机ID
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
router.put('/update/:id', authenticateToken, uploadMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Updating character ${id} for user ${req.user.id}`);
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
        // 如果更新了图片，也支持添加水印
        const isWatermarkRequired = data.isWatermarkRequired === 'true';
        if (isWatermarkRequired) {
             try {
                const inputPath = req.file.path;
                const outputPath = path.join(path.dirname(inputPath), `wm-${req.file.filename}`);
                const watermarkText = `Updated by User #${userId}`;
                const svgImage = `<svg width="300" height="100"><style>.title { fill: rgba(255, 255, 255, 0.5); font-size: 24px; font-weight: bold; }</style><text x="50%" y="50%" text-anchor="middle" class="title">${watermarkText}</text></svg>`;
                const watermarkImg = Buffer.from(svgImage);

                await sharp(inputPath)
                    .composite([{ input: watermarkImg, gravity: 'southeast', blend: 'over' }])
                    .toFile(outputPath);
                
                await new Promise(resolve => setTimeout(resolve, 100));
                fs.unlinkSync(inputPath);
                fs.renameSync(outputPath, inputPath);
            } catch (err) { console.error('添加水印失败', err); }
        }
        // 仅存储文件名
        imgUrl = req.file.filename;
    }

    // 4. 处理标签
    let tags = data.tags;
    if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
    }
    // 如果没有传 tags，则保持原样；如果传了且不是数组，设为空
    if (data.tags !== undefined && !Array.isArray(tags)) tags = [];

    // 5. 更新字段
    const updateData = {
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
    };

    // 更新历史记录
    if (data.creationMode) updateData.creationMode = data.creationMode;
    
    // 追加历史
    const currentHistory = char.history || [];
    const historyList = Array.isArray(currentHistory) ? [...currentHistory] : [];
    historyList.push({
        action: 'update',
        timestamp: new Date(),
        note: '用户修订了设定'
    });
    updateData.history = historyList;

    await char.update(updateData);

    res.json({ success: true, message: '哎呀呀，新的设定注入灵魂核心了哦。', data: char });

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
router.post('/polish', authenticateToken, async (req, res) => {
  try {
    const { charContext, instruction } = req.body; // 接收 instruction
    if (!charContext) {
      return res.status(400).json({ error: 'Missing character context' });
    }
    
    // 获取用户名
    const username = req.user.username;

    // 调用 aiService.js 中的 polishBio，传入 instruction
    const polishedText = await polishBio(charContext, username, instruction);
    
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
const sequelize = require('../config/database'); // 确保引入 sequelize 实例用于聚合查询

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

    // 增加评论计数
    await char.increment('commentsCount', { by: 1 });
    
    // 重新加载以获取最新数据
    await char.reload();

    // 返回带有用户信息的评论，方便前端渲染
    const commentWithUser = await Comment.findByPk(newComment.id, {
      include: [{ model: User, as: 'author', attributes: ['username', 'id'] }]
    });

    res.json({
      success: true,
      message: '叮！评论投递成功！',
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
      commentsCount: char.commentsCount, // 显式返回 commentsCount
      isLiked: isLiked,
      commentList: commentList
    });

  } catch (error) {
    console.error('获取社交数据失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 动态预览图片 (View Image with Watermark) ---
// 功能：读取私有目录的原图，实时叠加网格水印后返回
// 作用：防止盗图，前端只能通过此接口查看图片
router.get('/view/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. 查找角色获取文件名
        const char = await Character.findByPk(id);
        if (!char || !char.image) {
            return res.status(404).send('Image not found');
        }

        // 数据库中可能存的是 "filename.jpg" 或 "/uploads/filename.jpg"
        // 需要提取纯文件名
        let filename = char.image;
        if (filename.includes('/')) {
            filename = path.basename(filename);
        }

        // 2. 构造物理路径
        // 假设 private_uploads 在 utils/fileService.js 中定义为 ../private_uploads
        const UPLOAD_DIR = path.join(__dirname, '../../backend/private_uploads');
        const filePath = path.join(UPLOAD_DIR, filename);

        if (!fs.existsSync(filePath)) {
            // 尝试去 public/uploads 找 (兼容旧数据)
            const publicPath = path.join(__dirname, '../../backend/public/uploads', filename);
            if (fs.existsSync(publicPath)) {
                 // 如果是旧图片，直接返回流 (或也加水印)
                 // 为了统一体验，这里也尝试加水印
                 return processAndSendImage(publicPath, res);
            }
            return res.status(404).send('File not found on server');
        }

        // 3. 处理并返回
        await processAndSendImage(filePath, res);

    } catch (error) {
        console.error('图片预览失败:', error);
        res.status(500).send('Error processing image');
    }
});

// 辅助函数：加网格水印并流式返回
async function processAndSendImage(filePath, res) {
    try {
        // 构造全屏平铺的网格水印
        // SVG 单个单元格，由 Sharp 进行 tile 平铺
        const gridSvg = `
            <svg width="240" height="240" xmlns="http://www.w3.org/2000/svg">
                <text x="50%" y="50%" font-size="24" font-weight="bold" fill="rgba(255,255,255,0.5)" transform="rotate(-30 120 120)" text-anchor="middle" dominant-baseline="middle">
                    仅供展示 禁止盗用
                </text>
            </svg>
        `;
        const watermarkImg = Buffer.from(gridSvg);

        // 设置响应头
        res.type('image/jpeg'); // 默认转为 jpeg 输出，或者根据原图类型

        // Sharp 管道
        const pipeline = sharp(filePath)
            .resize(800, null, { withoutEnlargement: true }) // 限制最大宽度优化性能
            .composite([{
                input: watermarkImg,
                tile: true, // 平铺水印
                blend: 'over'
            }])
            .jpeg({ quality: 80 }); // 压缩质量

        pipeline.pipe(res);

    } catch (e) {
        console.error('Sharp error:', e);
        res.status(500).end();
    }
}

// --- API: 获取角色的故事 (Get Character Stories) ---
router.get('/:id/stories', async (req, res) => {
  try {
    const { id } = req.params;
    const { Story } = require('../models');

    // 使用 Sequelize 的关联查询
    const char = await Character.findByPk(id, {
      include: [{
        model: Story,
        as: 'stories',
        include: [{
            model: Character,
            as: 'participants',
            attributes: ['id', 'name', 'image', 'rid']
        }],
        through: { attributes: [] } // 不返回中间表数据
      }]
    });

    if (!char) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 内存排序 (按创建时间倒序)
    const stories = char.stories || [];
    stories.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(stories);
  } catch (error) {
    console.error('获取角色故事失败:', error);
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
    // 逻辑变更：不再返回静态路径，而是返回动态预览接口
    let imgUrl = char.image;
    if (imgUrl) {
        // 无论数据库存的是什么，都转换为 view 接口
        // 这样前端 getImgUrl 就不需要改太多，或者前端直接用这个 url
        // 假设 imgUrl 是文件名
        imgUrl = `/api/char/view/${char.id}`;
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

// --- API: 删除角色 (Delete Character) ---
// 权限：需要登录且是角色的拥有者
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1. 查找角色
    const char = await Character.findByPk(id);
    if (!char) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }

    // 2. 权限校验：只能删除自己的角色
    if (char.userId !== userId) {
      return res.status(403).json({ success: false, error: 'You do not have permission to delete this character' });
    }

    // 3. 删除关联图片文件
    if (char.image && !char.image.startsWith('http')) {
        const filename = path.basename(char.image);
        // 立绘主要存储在 public/uploads
        const filePath = path.join(__dirname, '../public/uploads', filename);
        
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`[Delete] Deleted character image: ${filePath}`);
            } catch (e) {
                console.error(`[Delete] Failed to delete image file: ${e.message}`);
            }
        }
    }

    // 4. 执行数据库删除
    await char.destroy();

    res.json({ success: true, message: '档案销毁完毕' });

  } catch (error) {
    console.error('删除角色失败:', error);
    res.status(500).json({ success: false, error: '服务器内部错误，无法删除角色' });
  }
});

module.exports = router;
