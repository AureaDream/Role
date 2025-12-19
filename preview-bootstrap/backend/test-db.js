const path = require('path');
// 显式加载环境变量，与 app.js 保持一致
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sequelize = require('./config/database');

async function checkConnection() {
  console.log('🔄 正在尝试连接数据库...');
  console.log(`📍 目标主机: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`);
  console.log(`👤 用户: ${process.env.DB_USER || 'root'}`);

  try {
    // 1. 测试认证
    await sequelize.authenticate();
    console.log('✅ 连接成功! (Authentication successful)');

    // 2. 检查数据库版本 (可选)
    const [results] = await sequelize.query('SELECT VERSION() as version');
    console.log(`ℹ️  数据库版本: ${results[0].version}`);

    // 3. 退出脚本
    console.log('👋 测试结束，正在关闭连接...');
    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ 连接失败 (Connection Failed):');
    console.error(`   错误信息: ${error.message}`);
    
    // 针对常见错误的中文提示
    if (error.original && error.original.code === 'ETIMEDOUT') {
      console.error('   💡 提示: 连接超时。请检查安全组端口 3306 是否开放，或 IP 是否正确。');
    } else if (error.original && error.original.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   💡 提示: 认证失败。请检查用户名或密码，以及该用户是否拥有远程连接权限 (%)。');
    }

    process.exit(1);
  }
}

checkConnection();
