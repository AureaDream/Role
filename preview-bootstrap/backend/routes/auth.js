const express = require('express');
const router = express.Router();
const User = require('../models/user');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// 注册接口
router.post('/register', async (req, res) => {
  try {
    const user = req.body.username;
    const pwd = req.body.password;

    if (!user || !pwd) {
      return res.status(400).json({ success: false, msg: '用户名和密码不能为空' });
    }

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ where: { username: user } });
    if (existingUser) {
      return res.status(409).json({ success: false, msg: '用户名已被占用' });
    }

    // 创建新用户 (newUser)
    // 注意：这里直接传入 pwd (明文)，因为 User 模型的 beforeCreate 钩子会自动处理哈希加密
    const newUser = await User.create({
      username: user,
      password: pwd
    });

    res.json({ success: true, msg: '用户创建成功', userId: newUser.id });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// 登入接口
router.post('/login', async (req, res) => {
  try {
    const user = req.body.username;
    const pwd = req.body.password;

    // 1. 查找用户 (foundUser)
    const foundUser = await User.findOne({ where: { username: user } });
    if (!foundUser) {
      return res.status(401).json({ success: false, msg: '用户不存在' });
    }

    // 2. 验证密码
    // 调用模型实例方法 validPassword
    const isMatch = await foundUser.validPassword(pwd);
    if (!isMatch) {
      return res.status(401).json({ success: false, msg: '密码错误' });
    }

    // 3. 生成 Token
    // 构造 payload
    const payload = {
      id: foundUser.id,
      username: foundUser.username,
      role: foundUser.role
    };

    const token = jwt.sign(
      payload,
      'secret_key_123456', // 密钥 (建议放入环境变量)
      { expiresIn: '24h' }
    );

    res.json({ success: true, token, msg: '登入成功' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: '系统错误' });
  }
});

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未经授权' });
  jwt.verify(token, 'secret_key_123456', (err, user) => {
    if (err) return res.status(403).json({ error: '令牌无效' });
    req.user = user;
    next();
  });
};

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'nickname', 'avatar', 'role']
    });
    if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, msg: err.message });
  }
});

// 更新个人信息 (头像、昵称)
const { upload } = require('../utils/fileService'); // 复用已有的 upload 中间件
router.put('/profile', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user.id;
    const { nickname } = req.body;
    
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ success: false, msg: '用户不存在' });

    if (nickname) user.nickname = nickname;
    if (req.file) {
      const oldAvatar = user.avatar;
      user.avatar = req.file.filename;

      // 删除旧头像 (仅当旧头像存在且不是 URL 时)
      if (oldAvatar && !oldAvatar.startsWith('http')) {
        const oldPath = path.join(__dirname, '../public/image', oldAvatar);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
            console.log(`Deleted old avatar: ${oldPath}`);
          } catch (e) {
            console.error(`Failed to delete old avatar: ${e.message}`);
          }
        }
      }
    }

    await user.save();
    
    res.json({ success: true, msg: '个人信息更新成功', user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar
    }});
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, msg: '更新失败: ' + err.message });
  }
});

module.exports = router;
