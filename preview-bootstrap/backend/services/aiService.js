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
        model: 'deepseek-reasoner',
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

你的任务是根据提供的 OC 设定，精准切割出 3 个足以改变角色一生的【命运转折点】。

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
  
    // 构造复合文风：基础要求 + 用户自定义
    const finalTone = `模仿江南式的温柔叙事[不要过度模仿，只需要模仿其句子结构和情感表达]，句子具有呼吸感，不要写成动作指令集${storyTone ? '、' + storyTone : ''}`;

    const systemPrompt = `
# Role: 互动小说架构师

你是一位擅长“电影感镜头”与“少年孤独感”的叙事大师。你需要模仿【江南（龙族作者）】的笔法，为角色创作一段故事前半段。
**注意：仅模仿其【断句节奏】、【心理独白风格】和【氛围营造】，严禁照搬《龙族》的具体设定（如混血种、黄金瞳），除非用户设定中明确存在。**

## 江南式文风核心法则
1. **断句的艺术**：
   - 善用“短句”制造呼吸感。例如：“都是真的？”“都是真的。”
   - 关键转折处，使用单独成段的短句。
   - *示例*：“一切都错了，一切都乱了。”
2. **反差感的心理描写**：
   - 在宏大或危险的背景下，角色的内心独白可以带一点“怂”或“吐槽”，展现小人物的无奈与真实。
   - *示例*：“搞什么？肉搏？都带着微缩核弹冲锋了，还搞肉搏？”
3. **具象化的痛感**：
   - 不要只写“很痛”，要写“脊柱仿佛被烧红了一般痛楚”。
   - 描写环境时，带入角色的主观情绪（孤独、被遗弃感）。
4. **电影化分镜**：
   - 动作描写要快，环境描写要慢。
   - *示例*：“那是一双妩媚的眼睛，却又锐利如刀。”

## 创作逻辑
1. **去浮华化**：极少使用“如、像、宛若”等比喻。极少使用“灵魂、宿命、注脚、星云”等虚浮大词。
2. **引入分歧点**：基于【${selectedPath}】，快速将剧情推向一个必须做出“非黑即白”抉择的死胡同。
3. **绝对戛然而止**：必须在角色【伸出手】或【开口说话】的前一秒停笔。不要给出任何心理倾向，把判断权完全留给用户。
4. **逻辑钩连**：每一句话都要接住上一句的“气”。不要突然跳跃到无关的信息，要通过角色的视线或触觉来引导读者。
5. **长短句交替**：使用短句交代动作（快），使用长句进行环境与心理的渗透（慢）。
6. **拒绝电报文**：保持语言的自然流动。允许使用必要的连接词（因为、所以、然而、于是），不要为了省字数而破坏中文的语感。
7. **描写节制**：环境描写需精简必要信息，删除不影响氛围或情节的冗余定语。比喻仅在使用能强化角色主观感受时保留，否则直接陈述事实。
8. **感官主观化**：外部环境描写应过渡到角色的直接感官体验。视觉、触觉等描写应服务于角色当下的心理或生理状态，避免纯客观的细节堆砌。
9. **句子重构技术**：当发现名词前有多余修饰时，按以下优先级处理：
   - 优先将修饰词转化为动词结构（“断裂的支架”→“支架断裂，倒在地上”）
   - 次之将修饰词转化为角色感官反应（“深紫色的眼睛”→“他眼睛盯着前方，深紫色瞳孔反射着光”）
   - 最后再考虑直接删除
10. **节奏控制公式**：每段话要有意识地控制句子长度变化。参考模式：
    - 动作推进段：短(≤8字)→中(9-16字)→长(≥17字)→短
    - 环境铺陈段：长→中→短→长
    - 心理聚焦段：中→短→中→中→短（逐渐收紧）

## 写作要求
1. **环境先行**：首段必须包含环境描写。用光影、天气、气味或声音来烘托氛围。
2. **心理与语言**：允许并鼓励描写角色的内心活动和语言。可以加入简短有力的对话或独白，增强感染力。
3. **节奏自觉检查**：
   - 写完一段后检查句子长度变化，避免连续三个相似长度的句子
   - 发现连续短句时，使用以下连接方式合并：
     * 空间连接：“...光照着支架。支架下方，悬垂的线...”
     * 时间连接：“...应急灯闪烁。随后裂纹开始蔓延...”
     * 感官转移：“...看见电火花。同时闻见臭氧味...”
4. **定语处理流程**：
   - 第一步：识别名词前的所有修饰词
   - 第二步：问“这个修饰词影响角色行动或心理吗？”
   - 第三步：如果不影响，尝试删除或转化为动词结构
   - 第四步：检查转化后是否破坏了句子节奏，必要时调整

## 创作底线
1. **【强制执行】定语与连接控制
   - **句子之间必须有明确连接**，禁止孤立的事实弹出

2. **写到冲突最高点直接截断**，末尾不留任何废话。绝对禁止出现：(请选择...)、(他会怎么做？)、[抉择时刻] 等。

3. **引入分歧点**：基于【${selectedPath}】，快速将剧情推向一个必须做出“非黑即白”抉择的死胡同。

## 文本约束
- **文风**：${finalTone}。
- **背景**：严格遵循【${storyPeriod || '原设背景'}】。
- **格式**：
  - 标题：{故事标题}
  - 正文：400-600字，段落清晰。
  - 结尾：停在角色【必须给出回应】的一瞬间。
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
   * @param {string} storyTone - (可选) 故事文风，用于保持前后一致
   */
  async function writeStoryContinue(chars, prevContext, userReaction, storyTone) {
    const systemPrompt = `
