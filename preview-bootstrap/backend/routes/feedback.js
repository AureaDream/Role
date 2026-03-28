const express = require('express');
const router = express.Router();
const Feedback = require('../models/feedback');

router.post('/submit', async (req, res) => {
  try {
    const content = (req.body.content || '').trim();
    const category = (req.body.category || 'general').trim() || 'general';

    if (!content) {
      return res.status(400).json({
        success: false,
        msg: '反馈内容不能为空'
      });
    }

    const item = await Feedback.create({
      content,
      category
    });

    res.json({
      success: true,
      data: item
    });
  } catch (e) {
    console.error('保存反馈失败:', e);
    res.status(500).json({
      success: false,
      msg: '保存反馈失败，请稍后再试'
    });
  }
});

router.get('/all', async (req, res) => {
  try {
    const list = await Feedback.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json({
      success: true,
      data: list
    });
  } catch (e) {
    console.error('获取反馈列表失败:', e);
    res.status(500).json({
      success: false,
      msg: '获取反馈列表失败，请稍后再试'
    });
  }
});

module.exports = router;

