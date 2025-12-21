const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Like = sequelize.define('Like', {
  userId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  charId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  }
}, {
  tableName: 'likes',
  timestamps: true,
  updatedAt: false // 点赞通常只需要记录创建时间
});

module.exports = Like;
