const express = require('express');
const router = express.Router();
const Story = require('../models/story');
const Character = require('../models/character');
const axios = require('axios');
const jwt = require('jsonwebtoken'); // 引入 JWT
const { brainstormStory } = require('../services/aiService');
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

// --- API: 剧情头脑风暴 (Brainstorm) ---
router.post('/brainstorm', authenticateToken, async (req, res) => {
  try {
    const { charIdA, charIdB, keywords } = req.body;
    
    // 查询角色
    const queryIds = [charIdA];
    if (charIdB) queryIds.push(charIdB);
    const chars = await Character.findAll({ where: { id: { [Op.in]: queryIds } } });
    
    if (chars.length === 0) return res.status(404).json({ error: 'Character not found' });
    
    const options = await brainstormStory(chars, keywords);
    res.json({ options });
  } catch (error) {
    console.error('Brainstorm Error:', error);
    res.status(500).json({ error: '灵感枯竭中...' });
  }
});

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
    // 修正：需要返回所有参与者信息，而不仅仅是当前用户的角色
    // 方案：先找出故事ID，再重新查询
    
    // Step 2.1: Find Story IDs where user is involved
    const storiesWithUser = await Story.findAll({
      attributes: ['id'],
      include: [{
        model: Character,
        as: 'participants',
        where: { userId },
        attributes: [] // Only for filtering
      }]
    });
    
    const storyIds = storiesWithUser.map(s => s.id);

    if (storyIds.length === 0) {
      return res.json([]);
    }

    // Step 2.2: Fetch full story details with ALL participants
    const stories = await Story.findAll({
      where: { id: storyIds },
      include: [{
        model: Character,
        as: 'participants',
        attributes: ['id', 'name', 'rid', 'image'] // Include RID
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json(stories);
  } catch (error) {
    console.error('获取我的故事集失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
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
    const username = req.user ? req.user.username : '匿名';
    const fullStoryText = await writeStoryStream(chars, scene, (token) => {
      // 实时推送每一个字符块
      res.write(`data: ${JSON.stringify({ chunk: token })}\n\n`);
    }, username);

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
    console.error('生成故事失败:', error);
    // 如果已经开始流式传输，则发送 SSE 格式的错误
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: '服务器内部错误' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: '服务器内部错误' });
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
    if (!charIdA) {
      return res.status(400).json({ error: 'Please provide at least charIdA.' });
    }
    if (!keywords) {
      return res.status(400).json({ error: 'Please provide keywords/scene.' });
    }

    // 1. 数据检索：查找角色信息
    // 从数据库调取设定，包括姓名、性格、外貌及 Tags
    const queryIds = [charIdA];
    if (charIdB) queryIds.push(charIdB);

    const chars = await Character.findAll({
      where: {
        id: { [Op.in]: queryIds }
      }
    });

    if (chars.length !== queryIds.length) {
      return res.status(404).json({ error: 'One or more characters not found.' });
    }

    // 2. AI 请求参数构建 (AI Request Construction)
    // 组装 Prompt，将角色设定和场景关键词传递给 DeepSeek API
    // 调用 services/aiService.js 中的 writeStory 函数
    const storyContent = await writeStory(chars, keywords);

    // 3. 结果存储：保存到 Stories 表
    // 使用 Sequelize 持久化生成的故事内容
    const newStory = await Story.create({
      chars: queryIds, // 关联角色 ID 数组
      title: `${keywords.substring(0, 10)}... 的梦境`,
      content: storyContent,
      prompt: keywords,
      model: 'deepseek-v3'
    });

    // 建立多对多关联
    await newStory.addParticipants(queryIds);

    res.json({
      success: true,
      story: newStory
    });

  } catch (error) {
    console.error('织梦失败:', error);
    res.status(500).json({ error: '无法生成故事' });
  }
});

