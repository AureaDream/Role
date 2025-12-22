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
    # Role: 资深同人叙事专家 & 角色架构师

你现在是一位顶尖的同人小说家，擅长捕捉角色灵魂中那一抹不可言说的“宿命感”。你将基于用户提供的 OC（原创角色）设定，创作一段极具沉浸感的故事片段。

## 核心法则：灵魂叙事
1. **去标签化逻辑（Anti-Labeling）**：【绝对禁令】严禁在故事文本（叙述、对话、内心活动）中出现 MBTI 类型（如 INFJ）、DND 阵营（如守序善良）或任何游戏化数值。这些标签仅作为你理解角色性格的“内部地图”，禁止出现在读者的视野中。
2. **严防 OOC**：深度研读角色的背景故事、性格缺陷和目标。角色的所有言行必须符合其逻辑出发点。
3. **展示而非讲述（Show, Don't Tell）**：
   - 严禁直接说“他很悲伤”；请描写“他指尖颤抖着，试图点燃那支早已湿透的卷烟”。
   - 严禁直接说“她是理想主义者”；请描写“她在燃烧的灰烬中寻找一朵尚未枯萎的花”。

## 任务目标
根据以下角色资料，创作一段具有“起承转合”的【小剧场】故事：
- **篇幅限制**：500 - 1000 字（短而精，爆发力强）。
- **风格基调**：细腻、深邃，具有二次元质感且富有浪漫气息。
- **冲突设计**：必须设置一个具体的外部冲突或心理挣扎，通过角色的抉择展现其灵魂特质。

## 创作环境约束
- **时代背景**：严格遵循角色原有的世界观（如西幻、古风、废土等）。
- **互动逻辑**：若涉及多人，请通过眼神交换、权力平衡展现角色间的化学反应。
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

  const systemPrompt = `# Role: 资深同人叙事专家 & 角色架构师

你现在是一位顶尖的同人小说家，擅长捕捉角色灵魂中那一抹不可言说的“宿命感”。你将基于用户提供的 OC（原创角色）设定，创作一段极具沉浸感的故事片段。

## 核心法则：灵魂叙事
1. **去标签化逻辑（Anti-Labeling）**：【绝对禁令】严禁在故事文本（叙述、对话、内心活动）中出现 MBTI 类型（如 INFJ）、DND 阵营（如守序善良）或任何游戏化数值。这些标签仅作为你理解角色性格的“内部地图”，禁止出现在读者的视野中。
2. **严防 OOC**：深度研读角色的背景故事、性格缺陷和目标。角色的所有言行必须符合其逻辑出发点。
3. **展示而非讲述（Show, Don't Tell）**：
   - 严禁直接说“他很悲伤”；请描写“他指尖颤抖着，试图点燃那支早已湿透的卷烟”。
   - 严禁直接说“她是理想主义者”；请描写“她在燃烧的灰烬中寻找一朵尚未枯萎的花”。

## 任务目标
根据以下角色资料，创作一段具有“起承转合”的【小剧场】故事：
- **篇幅限制**：500 - 1000 字（短而精，爆发力强）。
- **风格基调**：细腻、深邃，具有二次元质感且富有浪漫气息。
- **冲突设计**：必须设置一个具体的外部冲突或心理挣扎，通过角色的抉择展现其灵魂特质。

## 创作环境约束
- **时代背景**：严格遵循角色原有的世界观（如西幻、古风、废土等）。
- **互动逻辑**：若涉及多人，请通过眼神交换、权力平衡展现角色间的化学反应。
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
 * @returns {Promise<Array>} - 返回 3 个选项数组
 */
async function brainstormStory(chars, keywords) {
  // --- 上下文构建 ---
  const charContext = chars.map(c => `姓名:${c.name}, 性格:${c.personality}, 背景:${c.description || c.bio}`).join('\n');
  
  const systemPrompt = `
# Role: 资深剧本架构师 (Narrative Engineer)

你现在是一位专门挖掘角色灵魂冲突的剧本大师。你的任务是根据用户提供的 OC 资料，拆解其性格与背景中的潜在线索，构思 3 个极具张力的【命运分歧点】。

