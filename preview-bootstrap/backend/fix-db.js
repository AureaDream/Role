const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./config/database');

async function fix() {
  try {
    console.log('🔌 Connecting to database...');
    await sequelize.authenticate();
    
    console.log('🔧 Fixing "gender" column type...');
    // Force MySQL to change column to VARCHAR to support custom text like '女'
    await sequelize.query("ALTER TABLE `characters` MODIFY COLUMN `gender` VARCHAR(50) DEFAULT 'Other';");
    
    console.log('✅ Database schema fixed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Fix failed:', error.message);
    process.exit(1);
  }
}

fix();