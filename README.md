
# 📝 OC人设工坊 - 智能角色内容生成模型

## 🌟 模型概述 (Model Overview)

| 属性 | 内容 |
| :--- | :--- |
| **模型名称** | OC Character Content Generator (OC-CCG) |
| **核心能力** | 角色设定补全、多角色互动故事生成 |
| **基础模型** | DeepSeek (或等效的 LLM，例如通义千问、Llama 系列等，需根据实际部署调整) |
| **应用场景** | 创意写作、角色扮演 (TRPG/语C)、小说/剧本创作辅助 |
| **项目目标** | 实现高一致性、高创造力的角色设定和故事情节生成 |

## 💡 模型介绍 (Introduction)

本模型并非从零开始训练，而是基于强大的**大型语言模型 (LLM)**，通过精细的 **Prompt 工程 (提示词工程)** 和 **上下文管理 (Context Management)**，使其特化为“OC 人设工坊”的专属内容生成引擎。

模型主要承载两大功能：

1.  **混合模式 OC 生成：** 接收用户提供的关键信息（姓名、性别、基础性格）和锁定的自定义属性，然后由模型补全**长篇的背景故事和外貌描写**，形成一份完整的人设文档。
2.  **多角色互动故事生成：** 接收 1-2 个角色的完整人设卡（作为上下文），根据用户提供的简短场景或关键词，生成一篇 500-1000 字的**场景短剧**。

## ⚙️ 模型训练与优化 (Training & Optimization)

由于我们使用的是成熟的 LLM (DeepSeek) 作为基础，核心工作集中在**提示词工程**与**结构化输出控制**，而非传统意义上的模型微调（Fine-tuning）。

### 1\. 提示词工程 (Prompt Engineering)

  * **角色设定补全 Prompt：**
      * **System Prompt (系统提示):** 严格要求模型扮演一位专业的“同人小说家”，擅长根据少数关键词展开宏大且有逻辑的世界观。
      * **输出格式约束：** 要求模型在补全 OC 设定时，使用特定的 Markdown 结构或 JSON 格式进行输出，方便 Web 应用前端解析和录入数据库（符合半开放结构的需求）。
  * **故事生成 Prompt：**
      * **上下文注入：** 将选定角色的完整人设信息（包括自定义标签）作为 System/User Prompt 的一部分注入，确保模型在生成故事时**不会 OOC (Out Of Character)**。
      * **故事风格控制：** 预设多种故事类型标签（如“日常”、“战斗”、“悬疑”）供用户选择，作为 Prompt 的额外参数。

### 2\. 上下文管理 (Context Management)

  * 在多人互动故事生成中，需要实现高效的上下文切割和拼接：
      * **角色 A 设定 + 角色 B 设定** (高优先级)
      * **用户输入的场景关键词** (中优先级)
      * **模型扮演的角色** (低优先级)
  * 严格控制 Token 数量在 DeepSeek 的限制内，确保在注入人设文档后，仍有足够的空间留给故事生成（500-1000字）。

## 💻 模型推理 (Inference)

### 1\. 推理接口说明

模型通过 **API 接口**进行推理调用，后端服务（推荐阿里云函数/CloudBase）作为中间层进行数据处理和请求转发。

| 参数名称 | 类型 | 是否必填 | 描述 |
| :--- | :--- | :--- | :--- |
| `task_type` | String | 是 | 任务类型：`oc_creation` (OC生成) 或 `story_generation` (故事生成) |
| `oc_data` | JSON | 否 | 待补全或参与故事的 OC 设定数据（完整的 JSON 结构）|
| `keywords` | String | 否 | 用户输入的关键词、场景描述或锁定的属性 |
| `style_tag` | String | 否 | 故事风格标签 (e.g., '浪漫', '战斗') |

### 2\. Python 示例 (基于 DeepSeek SDK 伪代码)

```python
import deepseek_sdk as DeepSeek

# 初始化 DeepSeek 客户端（假设在云函数中运行）
client = DeepSeek.Client(api_key="YOUR_API_KEY")

def generate_content(task_type, oc_data, keywords):
    # 1. 根据任务类型构建 Prompt
    if task_type == 'oc_creation':
        system_prompt = build_oc_prompt(oc_data, keywords)
        
    elif task_type == 'story_generation':
        system_prompt = build_story_prompt(oc_data, keywords)
    
    # 2. 调用 DeepSeek API
    response = client.chat.completions.create(
        model="deepseek-v3", # 实际模型名称
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": keywords} 
        ],
        temperature=0.7, # 增加创造性
        max_tokens=2000 
    )
    return response.choices[0].message.content

# 注意：build_oc_prompt 和 build_story_prompt 才是核心的 Prompt Engineering 逻辑
```

## ✨ 模型效果与特色 (Results & Features)

本模型提供以下核心优势：

| 特色功能 | 效果展示 | 关键支撑 |
| :--- | :--- | :--- |
| **高创造性补全** | 根据用户输入的少量信息（混合模式），模型能生成逻辑自洽且细节丰富的背景设定。 | Prompt Engineering (专注于展开世界观) |
| **角色一致性** | 在故事生成中，模型能严格遵循 OC 的性格、技能和自定义标签进行行为和对话演绎。 | 上下文管理 (将完整 OC 数据注入 Context) |
| **支持多人互动** | 能够有效处理两个不同人设的冲突、对话和协作，生成高质量的同人短剧。 | 独特的双角色 Context 拼接逻辑 |
| **社区化集成** | 生成内容结构化，方便保存到 OC 人设卡中，并通过阿里云服务进行分享和**权限申请**。 | 输出格式约束 (Markdown/JSON) 与 Web 后端逻辑配合 |