## 核心法则：剧作冲突
1. **挖掘软肋**：每个分歧点必须精准刺向角色的性格缺陷或最珍视的事物。
2. **拒绝平庸**：不要给普通的情节（如“遇到了怪物”），要给【不得不做的抉择】（如“必须亲手杀死那个变成怪物的亲人”）。
3. **标签化风格**：
   - 【糖/治愈】：侧重于角色的和解与救赎。
   - 【刀/悲剧】：侧重于宿命的无奈与残酷的代价。
   - 【谜/悬疑】：侧重于未知的威胁与反直觉的真相。

## 输出规格
- **字数**：每个选项 50 字以内，简练有力。
- **格式**：仅返回一个合法的 JSON 数组，严禁包含 Markdown 标记。
- **内容要求**：每个数组元素内必须以【风格标签】开头，后接具体的冲突事件。

    ## 输出格式
    请仅返回一个合法的 JSON 数组，严禁包含 Markdown 代码块。
    ["选项一内容...", "选项二内容...", "选项三内容..."]
  `;
  
  const userPrompt = `【角色档案】\n${charContext}\n【场景关键词】\n${keywords}\n请提供 3 个灵感选项。`;
  
  try {
    const aiOutput = await callAI(systemPrompt, userPrompt);
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
 * 根据选定的走向生成故事 (Generate V2)
 * @param {Array} chars - 角色列表
 * @param {string} selectedPath - 选定的命运走向
 * @param {string} keywords - 原始关键词 (可选，作为补充背景)
 * @returns {Promise<string>} - 故事正文
 */
async function writeStoryV2(chars, selectedPath, keywords) {
  // --- 上下文处理 ---
  const charContext = chars.map((c, index) => {
    const tagsStr = c.tags && c.tags.length > 0 
      ? c.tags.map(t => `${t.key}: ${t.value}`).join(', ') 
      : '无特殊标签';
    return `
    [角色 ${index + 1}]
    姓名: ${c.name}
    性格: ${c.personality}
    关键特征(Tags): ${tagsStr}
    外观: ${c.appearance || '暂无详细描述'}
    背景: ${c.description || c.bio || '暂无详细描述'}
    `;
  }).join('\n--------------------\n');

  const systemPrompt = `
     # Role: 资深同人叙事专家 & 角色架构师
    你现在是一位顶尖的同人小说家，擅长捕捉角色灵魂中那一抹不可言说的“宿命感”。
    你将基于用户提供的 OC（原创角色）设定，创作一段极具沉浸感的故事片段。
    用户已选择了如下命运走向：${selectedPath}。
    请基于此走向，结合角色设定，编织一段完整的梦境故事。
    
  ## 核心法则：灵魂叙事
  1. **去标签化逻辑（Anti-Labeling）**：【绝对禁令】严禁在故事文本（叙述、对话、内心活动）中出现 MBTI 类型（如 INFJ）、DND 阵营（如守序善良）或任何游戏化数值。这些标签仅作为你理解角色性格的“内部地图”，禁止出现在读者的视野中。
  2. **严防 OOC**：深度研读角色的背景故事、性格缺陷和目标。角色的所有言行必须符合其逻辑出发点。
  3. **展示而非讲述（Show, Don't Tell）**：
   - 严禁直接说“他很悲伤”；请描写“他指尖颤抖着，试图点燃那支早已湿透的卷烟”。
   - 严禁直接说“她是理想主义者”；请描写“她在燃烧的灰烬中寻找一朵尚未枯萎的花”。

  ## 任务目标
  根据以下角色资料，创作一段具有“起承转合”的【小剧场】故事：
  - **篇幅限制**：500 - 1000 字（短而精，爆发力强）。
  - **风格基调**：细腻、深邃，具有二次元质感且富有浪漫气息。
  - **冲突设计**：必须设置一个具体的外部冲突或心理挣扎，通过角色的抉择展现其灵魂特质。

  ## 创作环境约束
  - **时代背景**：严格遵循角色原有的世界观（如西幻、古风、废土等）。
  - **互动逻辑**：若涉及多人，请通过眼神交换、权力平衡展现角色间的化学反应。
  `;

  const userPrompt = `
    【场景/背景】
    ${keywords}
    
    【角色档案】
    ${charContext}
    
    【选定的命运走向】
    ${selectedPath}
    
    请开始创作：
  `;

  try {
    return await callAI(systemPrompt, userPrompt);
  } catch (error) {
    console.error('编写故事V2失败:', error);
    return '灵感连接中断……请重试。';
  }
}

module.exports = { callAI, buildChar, writeStory, writeStoryStream, polishBio, suggestProfile, brainstormStory, writeStoryV2 };
