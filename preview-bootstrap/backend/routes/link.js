const express = require('express');
const router = express.Router();
const LinkRequest = require('../models/linkrequest');
const Character = require('../models/character');
const { Op } = require('sequelize'); // 引入 Sequelize 操作符

// --- 中间件：核心校验 (checkAuth) ---
// 在生成 AI 故事前调用，确保社交逻辑的合规性。
// 逻辑：如果 OC 不是自己的，且没有 approved 的联动记录，则拦截请求。
// 这一步是‘流金梦坊’保护原创版权和社交礼仪的防线。
const checkAuth = async (req, res, next) => {
  try {
    const { userId } = req.body; // 假设请求体包含当前用户 ID
    const { charId } = req.body; // 假设请求体包含目标 OC ID

    if (!userId || !charId) {
      return res.status(400).json({ error: 'Missing userId or charId' });
    }

    // 使用 Sequelize 的 findByPk 查询
    const character = await Character.findByPk(charId);
    if (!character) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 1. 如果是自己的 OC，直接放行
    // 注意：MySQL 中 ID 通常是数字，需确保类型一致
    if (String(character.ownerId) === String(userId)) {
      return next();
    }

    // 2. 如果是别人的 OC，检查是否有 approved 的联动记录
    const approvedLink = await LinkRequest.findOne({
      where: {
        senderId: userId,
        targetCharId: charId,
        status: 'approved'
      }
    });

    if (approvedLink) {
      return next();
    }

    // 3. 如果既不是自己的，也没有授权，则拦截
    return res.status(403).json({ error: 'Permission denied. Please request link authorization first.' });

  } catch (error) {
    console.error('Auth Check Failed:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// --- API: 发起申请 (sendRequest) ---
// 用户 A 申请联动用户 B 的某个 OC。
// 作用：开启一段新的社交关系，需检查是否已存在未处理的申请，避免重复打扰。
router.post('/request', async (req, res) => {
  try {
    const { sender, charId } = req.body;

    if (!sender || !charId) {
      return res.status(400).json({ error: 'Missing sender or charId' });
    }

    // 校验 OC 是否存在
    const targetChar = await Character.findByPk(charId);
    if (!targetChar) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 禁止申请自己的 OC
    if (String(targetChar.ownerId) === String(sender)) {
      return res.status(400).json({ error: 'Cannot request link for your own character' });
    }

    const receiverId = targetChar.ownerId;

    // 检查是否已存在 pending 或 approved 的请求
    const existingRequest = await LinkRequest.findOne({
      where: {
        senderId: sender,
        targetCharId: charId,
        status: { [Op.in]: ['pending', 'approved'] }
      }
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Request already exists or approved' });
    }

    // 创建新申请
    const newRequest = await LinkRequest.create({
      senderId: sender,
      receiverId: receiverId,
      targetCharId: charId,
      status: 'pending'
    });

    res.status(201).json({ message: 'Link request sent successfully', requestId: newRequest.id });

  } catch (error) {
    console.error('Send Request Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API: 获取申请列表 (getRequests) ---
// 拥有者查看别人发给自己的待处理申请。
// 作用：作为‘流金梦坊’的消息中心，让用户及时处理社交互动请求。
router.get('/requests/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.query; // 可选过滤：?status=pending

    const whereClause = { receiverId: userId };
    if (status) {
      whereClause.status = status;
    }

    // 关联查询发送者信息和目标 OC 信息，以便前端展示
    // 注意：Sequelize 需要先定义关联关系 (Associations) 才能使用 include
    // 这里暂时只查询 LinkRequest 本身，若需关联需在 Models 中定义 belongsTo
    const requests = await LinkRequest.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.json(requests);

  } catch (error) {
    console.error('Get Requests Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- API: 处理申请 (handleRequest) ---
// 拥有者点击‘通过’或‘拒绝’。
// 作用：确立或终止一段社交授权，体现了用户对 OC 的绝对掌控权。
router.put('/request/:reqId', async (req, res) => {
  try {
    const { reqId } = req.params;
    const { status, userId } = req.body; // userId 用于校验操作者身份

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const request = await LinkRequest.findByPk(reqId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // 校验权限：只有接收者（OC 拥有者）可以处理申请
    if (String(request.receiverId) !== String(userId)) {
      return res.status(403).json({ error: 'Unauthorized operation' });
    }

    // 更新状态
    request.status = status;
    await request.save();

    res.json({ message: `Request ${status}`, request });

  } catch (error) {
    console.error('Handle Request Failed:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = {
  router,
  checkAuth // 导出中间件供其他路由使用
};
