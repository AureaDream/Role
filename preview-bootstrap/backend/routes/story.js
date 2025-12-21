const express = require('express');
const router = express.Router();
const Story = require('../models/story');
const Character = require('../models/character');
const axios = require('axios');
const jwt = require('jsonwebtoken'); // 引入 JWT
const { writeStory, writeStoryStream } = require('../services/aiService');
const LinkRequest = require('../models/linkrequest');
const { Op } = require('sequelize');

// --- 中间件: JWT 身份验证 ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, 'secret_key_123456', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// --- API: 获取我的故事集 (My Stories) ---
// 功能：返回当前用户参与或创建的所有 AI 故事。
// 逻辑：通过 Character 关联查询，找到包含用户角色的所有故事。
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. 查找用户的所有角色 ID
    const myChars = await Character.findAll({
      where: { userId },
      attributes: ['id']
    });
    
    const charIds = myChars.map(c => c.id);

    if (charIds.length === 0) {
      return res.json([]); // 如果没有角色，自然没有故事
    }

    // 2. 查找包含这些角色的故事
    // 由于 chars 字段存储的是 JSON 数组，标准 SQL 查询较复杂。
    // 但我们有 CharacterStories 中间表 (多对多关联)。
    // 使用 Sequelize 关联查询: Find Stories where included Characters have userId = currentUserId
    const stories = await Story.findAll({
      include: [{
        model: Character,
        as: 'participants', // 需确认 models/index.js 中定义的别名，通常默认为 Characters 或 participants
        where: { userId },
        attributes: [], // 不需要返回角色详情，只需用于过滤
        through: { attributes: [] } // 不返回中间表数据
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(stories);
  } catch (error) {
    console.error('Get My Stories Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API: 开启织梦 (生成故事) ---
// 功能：接收场景关键词和参与角色，调用 DeepSeek 生成互动短剧。
// 流程：1. 校验权限 -> 2. 组装 Prompt -> 3. 调用 AI (流式) -> 4. 实时推送 -> 5. 保存故事
router.post('/create', async (req, res) => {
  try {
    const { charIds, scene, userId } = req.body; // 假设前端会传当前操作的 userId

    if (!charIds || !Array.isArray(charIds) || charIds.length === 0) {
      return res.status(400).json({ error: 'Please provide valid charIds array.' });
    }
    if (!scene) {
      return res.status(400).json({ error: 'Please provide a scene description.' });
    }

    // 1. 上下文提取：查询角色信息
    const chars = await Character.findAll({
      where: {
        id: { [Op.in]: charIds }
      }
    });

    if (chars.length !== charIds.length) {
      return res.status(404).json({ error: 'One or more characters not found.' });
    }

    // --- 权限检查逻辑 ---
    for (const char of chars) {
      // 兼容性更新: ownerId 已变更为 userId
      const isMine = userId && String(char.userId) === String(userId);
      if (!isMine) {
        const hasLink = await LinkRequest.findOne({
          where: {
            senderId: userId,
            targetCharId: char.id,
            status: 'approved'
          }
        });
        if (!hasLink) {
          return res.status(403).json({ 
            error: `Permission denied: You are not authorized to use character '${char.name}'.` 
          });
        }
      }
    }

    // 2. 开启流式响应 (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 3. 调用 AI 并实时推送
    // writeStoryStream 会返回完整的 storyText 用于后续保存
    const fullStoryText = await writeStoryStream(chars, scene, (token) => {
      // 实时推送每一个字符块
      res.write(`data: ${JSON.stringify({ chunk: token })}\n\n`);
    });

    // 4. 后处理与保存
    let title = scene.substring(0, 20);
    let content = fullStoryText;

    // 尝试从 AI 文本中提取标题
    const lines = fullStoryText.split('\n');
    if (lines[0].startsWith('#')) {
      title = lines[0].replace(/^#+\s*/, '').trim();
      content = lines.slice(1).join('\n').trim();
    }

    // 5. 保存故事到数据库
    const newStory = await Story.create({
      chars: charIds,
      title: title,
      content: content,
      prompt: scene,
      model: 'deepseek-v3'
    });

    // --- 建立多对多关联 ---
    // 在中间表 CharacterStories 中插入记录
    // 这样后续可以通过 Character.findOne({ include: 'stories' }) 查出该角色的故事
    if (charIds && charIds.length > 0) {
      await newStory.addParticipants(charIds); // Sequelize 自动生成的 mixin 方法
    }

    // 6. 发送结束信号和保存结果
    res.write(`data: ${JSON.stringify({ done: true, story: newStory })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Create Story Failed:', error);
    // 如果已经开始流式传输，则发送 SSE 格式的错误
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

// --- API: 织梦生成 (Generate Story) ---
// 功能：接收主角和配角 ID 及场景关键词，调用 DeepSeek 生成互动故事。
router.post('/generate', authenticateToken, async (req, res) => {
  try {
    const { charIdA, charIdB, keywords } = req.body;
    const userId = req.user.id; // 获取当前用户ID (虽此处逻辑暂不需要，但可用于后续权限校验或记录)

    // 简单校验
    if (!charIdA || !charIdB) {
      return res.status(400).json({ error: 'Please provide both charIdA and charIdB.' });
    }
    if (!keywords) {
      return res.status(400).json({ error: 'Please provide keywords/scene.' });
    }

    // 1. 数据检索：查找角色信息
    // 从数据库调取设定，包括姓名、性格、外貌及 Tags
    const chars = await Character.findAll({
      where: {
        id: { [Op.in]: [charIdA, charIdB] }
      }
    });

    if (chars.length !== 2) {
      return res.status(404).json({ error: 'One or more characters not found.' });
    }

    // 2. AI 请求参数构建 (AI Request Construction)
    // 组装 Prompt，将角色设定和场景关键词传递给 DeepSeek API
    // 调用 services/aiService.js 中的 writeStory 函数
    const storyContent = await writeStory(chars, keywords);

    // 3. 结果存储：保存到 Stories 表
    // 使用 Sequelize 持久化生成的故事内容
    const newStory = await Story.create({
      chars: [charIdA, charIdB], // 关联角色 ID 数组
      title: `${keywords.substring(0, 10)}... 的梦境`,
      content: storyContent,
      prompt: keywords,
      model: 'deepseek-v3'
    });

    // 建立多对多关联
    await newStory.addParticipants([charIdA, charIdB]);

    res.json({
      success: true,
      story: newStory
    });

  } catch (error) {
    console.error('Generate Story Failed:', error);
    res.status(500).json({ error: 'Failed to generate story.' });
  }
});

module.exports = router;
