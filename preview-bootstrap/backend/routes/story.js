const express = require('express');
const router = express.Router();
const Story = require('../models/story');
const Character = require('../models/character');
// 引入 AI 服务，用于调用 DeepSeek 生成故事
const { writeStory } = require('../services/aiService');
const LinkRequest = require('../models/linkrequest');
const { Op } = require('sequelize'); // 引入 Sequelize 操作符

// --- API: 开启织梦 (生成故事) ---
// 功能：接收场景关键词和参与角色，调用 DeepSeek 生成互动短剧。
// 流程：1. 校验权限 -> 2. 组装 Prompt -> 3. 调用 AI -> 4. 保存故事 -> 5. 返回结果
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
    // 使用 Sequelize 的 findAll 和 Op.in 查询
    const chars = await Character.findAll({
      where: {
        id: {
          [Op.in]: charIds
        }
      }
    });

    if (chars.length !== charIds.length) {
      return res.status(404).json({ error: 'One or more characters not found.' });
    }

    // --- 权限检查逻辑 ---
    // 遍历每一个参与的角色，检查当前用户是否有权使用。
    // 规则：
    // 1. 如果是自己的 OC (isMine)，直接通过。
    // 2. 如果是别人的 OC，必须存在状态为 'approved' 的 LinkRequest 记录。
    // 这一步是‘流金梦坊’社交体系的基石，确保每一次互动都是基于双方意愿的。
    for (const char of chars) {
      const isMine = userId && String(char.ownerId) === String(userId);
      
      if (!isMine) {
        // 查询是否有已通过的授权
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

    // 2. Prompt 组装与调用 AI

    // writeStory 函数内部会处理以下逻辑：
    // - 将 chars 数组遍历，提取 name, personality, appearance, background
    // - 重点处理 tags (自定义标签)，如 [{"key": "MBTI", "value": "INFP"}] -> "MBTI: INFP"
    // - 告诉 AI：“请根据以下人设编写一段 500-1000 字的互动故事，严禁 OOC”
    const storyText = await writeStory(chars, scene);

    // 简单提取标题 (假设 AI 生成的第一行是标题，或者直接用场景名)
    let title = scene.substring(0, 20);
    let content = storyText;

    // 尝试从 AI 文本中提取标题 (如果第一行以 # 开头)
    const lines = storyText.split('\n');
    if (lines[0].startsWith('#')) {
      title = lines[0].replace(/^#+\s*/, '').trim();
      content = lines.slice(1).join('\n').trim();
    }

    // 3. 保存故事
    // 使用 Sequelize 的 create 方法
    const newStory = await Story.create({
      chars: charIds, // 存储为 JSON 数组
      title: title,
      content: content,
      prompt: scene, // 记录本次生成的场景关键词
      model: 'deepseek-v3'
    });

    res.status(201).json({ 
      message: 'Story created successfully', 
      story: newStory 
    });

  } catch (error) {
    console.error('Create Story Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
