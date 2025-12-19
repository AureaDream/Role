const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LinkRequest = sequelize.define('LinkRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // --- 参与者：社交互动的发起与接收 ---
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '发起联动申请的用户ID'
  },
  receiverId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '被申请的OC拥有者ID'
  },
  // --- 目标：互动的核心对象 ---
  targetCharId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: '本次申请所针对的具体OC ID'
  },
  // --- 状态：授权流转控制 ---
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    comment: '申请状态: pending=待审核, approved=已通过, rejected=已拒绝'
  }
}, {
  tableName: 'link_requests',
  timestamps: true,
  comment: 'OC联动申请表 - 记录所有的授权请求与处理状态'
});

module.exports = LinkRequest;
