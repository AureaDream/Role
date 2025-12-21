const axios = require('axios');

/**
 * 调用 DeepSeek API 生成内容
 * @param {string} systemPrompt - 系统指令 (System Message)
 * @param {string} userPrompt - 用户指令 (User Message)
 * @returns {Promise<string>} - 返回 AI 生成的文本内容
 */
async function callAI(systemPrompt, userPrompt) {
  const apiKey = process.env.DEEPSEEK_KEY;
  const url = 'https://api.deepseek.com/chat/completions'; // DeepSeek 官方 API 地址

  if (!apiKey) {
    throw new Error('DeepSeek API Key is missing. Please set process.env.DEEPSEEK_KEY');
  }

  try {
    const result = await axios.post(
      url,
      {
        model: 'deepseek-chat', // 使用 deepseek-v3 或 deepseek-chat
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false, // 设置为 true 可开启流式输出 (Streaming)
        temperature: 1.3 // 这里的温度设为 1.3 以激发创意，可根据需求调整
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      }
    );

    // DeepSeek 返回的数据结构通常遵循 OpenAI 格式
    // 如果开启流式输出 (stream: true)，需要处理 result.data (stream) 事件流
    // 这里处理普通输出 (Non-streaming)
    return result.data.choices[0].message.content;

  } catch (error) {
    console.error('DeepSeek API Call Failed:', error.response ? error.response.data : error.message);
    throw error;
  }
}

/**
 * 根据用户提供的关键词，自动补全角色的人设详情
 * @param {string} inputData - 用户输入的原始关键词（如：姓名、性格、职业等）
 * @returns {Promise<Object>} - 返回解析后的 JSON 对象，包含 appearance 和 bio
 */
async function buildChar(inputData) {
  // --- 系统预设 (System Prompt) ---
  // 核心逻辑：
  // 1. 设定身份：资深二次元人设架构师。
  // 2. 风格引导：‘流金梦坊’风格要求文字具有画面感、唯美且略带神秘的文学气息。
  // 3. 结构约束：强制返回 JSON 格式，确保后端可以解析。
  const systemPrompt = `
    你是一位资深二次元人设架构师，服务于‘流金梦坊’创作平台。
    你的任务是根据用户提供的少量关键词，扩展出富有逻辑、魅力且细节丰富的角色设定。
    
    【风格要求】
    1. 描写需具有画面感，用词考究，带有唯美、梦幻或略带忧伤的文学气息（符合‘流金梦坊’调性）。
    2. 避免流水账，注重展现角色的灵魂特质。
    
    【输出要求】
    请仅返回一个合法的 JSON 对象，不要包含 markdown 代码块或其他解释性文字。
    JSON 格式如下：
    {
      "appearance": "外貌描写的长文本，包含发色、瞳色、衣着风格及独特特征...",
      "bio": "背景故事的长文本，包含过往经历、性格成因及核心愿望..."
    }
  `;

  // --- 用户指令 (User Prompt) ---
  // 将用户输入的数据包装，明确补全任务
  const userPrompt = `请根据以下关键词构建角色：${inputData}`;

  try {
    // 调用基础 AI 函数
    const aiOutput = await callAI(systemPrompt, userPrompt);
    
    // --- 数据清洗与解析 ---
    // 尝试解析 AI 返回的 JSON 字符串
    // 有时 AI 可能会包裹 markdown 代码块 (```json ... ```)，需要简单处理
    let cleanData = aiOutput.trim();
    if (cleanData.startsWith('```json')) {
        cleanData = cleanData.replace(/^```json/, '').replace(/```$/, '');
    } else if (cleanData.startsWith('```')) {
        cleanData = cleanData.replace(/^```/, '').replace(/```$/, '');
    }

    const parsedData = JSON.parse(cleanData);
    
    return {
      appearance: parsedData.appearance || '外貌描写生成失败',
      bio: parsedData.bio || '背景故事生成失败'
    };

  } catch (error) {
    console.error('Build Character Failed:', error);
    // 返回兜底数据，避免前端崩溃
    return {
      appearance: 'AI 正在闭关修炼，暂时无法描绘此外貌...',
      bio: '命运的迷雾遮挡了这段过往...'
    };
  }
}

/**
 * 根据传入的角色列表和场景关键词，生成互动短剧
 * @param {Array} chars - 参与故事的角色列表 (OC Array)
 * @param {string} scene - 场景关键词或简述
 * @returns {Promise<string>} - 生成的故事正文
 */
