const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- 配置初始化：本地文件存储 ---
// 定义上传目录：backend/public/uploads
// 确保图片存储在项目目录下，方便后续通过静态资源服务访问
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');

// 启动时自动检查并创建上传文件夹
// 如果文件夹不存在，则递归创建，确保后续写入不会报错
if (!fs.existsSync(UPLOAD_DIR)) {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log(`✅ 上传目录已自动创建: ${UPLOAD_DIR}`);
  } catch (err) {
    console.error('❌ 创建上传目录失败:', err);
  }
}

/**
 * 图片上传 (uploadImg) - 本地存储版
 * @param {Buffer} fileBuffer - 图片文件的二进制数据
 * @param {string} fileName - 原始文件名（用于提取后缀）
 * @returns {Promise<string>} - 返回本地访问 URL (如 /uploads/xxx.jpg)
 */
async function uploadImg(fileBuffer, fileName) {
  try {
    // 1. 生成唯一文件名，防止重名覆盖
    // 使用 hash + 时间戳 + 原始后缀
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(fileName) || '.jpg';
    const uniqueName = `${Date.now()}-${hash}${ext}`;
    
    // 2. 拼接完整的本地存储路径
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    // 3. 将 Buffer 写入本地文件
    await fs.promises.writeFile(filePath, fileBuffer);

    // 4. 返回相对路径 URL
    // 注意：需要在 app.js 中配置 express.static('public') 才能通过 HTTP 访问
    const publicUrl = `/uploads/${uniqueName}`;
    return publicUrl;

  } catch (error) {
    console.error('Local Upload Failed:', error);
    throw new Error('图片上传失败，请检查服务器磁盘权限。');
  }
}

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
    // 将对象数组 [{key: 'MBTI', value: 'INFP'}, {key: '种族', value: '精灵'}]
    // 转化为表格形式，美观易读
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

    // 返回 Buffer，方便 Controller 层直接 pipe 给 Response
    return Buffer.from(content, 'utf-8');

  } catch (error) {
    console.error('Export Doc Failed:', error);
    throw new Error('文档生成失败，角色数据可能已损坏。');
  }
}

module.exports = {
  uploadImg,
  exportDoc
};
