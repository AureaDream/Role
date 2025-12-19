const { Sequelize } = require('sequelize');

// --- 环境变量检查 ---
// 确保关键的环境变量已设置，否则在启动时提供明确的错误提示
const requiredEnvVars = ['DB_NAME', 'DB_USER', 'DB_PASS', 'DB_HOST'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  console.warn(`⚠️  警告: 缺少数据库环境变量 [${missingVars.join(', ')}], 将尝试使用默认值 (仅限本地开发)`);
}

// --- 数据库配置初始化 ---
// 从环境变量读取配置，如果未配置则使用默认值 (本地开发环境)
const DB_NAME = process.env.DB_NAME || 'oc_workshop';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASS = process.env.DB_PASS || 'password'; // 请务必在 .env 中设置强密码
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;

// --- 连接参数说明 (远程连接必读) ---
// 如果是连接云数据库 (如阿里云 RDS/腾讯云 CDB)：
// 1. DB_HOST: 必须是公网 IP (如 120.79.x.x) 或内网域名 (如果在同一 VPC 下)。
// 2. DB_PORT: 默认为 3306，需确认云服务器安全组已放行该端口。
// 3. DB_USER: 确保该用户拥有远程连接权限 (host: '%')。

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
  host: DB_HOST,
  port: DB_PORT,
  dialect: 'mysql', // 指定使用 MySQL
  
  // --- 核心配置 ---
  logging: false,   // 关闭 SQL 日志输出，保持控制台清爽 (调试时可设为 console.log)
  
  // --- 全局模型定义配置 ---
  define: {
    timestamps: true, // 强制所有模型默认自动管理 createdAt 和 updatedAt
    underscored: false, // 保持驼峰命名 (createdAt vs created_at)，根据个人喜好调整
    freezeTableName: false // 允许 Sequelize 自动推断表名复数形式 (User -> Users)
  },

  // --- 连接池配置 ---
  pool: {
    max: 5,         // 连接池最大连接数
    min: 0,
    acquire: 30000, // 连接超时时间 (ms)
    idle: 10000     // 空闲连接释放时间 (ms)
  },
  
  timezone: '+08:00' // 设置时区为北京时间
});

// --- 注意：移除了原文件中的自动执行 testConnection() ---
// 原因：config 文件应保持纯净，只负责导出实例。
// 数据库连接测试和模型同步应在 app.js 启动时或专门的脚本中进行。

module.exports = sequelize;
