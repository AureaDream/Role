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
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '关联的用户ID (外键)'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '角色姓名'
  },
  // --- 新增: RID (随机ID) ---
  rid: {
    type: DataTypes.STRING(20),
    unique: true, // 确保唯一
    comment: '角色唯一随机标识符 (如 R123456)'
  },
  // --- 用户要求的 description 字段 ---
  description: {
    type: DataTypes.TEXT,
    comment: '角色设定/背景描述'
  },
  // --- 用户要求的 image 字段 ---
  image: {
    type: DataTypes.STRING(500),
    defaultValue: '',
    comment: '角色立绘路径'
  },
  // 保留原有字段以兼容 AI 服务
  gender: {
    type: DataTypes.STRING(50),
    defaultValue: 'Other',
    comment: '性别'
  },
  age: {
    type: DataTypes.STRING(50),
    comment: '年龄描述'
  },
  intro: {
    type: DataTypes.STRING(255),
    comment: '一句话简介'
  },
  appearance: {
    type: DataTypes.TEXT,
    comment: '外貌描写'
  },
  personality: {
    type: DataTypes.TEXT,
    comment: '性格细节'
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: '自定义标签 (JSON数组)'
  },
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
