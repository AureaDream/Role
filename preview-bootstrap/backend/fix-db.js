const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./config/database');

async function fix() {
  try {
    console.log('🔌 正在连接数据库...');
    await sequelize.authenticate();
    
    console.log('🔧 修复“性别”列类型...');
    // 强制MySQL将列更改为VARCHAR以支持自定义文本，例如 '女'
    await sequelize.query("ALTER TABLE'字符'修改列'性别'VARCHAR（50）默认为'其他'；");

    console.log('🔧 向故事添加“状态”列...');
    try {
        await sequelize.query("更改表'故事'添加列'状态'VARCHAR（20）默认为'活动'；");
    } catch (e) {
        if (e.original && e.original.code === 'ER_DUP_FIELDNAME') {
             console.log('   ℹ️ 列“状态”已存在。');
        } else {
            throw e;
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