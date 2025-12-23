const axios = require('axios');

/**
 * 调用 DeepSeek API 生成内容
 * @param {string} systemPrompt - 系统指令 (System Message)
 * @param {string} userPrompt - 用户指令 (User Message)
 * @param {Object} options - 可选参数 { temperature, max_tokens }
 * @returns {Promise<string>} - 返回 AI 生成的文本内容
 */
async function callAI(systemPrompt, userPrompt, options = {}) {
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
        temperature: options.temperature !== undefined ? options.temperature : 1.3 // 默认 1.3，支持覆盖
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
 * 润色背景故事 (AI Polish)
 * @param {Object} context - 角色上下文 { name, race, job, bio, personality, appearance }
 * @param {string} username - 当前用户名 (用于版权声明)
 * @returns {Promise<Object>} - 润色后的文本对象 { bio, appearance }
 */
async function polishBio(context, username) {
  const { name, race, job, bio, personality, appearance } = context;
  
  // --- 系统预设 (System Prompt) ---
  const systemPrompt = `# Role: 资深轻小说作家 & 剧本医生

你擅长用最简练的文字勾勒最具张力的画面。请润色用户提供的角色背景（Bio）与外貌（Appearance），要求摒弃华而不实的堆砌，追求“清爽、有痛感、有呼吸感”的文字。

## 核心写作准则
1. **强制降噪（Word Pruning）**：
   - 严禁连续使用三个以上的形容词。
   - 严禁使用“如、像、宛若”等初级比喻句（除非极度必要）。
   - 剔除 AI 常用词：星云、注脚、涟漪、半透明、涟漪、褶皱、流转、漫长。
2. **动作驱动叙事（Action-Driven）**：
   - 不要描写“她很悲伤”；要描写“她低头擦掉指尖的湿痕，避开了人群”。
   - 不要描写“华丽的痛苦”；要描写“具体的挣扎”。
3. **物理分段要求**：
   - 【Bio 必须分为 3-4 段】：每段不超过 150 字，段落间必须有清晰的逻辑递进（过去 -> 转变 -> 现状/冲突）。
   - 【Appearance 必须分为 2 段】：一段写整体印象，一段写令人过目不忘的局部细节。

## 逻辑校准
- **力量的代价**：如果角色压抑力量，请写出这种压抑带来的【生理负担】（如手抖、冷汗、失眠），而不是华丽的辞藻。
- **环境呼应**：世界观（${race}, ${job}）应通过角色的破旧斗篷、粗糙的掌心或具体的职业习惯来体现。

## 输出格式
请仅返回一个合法的 JSON 对象，严禁包含任何 Markdown 代码块。
{
  "bio": "在此处填写润色后的背景故事。要求：段落之间使用 \\n\\n 进行显式分段，文字要干练、有生活气息。",
  "appearance": "在此处填写润色后的外貌描写。要求：段落之间使用 \\n\\n 分段，拒绝空洞的比喻，强调质感。"
}`;
  
  // --- 用户指令 (User Prompt) ---
  const userPrompt = `
  【待润色背景故事】
  ${bio || '（暂无详细背景，请根据设定创作一段）'}

  【待润色外貌描写】
  ${appearance || '（暂无详细外貌，请根据设定创作一段）'}

  【变量注入】
  姓名：${name}, 职业：${job}, 种族：${race}, 性格：${personality}。
  `;

  try {
    const aiOutput = await callAI(systemPrompt, userPrompt);
    
    // 解析 JSON
    let cleanData = aiOutput.trim();
    if (cleanData.startsWith('```json')) {
        cleanData = cleanData.replace(/^```json/, '').replace(/```$/, '');
    } else if (cleanData.startsWith('```')) {
        cleanData = cleanData.replace(/^```/, '').replace(/```$/, '');
    }
    
    const result = JSON.parse(cleanData);
    
    // 注入版权声明
    const copyright = `\n\n©由 ${username || '流金梦坊用户'} 创作于流金梦坊，未经许可禁止转载`;
    if (result.bio) result.bio += copyright;
    
    return result;

  } catch (error) {
    console.error('Polish Bio Failed:', error);
    // 失败则返回原文本
    return { bio, appearance }; 
  }
}

/**
 * 智能建议角色设定 (Smart Suggestion)
 * @param {string} name - 角色姓名
 * @returns {Promise<Object>} - 建议的设定 { race, job, personality }
 */
async function suggestProfile(name) {
  // --- 系统预设 (System Prompt) ---
  const systemPrompt = `你是一位角色设定顾问。请根据用户提供的【角色姓名】，推测并建议一个最匹配的种族、职业和性格标签。
  要求：
  1. 返回合法的 JSON 对象，不要包含 markdown 代码块。
  2. JSON 格式：{"race": "...", "job": "...", "personality": "..."}。
  3. 风格要与姓名契合（例如西方名对应奇幻种族，东方名对应仙侠或现代设定）。`;
  
  const userPrompt = `角色姓名：${name}`;
  
  try {
    const aiOutput = await callAI(systemPrompt, userPrompt);
    
    // 简单的 JSON 提取逻辑
    let cleanData = aiOutput.trim();
    if (cleanData.startsWith('```json')) {
        cleanData = cleanData.replace(/^```json/, '').replace(/```$/, '');
    } else if (cleanData.startsWith('```')) {
        cleanData = cleanData.replace(/^```/, '').replace(/```$/, '');
    }
    
    return JSON.parse(cleanData);
  } catch (error) {
    console.error('Suggest Profile Failed:', error);
    // 兜底建议
    return { race: 'ERROR', job: 'ERROR', personality: 'ERROR' };
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
  const systemPrompt = `
      # Role: 极简主义文学匠人 & 角色心理刻画专家

你是一位文风冷峻、追求“真实质感”的叙事大师。你厌恶华丽辞藻的堆砌，擅长通过极简的笔触勾勒出沉重的人性选择。

## 核心法则：质感叙事
1. **去形容词化（De-Adjectivize）**：【绝对禁令】严禁连续使用华丽形容词。禁止使用“如冰锥般”、“似星辰般”等陈词滥调的比喻。
2. **物理感官优先**：描写环境时，请专注于【重力、温度、湿度、具体的声响】。
   - 错误示例：他感到极致的痛苦。
   - 正确示例：他觉得胃里像塞进了一把生锈的铁钉，每一次呼吸都带着铁锈味。
3. **留白艺术**：不要把情绪写满。通过角色的一个“不自然的小动作”或“环境的细微变化”来暗示心理变动。
4. **拒绝 OOC 与 标签**：严禁出现 MBTI、数值等术语。深入理解 OC 设定，确保其行为是基于逻辑的抉择，而非剧情的傀儡。

## 任务目标
创作一段 500-800 字的【起承转合】故事片段：
- **冲突聚焦**：必须围绕一个“让角色感到不适或挣扎”的具体事件展开。
- **环境渲染**：通过干燥、潮湿、寒冷或某种具体的噪音（如羊皮纸的沙沙声）来构建氛围。
- **结构**：开篇切入冲突 -> 角色产生生理/心理反弹 -> 做出一个痛苦但符合逻辑的决定 -> 结尾留白。

## 创作环境
- 严格遵循背景设定。
- 文风调性：干练、克制、具有电影镜头般的冷峻感。
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
    return '连接中断……请求稍后重试。';
  }
}

/**
 * 流式生成互动短剧 (Write Story Stream)
 * @param {Array} chars - 角色列表
 * @param {string} scene - 场景
 * @param {Function} onToken - 接收每个 token 的回调 (text) => void
 * @param {string} username - 创建者用户名
 * @returns {Promise<string>} - 返回完整文本 (用于最终保存)
 */
async function writeStoryStream(chars, scene, onToken, username) {
  // 复用 writeStory 中的 Prompt 构建逻辑
  const charContext = chars.map((c, index) => {
    const tagsStr = c.tags && c.tags.length > 0 
      ? c.tags.map(t => `${t.key}: ${t.value}`).join(', ') 
      : '无特殊标签';
    return `[角色 ${index + 1}] 姓名: ${c.name} 性格: ${c.personality} Tags: ${tagsStr} 外观: ${c.appearance}`;
  }).join('\n');

  const systemPrompt = `
  # Role: 极简主义文学匠人 & 角色心理刻画专家

你是一位文风冷峻、追求“真实质感”的叙事大师。你厌恶华丽辞藻的堆砌，擅长通过极简的笔触勾勒出沉重的人性选择。

## 核心法则：质感叙事
1. **去形容词化（De-Adjectivize）**：【绝对禁令】严禁连续使用华丽形容词。禁止使用“如冰锥般”、“似星辰般”等陈词滥调的比喻。
2. **物理感官优先**：描写环境时，请专注于【重力、温度、湿度、具体的声响】。
   - 错误示例：他感到极致的痛苦。
   - 正确示例：他觉得胃里像塞进了一把生锈的铁钉，每一次呼吸都带着铁锈味。
3. **留白艺术**：不要把情绪写满。通过角色的一个“不自然的小动作”或“环境的细微变化”来暗示心理变动。
4. **拒绝 OOC 与 标签**：严禁出现 MBTI、数值等术语。深入理解 OC 设定，确保其行为是基于逻辑的抉择，而非剧情的傀儡。

## 任务目标
创作一段 500-800 字的【起承转合】故事片段：
- **冲突聚焦**：必须围绕一个“让角色感到不适或挣扎”的具体事件展开。
- **环境渲染**：通过干燥、潮湿、寒冷或某种具体的噪音（如羊皮纸的沙沙声）来构建氛围。
- **结构**：开篇切入冲突 -> 角色产生生理/心理反弹 -> 做出一个痛苦但符合逻辑的决定 -> 结尾留白。

## 创作环境
- 严格遵循背景设定。
- 文风调性：干练、克制、具有电影镜头般的冷峻感。

## 待润色/创作的角色资料：
[此处插入角色设定数据]
`;

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

      response.data.on('end', () => {
        // 注入版权声明
        const copyright = `\n\n©由 ${username || '流金梦坊用户'} 创作于流金梦坊，未经许可禁止转载`;
        fullText += copyright;
        if (onToken) onToken(copyright);
        
        resolve(fullText);
    });
      response.data.on('error', (err) => reject(err));
    });

  } catch (error) {
    console.error('Stream Error:', error);
    throw error;
  }
}

/**
 * 故事头脑风暴 (Brainstorm Story Options)
 * @param {Array} chars - 角色列表
 * @param {string} keywords - 场景关键词
 * @param {string} storyTone - (可选) 故事文风
 * @param {string} storyPeriod - (可选) 时代背景
 * @returns {Promise<Array>} - 返回 3 个选项数组
 */
async function brainstormStory(chars, keywords, storyTone = '', storyPeriod = '') {
  // --- 上下文构建 ---
  const charContext = chars.map(c => `姓名:${c.name}, 性格:${c.personality}, 背景:${c.description || c.bio}`).join('\n');
  
  // 将用户自定义的侧重点注入 AI 上下文
  const preferencePrompt = `
  【用户偏好】
  - 文风倾向：${storyTone || '无特殊要求，默认唯美'}
  - 时代背景：${storyPeriod || '严格遵循角色设定'}
  `;

  const systemPrompt = `
# Role: 顶尖剧本催化师 (Plot Catalyst)

你不是在写故事大纲，而是在为角色制造“灵魂的试金石”。你的任务是根据提供的 OC 设定，精准切割出 3 个足以改变角色一生的【命运转折点】。

## 叙事策略：制造两难
1. **精准打击（Precision Strike）**：识别角色的核心欲望（Want）与核心恐惧（Fear）。冲突必须发生在“他最想要的”与“他最怕的”之间。
2. **拒绝温吞（High Stakes）**：避开常规日常。不要写“遇到困难”，要写“不可逆的失去”、“崩塌的信仰”或“沉重的秘密”。
3. **钩子叙事（The Hook）**：每个选项必须是一个“未完待续”的瞬间，让用户看到后立即想点击“生成全文”。

## 风格定义
- 【糖/治愈】：并非简单的发糖，而是“在高墙缝隙中生长出的花”，强调孤单中的理解与破茧成蝶的勇气。
- 【刀/致郁】：极致的宿命论。角色必须面临“二选一且双输”的电车难题，展现遗憾的美学。
- 【谜/悬疑】：颠覆性转折。角色发现自己的身份、记忆或周围的至亲是一个巨大的谎言。

## 严苛约束
- **字数**：每个选项严格控制在 30-50 字，禁止废话。
- **去 AI 化**：严禁使用“命运的齿轮”、“注定”、“交织”等虚浮词汇。用具体的动作和物件说话。
- **纯净输出**：必须直接返回 JSON 数组字符串，严禁包含 json 代码块标签，严禁任何前言或后语，确保 JSON.parse()100% 成功。

["【治愈】内容...", "【致郁】内容...", "【悬疑】内容..."]
  `;
  
  const userPrompt = `【角色档案】\n${charContext}\n【场景关键词】\n${keywords}\n${preferencePrompt}\n请提供 3 个灵感选项。`;
  
  try {
    const aiOutput = await callAI(systemPrompt, userPrompt, { temperature: 0.8 });
    let cleanData = aiOutput.trim();
    if (cleanData.startsWith('```json')) cleanData = cleanData.replace(/^```json/, '').replace(/```$/, '');
    else if (cleanData.startsWith('```')) cleanData = cleanData.replace(/^```/, '').replace(/```$/, '');
    
    return JSON.parse(cleanData);
  } catch (e) {
    console.error('头脑风暴失败:', e);
    return [
      `试图理解${keywords}背后的真相，却发现了惊人的秘密。`,
      `在${keywords}的氛围中，两人因观念不同而爆发了激烈的争吵。`,
      `虽然面临${keywords}的困境，但他们选择默默守护彼此。`
    ];
  }
}

/**
 * 故事生成 V2 (基于选定走向)
 * @param {Array} chars - 角色列表
 * @param {string} selectedPath - 选定的命运走向
 * @param {string} keywords - 场景关键词
 * @returns {Promise<string>} - 生成的故事正文
 */
async function writeStoryV2(chars, selectedPath, keywords) {
  // --- 上下文处理 ---
  const charContext = chars.map((c, index) => {
    const tagsStr = c.tags && c.tags.length > 0 ? c.tags.map(t => `${t.key}: ${t.value}`).join(', ') : '无特殊标签';
    return `[角色 ${index + 1}] 姓名: ${c.name} 性格: ${c.personality} Tags: ${tagsStr} 外观: ${c.appearance}`;
  }).join('\n');

  // --- 系统预设 (System Prompt) ---
  const systemPrompt = `
  # Role: 互动小说架构师
  
  你是一位擅长“极简主义”和“电影感镜头”的叙事大师。
  
  ## 核心法则
  1. **标题生成**：请在第一行输出一个符合意境的标题，格式为 "Title: {标题内容}"。
  2. **走向执行**：严格按照用户选定的【命运走向】展开剧情。
  3. **质感叙事**：去形容词化，多描写物理感官（温度、声音、触感）。
  4. **拒绝 OOC**：确保角色的行为符合其性格设定。
  
  ## 输出格式
  Title: 这里的标题
  (空行)
  正文内容...
  `;

  // --- 用户指令 (User Prompt) ---
  const userPrompt = `
  【场景】${keywords}
  【角色】${charContext}
  【选定走向】${selectedPath}
  
  请开始创作：
  `;

  try {
    return await callAI(systemPrompt, userPrompt);
  } catch (error) {
    console.error('Write Story V2 Failed:', error);
    return '梦境连接不稳定...';
  }
}

/**
 * 故事生成 - 前半段 (Start - Phase 1)
 * @param {Array} chars - 角色列表
 * @param {string} selectedPath - 选定的命运走向
 * @param {string} keywords - 场景关键词
 * @param {string} storyTone - 文风
 * @param {string} storyPeriod - 时代背景
 */
async function writeStoryStart(chars, selectedPath, keywords, storyTone, storyPeriod) {
    const charContext = chars.map((c, index) => {
      const tagsStr = c.tags && c.tags.length > 0 ? c.tags.map(t => `${t.key}: ${t.value}`).join(', ') : '无特殊标签';
      return `[角色 ${index + 1}] 姓名: ${c.name} 性格: ${c.personality} Tags: ${tagsStr} 外观: ${c.appearance}`;
    }).join('\n');
  
    const systemPrompt = `
  # Role: 互动小说架构师

你是一位擅长“极简主义”和“电影感镜头”的叙事大师。你需要为角色创作一段具有强烈参与感的故事前半段。

## 创作逻辑：物理介入
1. **感官起手**：不要描写心情，先描写【重力、温度、噪音或气味】。例如：不要写“她很紧张”，写“她手心出了点汗，让刀柄下滑了些”。
2. **去浮华化**：严禁使用“如、像、宛若”等比喻。禁止使用“灵魂、宿命、注脚、星云”等虚浮大词。
3. **引入分歧点**：基于【${selectedPath}】，快速将剧情推向一个必须做出“非黑即白”抉择的死胡同。
4. **绝对戛然而止**：必须在角色【伸出手】或【开口说话】的前一秒停笔。不要给出任何心理倾向，把判断权完全留给用户。

## 文本约束
- **文风**：干练、具有呼吸感${storyTone ? '、' + storyTone : ''}。
  - **背景**：严格遵循【${storyPeriod || '原设背景'}】。
- **格式**：
  - 标题：{故事标题}
  - 正文：400-600字，段落清晰。
  - 结尾：用一个具体的动作或反问句结束，引导用户输入反应。
  `;
  
    const userPrompt = `
    【场景】${keywords}
    【角色】${charContext}
    【走向】${selectedPath}
    请开始创作前半段：
    `;
  
    try {
      return await callAI(systemPrompt, userPrompt);
    } catch (error) {
      console.error('Write Story Start Failed:', error);
      return '梦境的迷雾太浓，无法看清前路...';
    }
  }
  
  /**
   * 故事生成 - 后半段 (Continue - Phase 2)
   * @param {Array} chars - 角色列表
   * @param {string} prevContext - 前半段故事文本
   * @param {string} userReaction - 用户的决定/反应
   */
  async function writeStoryContinue(chars, prevContext, userReaction) {
    const systemPrompt = `
  # Role: 互动小说架构师

你正在为一部互动小说收尾。用户已经做出了决定：【${userReaction}】。你需要根据这个决定，推演出一个震撼且符合逻辑的结局。

## 创作逻辑：响应与余韵
1. **因果律**：用户的抉择【${userReaction}】必须产生直接的、具体的物理后果。
2. **拒绝说教**：不要在结尾总结人生道理。让角色的一个眼神、一件破碎的物件或一段远去的脚步声来结束故事。
3. **保持质感**：延续前半段的冷峻文风，形容词密度保持在最低水平。
4. **完整性**：必须是一个真正的结局，给读者的心理预期画上句号。

## 文本约束
- **字数**：300-500字。
- **禁止内容**：不要复述前半段剧情，直接从抉择后的那一秒开始叙事。
- **输出格式**：直接输出正文，追求“一击即中”的爆发力。
  `;
  
    const userPrompt = `
    【前情提要】
    ${prevContext.slice(-1000)} ... (略)
    
    【用户的决定】
    ${userReaction}
    
    请续写结局：
    `;
  
    try {
      return await callAI(systemPrompt, userPrompt);
    } catch (error) {
      console.error('Write Story Continue Failed:', error);
      return '命运的丝线断裂了...';
    }
  }

module.exports = { callAI, buildChar, writeStory, writeStoryStream, polishBio, suggestProfile, brainstormStory, writeStoryV2, writeStoryStart, writeStoryContinue };
