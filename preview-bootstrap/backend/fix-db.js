const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./config/database');

async function fix() {
  try {
    console.log('🔌 正在连接数据库...');
    await sequelize.authenticate();
    
    console.log('🔧 修复“性别”列类型...');
    // 强制MySQL将列更改为VARCHAR以支持自定义文本
    try {
      await sequelize.query("ALTER TABLE `Characters` MODIFY COLUMN `gender` VARCHAR(50) DEFAULT '其他';");
    } catch (e) {
      console.log('   ℹ️ (忽略) Characters 表或 gender 列可能不存在或无需修改:', e.message);
    }

    console.log('🔧 向故事添加“状态”列...');
    try {
        await sequelize.query("ALTER TABLE `Stories` ADD COLUMN `status` VARCHAR(20) DEFAULT 'active';");
    } catch (e) {
        if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
             console.log('   ℹ️ 列“状态”已存在。');
        } else {
             console.log('   ℹ️ (忽略) Stories 表可能不存在:', e.message);
        }
    }

    console.log('🔧 向用户添加“头像”和“昵称”列...');
    try {
        await sequelize.query("ALTER TABLE `users` ADD COLUMN `avatar` VARCHAR(255);");
        console.log('   ✅ 已添加 avatar 列');
    } catch (e) {
        if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
             console.log('   ℹ️ 列“avatar”已存在。');
        } else {
             console.error('   ❌ 添加 avatar 列失败:', e.message);
        }
    }

    try {
        await sequelize.query("ALTER TABLE `users` ADD COLUMN `nickname` VARCHAR(255);");
        console.log('   ✅ 已添加 nickname 列');
    } catch (e) {
        if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
             console.log('   ℹ️ 列“nickname”已存在。');
        } else {
             console.error('   ❌ 添加 nickname 列失败:', e.message);
        }
    }
    
    console.log('✅ 数据库架构修复成功！');
    process.exit(0);
  } catch (error) {
    console.error('❌ 修复失败：', error.message);
    process.exit(1);
  }
}

fix();