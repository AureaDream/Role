const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// --- 配置初始化：本地文件存储 ---
// 定义上传目录：backend/private_uploads (改为私有目录)
// 物理隔离：确保原图保存在非公开目录，前端只能通过带有水印的接口读取图片。
const UPLOAD_DIRS = {
  image: path.join(__dirname, '../public/uploads'), // 立绘
  avatar: path.join(__dirname, '../public/image')   // 头像
};

// 启动时自动检查并创建上传文件夹
Object.values(UPLOAD_DIRS).forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`✅ 上传目录已自动创建: ${dir}`);
    } catch (err) {
      console.error('❌ 创建上传目录失败:', err);
    }
  }
});

// --- Multer 配置 (DiskStorage) ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 根据 fieldname 决定存储目录
    if (file.fieldname === 'avatar') {
      cb(null, UPLOAD_DIRS.avatar);
    } else {
      // 默认为 image (立绘)
      cb(null, UPLOAD_DIRS.image);
    }
  },
  filename: function (req, file, cb) {
    // 生成唯一文件名
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${Date.now()}-${hash}${ext}`;
    cb(null, uniqueName);
  }
});

// 导出配置好的 multer 实例
const upload = multer({ storage: storage });

/**
 * 文本导出生成 (exportDoc)
 * @param {Object} charData - OC 的 JSON 数据
 * @returns {Buffer} - 返回格式化后的 Markdown 文本 Buffer，供前端下载
 */
function exportDoc(charData) {
  try {
    // --- 格式化排版 ---
    // 将 JSON 数据转化为排版整齐的 Markdown 文本
    // 1. 标题与基础信息
    let content = `# ${charData.name || '未命名角色'} - 角色档案\n\n`;
    
    content += `## 基础信息\n`;
    content += `- **性别**: ${charData.gender || '未知'}\n`;
    content += `- **年龄**: ${charData.age || '未知'}\n`;
    content += `- **一句话简介**: ${charData.intro || '暂无'}\n\n`;

    // 2. 核心设定
    content += `## 核心设定\n`;
    content += `### 外貌描述\n${charData.appearance || '暂无详细描述'}\n\n`;
    content += `### 性格特征\n${charData.personality || '暂无详细描述'}\n\n`;
    content += `### 背景故事\n${charData.background || '暂无详细描述'}\n\n`;

    // 3. 自定义标签 (Tags) 优雅转化
    if (charData.tags && charData.tags.length > 0) {
      content += `## 详细属性\n`;
      content += `| 属性名 | 属性值 |\n`;
      content += `| :--- | :--- |\n`;
      charData.tags.forEach(tag => {
        content += `| ${tag.key} | ${tag.value} |\n`;
      });
      content += `\n`;
    }

    content += `---\n*生成于 ‘流金梦坊’*`;

    return Buffer.from(content, 'utf-8');

  } catch (error) {
    console.error('Export Doc Failed:', error);
    throw new Error('文档生成失败，角色数据可能已损坏。');
  }
}

module.exports = {
  upload,     // 导出中间件
  exportDoc
};
