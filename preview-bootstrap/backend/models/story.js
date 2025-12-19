const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Story = sequelize.define('Story', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // --- 关联关系：角色阵容 ---
  // 存储参与该故事的 OC ID 数组
  // 在 MySQL 中，多对多关系通常通过中间表实现，但为了简化，这里暂时使用 JSON 存储 ID 数组
  chars: {
    type: DataTypes.JSON, // 存储如 [1, 2, 3] 的 ID 数组
    allowNull: false,
    comment: '参与角色的ID列表'
  },
  // --- 内容字段：故事核心 ---
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: '故事标题'
  },
  content: {
    type: DataTypes.TEXT('long'), // 使用 LONGTEXT 存储长篇故事
    allowNull: false,
    comment: '故事正文'
  },
  // --- AI 标记：生成溯源 ---
  prompt: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: '生成该故事时的关键词/场景描述'
  },
  model: {
    type: DataTypes.STRING(50),
    defaultValue: 'deepseek-v3',
    comment: '使用的AI模型版本'
  }
}, {
  tableName: 'stories',
  timestamps: true,
  comment: 'AI生成的故事记录表'
});

module.exports = Story;