// --- API: 归档故事 (Archive Story) ---
// 功能：将指定故事的状态标记为 'archived'，不再在常规列表中显示。
router.patch('/:id/archive', authenticateToken, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.user.id;

    // 1. 查找目标故事
    const targetStory = await Story.findByPk(storyId, {
      include: [{
        model: Character,
        as: 'participants',
        attributes: ['userId'] // 仅查询拥有者 ID 用于校验
      }]
    });

    if (!targetStory) {
      return res.status(404).json({ error: 'Story not found.' });
    }

    // 2. 权限校验 (Permission Check)
    // 检查当前用户是否拥有该故事中的至少一个角色
    // (逻辑：只要是参与者之一，就有权归档自己的这份“记忆”)
    const isParticipant = targetStory.participants.some(char => String(char.userId) === String(userId));
    
    if (!isParticipant) {
      return res.status(403).json({ error: '许可被拒绝：你不是这个故事的参与者。' });
    }

    // 3. 数据库更新 (Database Update)
    // 修改状态为 archived
    const updateResult = await targetStory.update({ status: 'archived' });

    res.json({ success: true, message: '哎呀呀，梦境成功记录下来啦。', data: updateResult });

  } catch (error) {
    console.error('归档故事失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 删除故事 (Delete Story) ---
// 功能：物理删除或软删除故事。这里使用物理删除。
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.user.id;

    // 1. 查找故事
    const story = await Story.findByPk(storyId, {
      include: [{
        model: Character,
        as: 'participants',
        attributes: ['userId']
      }]
    });

    if (!story) {
      return res.status(404).json({ error: '欸，梦境好像不见了' });
    }

    // 2. 权限校验
    // 只有故事的“发起者”或参与者可以删除？
    // 简单起见，只有参与者可以删除。
    // 注意：如果是多人故事，一人删除是否影响他人？
    // 理想情况下应该是移除自己的关联，当所有人都移除后才物理删除。
    // 但为了简化逻辑，只要是参与者点击删除，就直接删除整条故事记录 (慎用)。
    // 或者：更安全的做法是只移除当前用户与该故事的关联 (CharacterStories)。
    // 这里我们采用：如果当前用户是该故事所有角色的拥有者（通常是单人故事或自己角色的互动），则物理删除。
    // 否则，仅提示“暂不支持删除多人互动故事”或仅做关联移除。
    // *本次实现：物理删除 (假设用户主要玩单机)*
    
    const isParticipant = story.participants.some(char => String(char.userId) === String(userId));
    if (!isParticipant) {
      return res.status(403).json({ error: '哎呀呀，可不要乱动别人的梦境呀' });
    }

    await story.destroy();
    res.json({ success: true, message: '梦境已销毁' });

  } catch (error) {
    console.error('删除故事失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取故事详情 (Get Story Detail) ---
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const story = await Story.findByPk(id, {
      include: [{
        model: Character,
        as: 'participants',
        attributes: ['id', 'name', 'image'] // 返回角色头像和名字
      }]
    });

    if (!story) {
      return res.status(404).json({ error: 'Story not found' });
    }

    res.json(story);
  } catch (error) {
    console.error('获取故事详情失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 路径建议 (Propose Paths) ---
// 功能：第一阶段，获取 3 个灵感走向
router.post('/propose-paths', authenticateToken, async (req, res) => {
  try {
    const { charIdA, charIdB, keywords, storyTone, storyPeriod } = req.body;
    
    // 查询角色
    const queryIds = [charIdA];
    if (charIdB) queryIds.push(charIdB);
    const chars = await Character.findAll({ where: { id: { [Op.in]: queryIds } } });
    
    if (chars.length === 0) return res.status(404).json({ error: 'Character not found' });
    
    // 注入用户偏好 (Tone & Period)
    const options = await brainstormStory(chars, keywords, storyTone, storyPeriod);
    res.json({ options });
  } catch (error) {
    console.error('Propose Paths Error:', error);
    res.status(500).json({ error: '灵感枯竭中...' });
  }
});

// --- API: 故事前半段生成 (Story Start - Phase 1) ---
// 功能：生成故事的起因和经过，在关键冲突点暂停
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { charIdA, charIdB, keywords, selectedPath, storyTone, storyPeriod } = req.body;
    
    const queryIds = [charIdA];
    if (charIdB) queryIds.push(charIdB);
    const chars = await Character.findAll({ where: { id: { [Op.in]: queryIds } } });
    
    if (chars.length === 0) return res.status(404).json({ error: 'Character not found' });

    // 调用服务生成前半段
    const storySegment = await require('../services/aiService').writeStoryStart(
        chars, selectedPath, keywords, storyTone, storyPeriod
    );

    res.json({ success: true, storySegment });
  } catch (error) {
    console.error('Story Start Error:', error);
    res.status(500).json({ error: '无法开启梦境...' });
  }
});

// --- API: 故事续写 (Story Continue - Phase 2) ---
// 功能：接收前半段和用户决定，生成结局并保存完整故事
router.post('/continue', authenticateToken, async (req, res) => {
  try {
    const { prevContext, userReaction, charIdA, charIdB, storyTone } = req.body;
    
    // 重新获取角色以保持上下文一致性 (虽然后半段主要依赖 prevContext，但角色设定依然重要)
    const queryIds = [charIdA];
    if (charIdB) queryIds.push(charIdB);
    const chars = await Character.findAll({ where: { id: { [Op.in]: queryIds } } });

    // 调用服务生成后半段
    const endingSegment = await require('../services/aiService').writeStoryContinue(
        chars, prevContext, userReaction, storyTone
    );

    // 拼装完整故事
    const fullContent = `${prevContext}\n\n（抉择时刻：${userReaction}）\n\n${endingSegment}`;
    
    // 尝试提取标题 (从前半段)
    let title = '未命名梦境';
    const titleMatch = prevContext.match(/^(?:标题|Title)[:：]\s*(.+)$/m) || 
                       prevContext.match(/^《(.+)》$/m) ||
                       prevContext.match(/^#\s*(.+)$/m);
    if (titleMatch) title = titleMatch[1].trim();

    // 保存完整故事
    const newStory = await Story.create({
      chars: queryIds,
      title: title,
      content: fullContent,
      prompt: `Interactive Story`,
      model: 'deepseek-v3'
    });
    
    await newStory.addParticipants(queryIds);

    res.json({ success: true, storySegment: endingSegment, storyId: newStory.id });
  } catch (error) {
    console.error('Story Continue Error:', error);
    res.status(500).json({ error: '续写失败...' });
  }
});



module.exports = router;
