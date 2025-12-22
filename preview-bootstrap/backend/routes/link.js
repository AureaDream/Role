const express = require('express');
const router = express.Router();
const LinkRequest = require('../models/linkrequest');
const Character = require('../models/character');
const { Op } = require('sequelize'); // 引入 Sequelize 操作符
const jwt = require('jsonwebtoken'); // 引入 JWT

// --- 中间件: JWT 身份验证 ---
// (复用自 character.js，建议后续提取到 common/middleware)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, 'secret_key_123456', (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

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
    return res.status(403).json({ error: '哎呀呀，权限被拒绝了呀。先发起联动申请吧。' });

  } catch (error) {
    console.error('鉴权检查失败:', error);
    return res.status(500).json({ error: '服务器内部错误' });
  }
};

// --- API: 发起申请 (sendRequest) ---
// 用户 A 申请联动用户 B 的某个 OC。
// 作用：开启一段新的社交关系，需检查是否已存在未处理的申请，避免重复打扰。
router.post('/request', authenticateToken, async (req, res) => {
  try {
    const sender = req.user.id;
    const { charId } = req.body;

    if (!charId) {
      return res.status(400).json({ error: 'Missing charId' });
    }

    // 校验 OC 是否存在
    const targetChar = await Character.findByPk(charId);
    if (!targetChar) {
      return res.status(404).json({ error: 'Character not found' });
    }

    // 禁止申请自己的 OC
    if (String(targetChar.userId) === String(sender)) {
      return res.status(400).json({ error: 'Cannot request link for your own character' });
    }

    const receiverId = targetChar.userId;

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

    res.status(201).json({ message: '哎呀呀，工匠大人的申请信成功投递啦', requestId: newRequest.id });

  } catch (error) {
    console.error('发送申请失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取我的审批列表 (Get My Pending Requests) ---
// 功能：获取当前用户作为接收方的所有联动申请。
// 作用：个人中心消息通知。
router.get('/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 查询发送给我的申请 (receiverId = me)
    // 包含 pending, approved, rejected 所有状态
    const requests = await LinkRequest.findAll({
      where: { receiverId: userId },
      order: [['createdAt', 'DESC']]
    });

    // 可以在此处做进一步数据填充 (populate sender info)，暂时直接返回
    res.json(requests);

  } catch (error) {
    console.error('获取我的申请失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 获取申请列表 (getRequests) ---
// 拥有者查看别人发给自己的待处理申请。
// 作用：作为‘流金梦坊’的消息中心，让用户及时处理社交互动请求。
router.get('/requests/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 只能查看自己的
    if (String(req.user.id) !== String(userId)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { status } = req.query; // 可选过滤：?status=pending

    const whereClause = { receiverId: userId };
    if (status) {
      whereClause.status = status;
    }

    const requests = await LinkRequest.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']]
    });

    res.json(requests);

  } catch (error) {
    console.error('获取申请列表失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// --- API: 处理申请 (handleRequest) ---
// 拥有者点击‘通过’或‘拒绝’。
// 作用：确立或终止一段社交授权，体现了用户对 OC 的绝对掌控权。
router.put('/request/:reqId', authenticateToken, async (req, res) => {
  try {
    const { reqId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

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

    res.json({ message: `申请已${status === 'approved' ? '通过' : '拒绝'}`, request: request });

  } catch (error) {
    console.error('处理申请失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

module.exports = {
  router,
  checkAuth // 导出中间件供其他路由使用
};
