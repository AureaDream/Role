const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

// --- User (用户) 模型定义 ---
const userSchema = {
  // 基础字段
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: '用户名 (用于登录)'
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: '加密后的密码 (哈希值)'
  },
  nickname: {
    type: DataTypes.STRING,
    comment: '用户昵称'
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: 'user', // 默认角色为普通用户
    comment: '用户角色 (user/admin)'
  }
};

const User = sequelize.define('User', userSchema, {
  tableName: 'users',
  timestamps: true,
  hooks: {
    // 安全性 Hook: 在创建用户前自动加密密码
    beforeCreate: async (userData) => {
      if (userData.password) {
        // 生成盐并加密
        const salt = await bcrypt.genSalt(10);
        userData.password = await bcrypt.hash(userData.password, salt);
        // 中文注释: 这里的 userData.password 会被替换为加密后的哈希值，确保数据库中不存储明文密码
      }
    },
    // 如果有更新密码的需求，通常也需要 beforeUpdate 钩子
    beforeUpdate: async (userData) => {
      if (userData.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        userData.password = await bcrypt.hash(userData.password, salt);
      }
    }
  }
});

// --- 实例方法 ---
// 用于在登录时验证密码
User.prototype.validPassword = async function(password) {
  // this.password 是数据库中存储的密文
  // password 是用户输入的明文
  return await bcrypt.compare(password, this.password);
};

module.exports = User;