async function writeStory(chars, scene) {
  // --- 上下文处理：构建多角色背景 ---
  // 将 OC 数组转换为 AI 可理解的文本格式。
  // 重点处理 'tags' (自定义标签)，将 MBTI、属性等关键信息显式喂给 AI，
  // 确保 AI 能捕捉到角色的细微特质，避免千人一面。
  const charContext = chars.map((c, index) => {
    // 格式化标签：将 [{key: 'MBTI', value: 'INFP'}] 转换为 "MBTI: INFP"
    const tagsStr = c.tags && c.tags.length > 0 
      ? c.tags.map(t => `${t.key}: ${t.value}`).join(', ') 
      : '无特殊标签';
      
    return `
    [角色 ${index + 1}]
    姓名: ${c.name}
    性别/年龄: ${c.gender} / ${c.age || '未知'}
    简介: ${c.intro}
    性格: ${c.personality}
    关键特征(Tags): ${tagsStr}
    外观: ${c.appearance || '暂无详细描述'}
    背景: ${c.background || '暂无详细描述'}
    `;
  }).join('\n--------------------\n');

  // --- 系统预设 (System Prompt) ---
  // 设定身份：细腻的同人小说家。
  // 核心约束：
  // 1. 严格遵守 Character Context 中的性格和 Tags，严禁 OOC (Out Of Character)。
  // 2. 互动感：重点描写角色之间的语言、动作和眼神交流。
  // 3. 篇幅控制：500-1000字。
  // 4. 风格：‘流金梦幻风格’——文字需如流动的金沙般细腻、璀璨，带有梦境般的朦胧美与宿命感。
  const systemPrompt = `
    你是一位笔触细腻的同人小说家，擅长捕捉人物间微妙的情感流动和张力。
    请根据提供的【角色档案】和【场景设定】，创作一篇 500-1000 字的互动短剧。
    
    【创作要求】
    1. **拒绝 OOC**：请反复研读角色的性格（personality）和标签（tags，如 MBTI），确保角色的言行逻辑完全符合设定。
    2. **沉浸感**：多用“展示”而非“讲述”的手法，通过微表情、肢体语言和环境烘托来表现角色心理。
    3. **互动性**：如果是多人场景，请平衡各角色的戏份，展现他们之间的化学反应。
    4. **流金梦幻风格**：
       - 环境描写：融入光影、星辰、金沙、梦境等意象，营造唯美氛围。
       - 情感基调：细腻、深邃，略带一丝不可言说的宿命感或浪漫气息。
  `;

  // --- 用户指令 (User Prompt) ---
  // 拼接角色档案与当前场景
  const userPrompt = `
    【场景设定】
    ${scene}
    
    【角色档案】
    ${charContext}
    
    请开始创作：
  `;

  try {
    // 检查是否需要流式输出 (根据调用方是否传入回调函数)
    // 注意：这里为了兼容 story.js 的流式改写，我们需要扩展 callAI 或在此处直接处理
    // 为了保持架构简单，建议 story.js 直接调用 writeStoryStream (下文新增)
    // 但此处我们先保留非流式兼容，同时暴露流式接口
    const storyText = await callAI(systemPrompt, userPrompt);
    return storyText;
  } catch (error) {
    console.error('Write Story Failed:', error);
    return '灵感枯竭中... 请稍后再试。';
  }
}

/**
 * 流式生成互动短剧 (Write Story Stream)
 * @param {Array} chars - 角色列表
 * @param {string} scene - 场景
 * @param {Function} onToken - 接收每个 token 的回调 (text) => void
 * @returns {Promise<string>} - 返回完整文本 (用于最终保存)
 */
async function writeStoryStream(chars, scene, onToken) {
  // 复用 writeStory 中的 Prompt 构建逻辑
  const charContext = chars.map((c, index) => {
    const tagsStr = c.tags && c.tags.length > 0 
      ? c.tags.map(t => `${t.key}: ${t.value}`).join(', ') 
      : '无特殊标签';
    return `[角色 ${index + 1}] 姓名: ${c.name} 性格: ${c.personality} Tags: ${tagsStr} 外观: ${c.appearance}`;
  }).join('\n');

  const systemPrompt = `你是一位擅长‘流金梦幻风格’的同人小说家。请根据角色档案和场景，创作一篇500字左右的互动短剧。
  要求：文笔细腻璀璨，如流动的金沙；严禁OOC；多描写光影与心理活动。`;

  const userPrompt = `【场景】${scene}\n【角色】${charContext}\n请开始创作：`;

  const apiKey = process.env.DEEPSEEK_KEY;
  const url = 'https://api.deepseek.com/chat/completions';

  try {
    const response = await axios.post(url, {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: true, // 开启流式
      temperature: 1.3
    }, {
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${apiKey}` 
      },
      responseType: 'stream' // Axios 接收流
    });

    return new Promise((resolve, reject) => {
      let fullText = '';
      
      response.data.on('data', (chunk) => {
        // chunk 是 Buffer，转为 string
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (line === 'data: [DONE]') continue;
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.replace('data: ', '');
              const json = JSON.parse(jsonStr);
              const content = json.choices[0].delta.content || '';
              if (content) {
                fullText += content;
                if (onToken) onToken(content);
              }
            } catch (e) {
              console.error('JSON Parse Error in Stream:', e);
            }
          }
        }
      });

      response.data.on('end', () => resolve(fullText));
      response.data.on('error', (err) => reject(err));
    });

  } catch (error) {
    console.error('Stream Error:', error);
    throw error;
  }
}

module.exports = { callAI, buildChar, writeStory, writeStoryStream };
