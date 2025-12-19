const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // 假设你会在 config/database.js 中配置 Sequelize 实例

// --- Character (角色) 模型定义 ---
// 使用 Sequelize 定义 MySQL 表结构，对应数据库中的 'characters' 表
const Character = sequelize.define('Character', {
  // --- 基础字段 ---
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true, // 自增主键
    comment: '角色唯一ID'
  },
  ownerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '关联的用户ID (外键)'
    // 注意：实际的外键约束通常在模型关联 (Associations) 处定义
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '角色姓名'
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female', 'Non-binary', 'Other'),
    defaultValue: 'Other',
    comment: '性别'
  },
  age: {
    type: DataTypes.STRING(50), // 兼容 "Unknown" 等非数字描述
    comment: '年龄描述'
  },
  avatar: {
    type: DataTypes.STRING(500), // 存储图片 URL
    defaultValue: '',
    comment: '头像链接'
  },
  intro: {
    type: DataTypes.STRING(255),
    comment: '一句话简介'
  },

  // --- 核心设定 (长文本) ---
  appearance: {
    type: DataTypes.TEXT, // 使用 TEXT 存储长段落
    comment: '外貌描写'
  },
  personality: {
    type: DataTypes.TEXT,
    comment: '性格细节'
  },
  bio: { // 对应之前的 background
    type: DataTypes.TEXT,
    comment: '背景故事'
  },

  // --- 半开放设计：JSON 存储 ---
  // MySQL 5.7+ 支持原生 JSON 类型，非常适合存储灵活的标签数据
  // 结构示例: [{"key": "MBTI", "value": "INFP"}, {"key": "种族", "value": "精灵"}]
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '自定义标签 (JSON数组)'
  },

  // --- 状态控制 ---
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: '是否公开 (0:私密, 1:公开)'
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: '点赞数'
  }
}, {
  tableName: 'characters', // 强制指定表名
  timestamps: true, // 自动维护 createdAt 和 updatedAt
  comment: 'OC角色表 - 存储角色的所有设定信息'
});

module.exports = Character;
