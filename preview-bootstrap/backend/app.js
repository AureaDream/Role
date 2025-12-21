// --- 1. 核心模块引入 ---
const path = require('path');
const express = require('express');
const isProd = process.env.NODE_ENV === 'production';

// --- 2. 配置引入 ---
// 显式指定 .env 文件路径，确保在不同目录下启动都能正确加载
require('dotenv').config({ path: path.join(__dirname, '.env') });
const sequelize = require('./config/database'); // 引入 Sequelize 实例
// 引入所有模型以建立关联 (只需 require 一次即可触发 models/index.js 中的关联逻辑)
require('./models'); 
const cors = require('cors');

// 初始化 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// --- 3. 中间件配置 ---
// CORS 安全策略：根据环境动态配置
// 为了解决本地开发时的"网络异常" (Network Error)，暂时允许所有跨域请求
// 生产环境建议修改为特定域名: app.use(cors({ origin: 'https://your-domain.com' }));
app.use(cors()); 

// 解析 JSON 格式的请求体，限制大小为 10mb 防止 DOS 攻击
app.use(express.json({ limit: '10mb' }));

// --- 请求日志中间件 ---
// 打印收到的所有请求路径，方便调试 404 等问题
app.use((req, res, next) => {
  console.log(`[Request] ${req.method} ${req.path}`);
  next();
});

// --- 4. 路由挂载 ---
// 4.1 社交联动路由 (Link Request)
const linkRoutes = require('./routes/link');
app.use('/api/link', linkRoutes.router);

// 4.2 角色管理路由 (Character)
const characterRoutes = require('./routes/character');
app.use('/api/char', characterRoutes);

// 4.3 故事生成路由 (Story)
const storyRoutes = require('./routes/story');
app.use('/api/story', storyRoutes);

// 4.4 用户认证路由 (Auth)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// --- 4.5 404 容错处理 ---
// 捕获所有未匹配的 /api 请求，返回 JSON 而不是 HTML
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `API 接口不存在: ${req.method} ${req.path}` });
});

// 托管上传的图片 (uploads)
// 允许通过 /uploads/xxx.jpg 访问 backend/public/uploads 下的文件
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 托管前端页面 (frontend)
// 性能优化：在生产环境下开启 maxAge 缓存，减少服务器带宽压力
app.use(express.static(path.join(__dirname, '../frontend'), {
  maxAge: isProd ? '1d' : 0 // 生产环境缓存 1 天，开发环境不缓存
}));

// 全局错误处理中间件
// 必须放在所有路由挂载之后，才能捕获到之前路由抛出的 next(err) 错误
app.use((err, req, res, next) => {
  console.error('🔥 Global Error Handler:', err.message);

  let msg = err.message || '系统开小差了，请稍后再试';
  let statusCode = 500;

  // AI 异常特殊化处理
  if (msg.includes('DeepSeek') || msg.includes('Network') || msg.includes('timeout')) {
    msg = '梦境连接不稳定，请稍后再试 (AI Service Busy)';
    statusCode = 503; // Service Unavailable
  }

  res.status(statusCode).json({
    success: false,
    msg: msg
  });
});

// --- 5. 数据库连接与同步 ---
async function startServer() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    console.log('✅ [Database] MySQL 连接成功');

    // 同步数据库模型
    // alter: true 会自动比对并更新表结构，不会删除数据
    await sequelize.sync({ alter: true });
    console.log('📦 [Database] 表结构同步完成');

    // --- 6. 端口监听 ---
    app.listen(port, () => {
      console.log(`🚀 服务器已启动: http://localhost:${port}`);
      console.log(`📂 前端页面预览: http://localhost:${port}/index.html`);
    });

  } catch (error) {
    console.error('❌ [Database] 连接或同步失败:', error.message);
    
    // 增加更详细的错误诊断信息
    if (error.original) {
      if (error.original.code === 'ETIMEDOUT') {
        console.error('   💡 提示: 连接超时。请检查安全组端口 3306 是否开放，或 IP 是否正确。');
      } else if (error.original.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error('   💡 提示: 认证失败。请检查用户名或密码，以及该用户是否拥有远程连接权限 (%)。');
      } else if (error.original.code === 'ECONNREFUSED') {
        console.error('   💡 提示: 连接被拒绝。请检查数据库服务是否已启动，或端口是否正确。');
      }
    }

    process.exit(1); // 数据库连接失败则退出进程
  }
}

startServer();
