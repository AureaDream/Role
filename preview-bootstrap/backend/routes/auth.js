const express = require('express');
const router = express.Router();
const User = require('../models/user');
const jwt = require('jsonwebtoken');

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

module.exports = router;