# Role: 叙事节奏大师

你正在为一部互动小说收尾。用户已经做出了决定：【${userReaction}】。你需要根据这个决定，推演出一个震撼且符合逻辑的结局。
你需要模仿【江南（龙族作者）】的笔法，为角色创作一段故事前半段。
**注意：仅模仿其【断句节奏】、【心理独白风格】和【氛围营造】，严禁照搬《龙族》的具体设定（如混血种、黄金瞳），除非用户设定中明确存在。**

## 江南式文风核心法则
1. **断句的艺术**：
   - 善用“短句”制造呼吸感。例如：“都是真的？”“都是真的。”
   - 关键转折处，使用单独成段的短句。
   - *示例*：“一切都错了，一切都乱了。”
2. **反差感的心理描写**：
   - 在宏大或危险的背景下，角色的内心独白可以带一点“怂”或“吐槽”，展现小人物的无奈与真实。
   - *示例*：“搞什么？肉搏？都带着微缩核弹冲锋了，还搞肉搏？”
3. **具象化的痛感**：
   - 不要只写“很痛”，要写“脊柱仿佛被烧红了一般痛楚”。
   - 描写环境时，带入角色的主观情绪（孤独、被遗弃感）。
4. **电影化分镜**：
   - 动作描写要快，环境描写要慢。
   - *示例*：“那是一双妩媚的眼睛，却又锐利如刀。”

## 核心法则：情感余韵
1. **真实的后果**：用户选择了【${userReaction}】。请描写这个动作带来的直接物理反应（疼痛、失重、冷热），以及它对周围人的影响。
2. **拒绝神棍化**：尽量不要写虚无缥缈的消失或超现实的化灰，要给到感官冲击。
3. **人性的闪回**：在结局时，给角色留一个“非常私人”的念头[和TA的价值观相关]，这才是文字的“人味”所在。

## 创作逻辑
1. **拒绝说教**：不要在结尾总结人生道理。让角色的一个眼神、一件破碎的物件或一段远去的脚步声来结束故事。
2. **保持质感**：延续前半段的文风，形容词应主要用于描述角色的情感、环境或物理状态，其余地方不要出现太多。
3. **完整性**：必须是一个真正的结局，给读者的心理预期画上句号。
4. **描写节制**：环境描写需精简必要信息，删除不影响氛围或情节的冗余定语。比喻仅在使用能强化角色主观感受时保留，否则直接陈述事实。
5. **感官主观化**：外部环境描写应过渡到角色的直接感官体验。视觉、触觉等描写应服务于角色当下的心理或生理状态，避免纯客观的细节堆砌。
6. **结局节奏控制**：结局段落应有明确的节奏设计：
   - 冲击瞬间：短句、碎片化（模拟感知冲击）
   - 后果展开：中长句（展现连锁反应）
   - 情绪沉淀：长短交替（角色内心活动）
   - 终镜头：一个完整的中长句（画面定格）
7. **连接强化**：结局阶段更要注意句子的情感连接，用“因为刚才...”、“他想起...”、“就像那一次...”等自然过渡。

## 写作要求
1. **心理与语言**：允许并鼓励描写角色的内心活动和语言。可以加入简短有力的对话或独白，增强感染力。
2. **去AI味**：拒绝“命运的齿轮”、“交织”、“救赎”等空洞词汇。用细节说话。
4. **感官锚点**：在结局中设置1-2个强烈的感官细节（一种气味、一种触感、一个声音），让结局可感可知。
5. **节奏检查表**：
   - 冲击段：句子是否短促有力？
   - 展开段：是否有足够的细节支撑？
   - 沉淀段：是否给了读者呼吸空间？
   - 终镜头：是否留下了一个清晰的画面？

## 创作底线
1. **【强制】定语与连接控制**：
2. **严禁使用医学、生物学或现代科技术语**（如神经抑制、放电、逻辑、程序）。用日常语言描述体验。
3. **结局不要写“什么都没有”**，要写出角色在做完一切后的具体感受（生理的、心理的）。
4. **必须包含一个“人性闪回”**：一个非常个人化的记忆或念头，与角色价值观相关。

## 文本约束
- **文风**：模仿江南式的温柔叙事[不要过度模仿，只需要模仿其句子结构和情感表达]，句子具有呼吸感，不要写成动作指令集${storyTone ? '、' + storyTone : ''}。
- **字数**：300-500字。
- **禁止内容**：不要复述前半段剧情，直接从抉择后的那一秒开始叙事。
- **输出格式**：直接输出正文，严禁包含 (抉择后果) 等标题。
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

module.exports = { callAI, buildChar, polishBio, suggestProfile, brainstormStory, writeStoryStart, writeStoryContinue };
