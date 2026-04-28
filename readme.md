# MiMo TTS Worker

MiMo TTS Worker 是一个部署在 Cloudflare Worker 上的代理服务，它将小米 MiMo TTS v2.5 语音合成服务封装成兼容 OpenAI 格式的 API 接口。通过本项目，您可以轻松使用 MiMo 高质量的语音合成服务，并支持通过 FFmpeg WASM 将音频转换为多种格式。

## 📑 目录

- [✨ 特点](#-特点)
- [🚀 快速部署](#-快速部署)
- [🔧 API 使用说明](#-api-使用说明)
- [📝 注意事项](#-注意事项)
- [❓ 常见问题](#-常见问题)
- [📄 许可证](#-许可证)

## ✨ 特点

- 提供 OpenAI 兼容的 TTS 接口格式，可直接替换 OpenAI SDK 中的音频端点
- 支持 MiMo v2.5 全部 9 个音色，覆盖中英文男女声
- FFmpeg WASM 音频格式转换，支持 mp3 / opus / aac / flac / wav / pcm 共 6 种输出格式
- 三种预设类型：标准预设（音色 + 风格 + 语速）、VoiceDesign（自定义声音设计）、VoiceClone（参考音频克隆）
- 语速控制 0.25x - 4.0x，通过文本指令自然传递
- 风格控制支持自由文本描述，充分发挥 MiMo 风格理解能力
- 完全免费 — 基于 Cloudflare Worker 免费计划
- 安全可控 — 支持自定义 API 密钥
- 快速部署 — 几分钟内即可完成

## 🚀 快速部署

### 1. 创建 Worker

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 `Workers & Pages`
3. 点击 `Create Worker`
4. 为 Worker 取个名字（比如 `mimo-tts`）

### 2. 部署代码

1. 删除编辑器中的默认代码
2. 复制 [worker.js](worker.js) 中的代码并粘贴
3. 点击 `Save and deploy`

### 3. 设置 MiMo API Key

MiMo API 需要密钥才能使用，请先在 [MiMo 平台](https://platform.xiaomimimo.com/) 获取 API Key。

1. 在 Worker 设置页面找到 `Settings` → `Variables and Secrets`
2. 点击 `Add variable`
3. 填写：
   - **变量名**: `MIMO_API_KEY`
   - **类型**: 选择 `Secret`
   - **值**: 填入你的 MiMo API Key
4. 点击 `Save and deploy`

### 4. 设置预设语音（可选）

你可以配置预设语音参数，通过 `voice` 参数的预设名称来快速应用预定义风格。支持三种预设类型：

**类型一：标准预设** — 指定音色、风格、语速

```json
{
  "soft_female": {
    "voice": "茉莉",
    "style": "温柔",
    "speed": 0.9
  },
  "cheerful_announcer": {
    "voice": "白桦",
    "style": "活泼热情",
    "speed": 1.1
  },
  "english_narrator": {
    "voice": "Mia",
    "style": "professional and calm",
    "speed": 1.0
  }
}
```

**类型二：VoiceDesign 预设** — 通过文字描述生成专属声音

```json
{
  "young_male": {
    "model": "mimo-v2.5-tts-voicedesign",
    "style": "年轻男声，充满活力，声音清亮"
  }
}
```

VoiceDesign 会根据你的文字描述自动生成全新的声音。不需要指定 `voice` 字段，MiMo 会自动为你创建一个专属音色。

**类型三：VoiceClone 预设** — 基于参考音频克隆声音

```json
{
  "boss": {
    "model": "mimo-v2.5-tts-voiceclone",
    "audio": "r2://references/boss.wav",
    "style": "沉稳大气"
  }
}
```

VoiceClone 需要一个参考音频文件。在实际部署中，你需要先将音频上传到 Cloudflare R2 存储桶，然后在 `audio` 字段中填写 R2 对象路径：

```
r2://<bucket-name>/<path-to-audio>.wav
```

> **注意**：参考音频需要是 WAV 格式，建议长度 10-30 秒，发音清晰。

配置步骤：

1. 在 Worker 设置页面中找到 `Settings` → `Variables and Secrets`
2. 点击 `Add variable`
3. 填写：
   - **变量名**: `VOICE_PRESETS`
   - **类型**: 选择 `Text`
   - **值**: 填入上面的 JSON 内容
4. 点击 `Save and deploy`

### 5. 设置 API Key（可选）

如果需要为你的代理服务增加访问控制：

1. 在 Worker 设置页面中找到 `Settings` → `Variables and Secrets`
2. 点击 `Add variable`
3. 填写：
   - **变量名**: `API_KEY`
   - **类型**: 选择 `Secret`
   - **值**: 填入你想要的密钥
4. 点击 `Save and deploy`

设置后，所有 API 请求都需要携带 `Authorization: Bearer your-api-key` 头部。

### 6. 配置自定义域名（可选）

#### 前提条件

- 你的域名已经托管在 Cloudflare
- 域名的 DNS 记录已经通过 Cloudflare 代理（橙色云朵图标）

#### 配置步骤

1. 在 Worker 的详情页面中
2. 点击 `设置` 标签
3. 找到 `域和路由` 部分
4. 点击 `添加` 按钮
5. 选择 `自定义域`
6. 输入你想要使用的域名（比如 `mimo.example.com`）
7. 点击 `添加域`
8. 等待证书部署完成（通常几分钟内）

完成后，你可以通过以下两种方式访问服务：
- Workers 域名：`https://你的worker名字.你的用户名.workers.dev`
- 自定义域名：`https://mimo.example.com`

> 注意：自定义域名必须使用 HTTPS，Cloudflare 会自动提供 SSL 证书。

## 🔧 API 使用说明

### 基础用法

**最简单的调用方式：**

```bash
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "你好，欢迎使用MiMo语音合成！",
    "voice": "mimo_default"
  }' --output output.wav
```

voice 参数可以使用 MiMo 音色 ID、OpenAI 兼容名称或预设名称。

**使用预设语音：**

```bash
# 使用配置好的预设（假设已配置了 "soft_female" 预设）
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "你好，这是使用预设音色的测试。",
    "voice": "soft_female"
  }' --output output.wav
```

使用预设时，预设中定义的音色、风格、语速等参数会完全覆盖请求中传入的同名参数。

### 音频格式转换

通过 `response_format` 参数指定输出格式（需等待 FFmpeg WASM 初始化，首次请求约 2-5 秒）：

```bash
# MP3 格式
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "将这段文字转为MP3格式。",
    "voice": "冰糖",
    "response_format": "mp3"
  }' --output output.mp3

# Opus 格式（高压缩率，适合网络传输）
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "Opus format test.",
    "voice": "Mia",
    "response_format": "opus"
  }' --output output.opus
```

支持的输出格式及对应 MIME 类型：

| response_format | 输出格式 | Content-Type | 说明 |
|-----------------|----------|-------------|------|
| mp3 | MP3 | audio/mpeg | 通用格式，兼容性最好 |
| opus | Opus | audio/opus | 高压缩率，音质优秀 |
| aac | AAC | audio/aac | 流媒体常用格式 |
| flac | FLAC | audio/flac | 无损压缩 |
| wav | WAV | audio/wav | 默认格式，24kHz 16bit 单声道 |
| pcm | PCM | audio/pcm | 原始音频数据（无文件头） |

> **注意**：如果不指定 `response_format`，默认返回 WAV 格式，无需等待 FFmpeg 初始化，响应最快。

### 语速控制

通过 `speed` 参数控制语速，范围 0.25 到 4.0（1.0 为正常语速）。语速通过文本指令传递给 MiMo，效果自然。

```bash
# 1.5 倍速
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "今天的天气真不错，适合出去走走。",
    "voice": "苏打",
    "speed": 1.5
  }' --output fast.wav

# 0.7 倍慢速
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "请慢慢说，我会认真听的。",
    "voice": "茉莉",
    "speed": 0.7
  }' --output slow.wav
```

语速 1.0 时不会添加额外的指令文本，完全由音色自身的自然语速决定。

### 风格控制

通过 `instructions` 参数传递风格指令。MiMo 支持自然语言风格描述，你无需记忆固定的风格名称列表。

```bash
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "恭喜你获得了年度最佳员工奖！你的努力大家都看在眼里。",
    "voice": "冰糖",
    "instructions": "cheerful"
  }' --output happy.wav
```

`instructions` 参数支持任意自然语言描述，例如：
- 单个单词：`"cheerful"`、`"sad"`、`"serious"`
- 中文短语：`"温柔亲切"`、`"激动兴奋"`、`"严肃庄重"`
- 完整描述：`"像一个老人讲故事一样缓慢而富有感情"`

当同时使用 `instructions` 和 `speed` 时，语速指令会自动追加到风格描述后面。

### 获取模型列表

```bash
curl https://你的worker地址/v1/models
```

返回兼容 OpenAI 格式的模型列表，列出可用的 MiMo TTS 模型。

### 参数说明

| 参数 | 类型 | 必填 | 说明 | 默认值 | 示例值 |
|------|------|------|------|--------|--------|
| input | string | 是 | 要转换的文本内容 | - | "你好，世界！" |
| voice | string | 是 | 音色ID、OpenAI兼容名或预设名 | mimo_default | 冰糖, alloy, soft_female |
| model | string | 否 | 模型名称 | mimo-v2.5-tts | tts-1, gpt-4o-mini-tts |
| response_format | string | 否 | 音频输出格式 | wav | mp3, opus, flac |
| speed | number | 否 | 语速调节 (0.25-4.0) | 1.0 | 1.2, 0.8 |
| instructions | string | 否 | 风格指令（自然语言描述） | - | cheerful, 温柔亲切 |

### 模型映射

| OpenAI 模型 | MiMo 模型 | 说明 |
|-------------|-----------|------|
| tts-1 | mimo-v2-tts | MiMo v2 标准 TTS |
| tts-1-hd | mimo-v2-tts | 同上，MiMo v2 |
| gpt-4o-mini-tts | mimo-v2.5-tts | MiMo v2.5（推荐） |
| - | mimo-v2.5-tts-voicedesign | 声音设计（仅在预设中可用） |
| - | mimo-v2.5-tts-voiceclone | 声音克隆（仅在预设中可用） |

如果你熟悉 MiMo 模型名称，也可以直接传入：

```bash
curl -X POST https://你的worker地址/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5-tts",
    "input": "直接使用MiMo模型名称。",
    "voice": "mimo_default"
  }' --output output.wav
```

### 语音映射

#### OpenAI 兼容音色映射

为了方便从 OpenAI SDK 迁移，提供了 OpenAI 语音名称到 MiMo 音色的映射。

| OpenAI 语音 | 对应 MiMo 音色 | 特点描述 |
|------------|---------------|----------|
| alloy | 茉莉 | 温和自然的中文女声 |
| echo | 白桦 | 沉稳大气的中文男声 |
| fable | 苏打 | 温暖柔和的中文男声 |
| onyx | Milo | 英文男声 |
| nova | 冰糖 | 明亮活泼的中文女声 |
| shimmer | Chloe | 英文女声 |
| ash | mimo_default | MiMo 默认自适应音色 |
| ballad | mimo_default | MiMo 默认自适应音色 |
| coral | mimo_default | MiMo 默认自适应音色 |
| sage | mimo_default | MiMo 默认自适应音色 |
| verse | mimo_default | MiMo 默认自适应音色 |
| marin | mimo_default | MiMo 默认自适应音色 |
| cedar | mimo_default | MiMo 默认自适应音色 |

#### 完整 MiMo v2.5 音色列表

| 音色 ID | 名称 | 语言 | 性别 | 风格 |
|---------|------|------|------|------|
| 冰糖 | BingTang | 中文 | 女声 | 明亮活泼，适合新闻播报和日常对话 |
| 茉莉 | MoLi | 中文 | 女声 | 温和自然，适合有声书旁白和助手场景 |
| 苏打 | SuDa | 中文 | 男声 | 温暖柔和，适合故事讲述 |
| 白桦 | BaiHua | 中文 | 男声 | 沉稳大气，适合专业内容播报 |
| Mia | Mia | 英文 | 女声 | 清晰自然，适合英文内容 |
| Chloe | Chloe | 英文 | 女声 | 甜美流畅，适合英文对话 |
| Milo | Milo | 英文 | 男声 | 沉稳专业，适合英文旁白 |
| Dean | Dean | 英文 | 男声 | 自然流畅，适合英文播报 |
| mimo_default | 自动 | 自适应 | 自适应 | MiMo 默认音色，根据文本自动选择 |

### 使用注意事项

1. **语音与文本匹配**
   - 中文音色（冰糖、茉莉、苏打、白桦）适合中文文本
   - 英文音色（Mia、Chloe、Milo、Dean）适合英文文本
   - mimo_default 会自动适配文本语言

   不匹配的语音文本组合可能导致发音不自然或合成效果下降。

2. **文本长度建议**
   - 单次请求建议不超过 4096 个字符
   - 超长文本建议分段请求

3. **FFmpeg 冷启动**
   - 首次格式转换请求需要加载 FFmpeg WASM（约 2-5 秒）
   - 后续请求复用已加载的 FFmpeg 实例，速度正常
   - 如果不需要格式转换，使用默认 WAV 输出可完全跳过此过程

## 📝 注意事项

1. 本项目仅供学习和个人使用
2. 需要有效的 MiMo API Key（通过 MiMo 平台获取）
3. **不支持流式输出** — 使用了 `stream_format` 参数会返回 400 错误
4. **不支持音调控制** — MiMo API 没有提供 pitch 参数
5. **不支持直接上传音频进行声音克隆** — VoiceClone 需要通过 R2 存储桶预先上传参考音频
6. 语速通过文本指令实现，非直接的音频采样率调节
7. Cookie 等功能需要用户自行添加
8. 建议文本长度不要过长，以避免请求超时

## ❓ 常见问题

1. **Q: 为什么会合成失败？**
   A: 常见原因：
   - 输入了空文本或纯符号
   - MIMO_API_KEY 未配置或无效
   - MiMo 服务暂时不可用
   - 文本过长导致请求超时
   - 使用了与音色不匹配的语言文本

2. **Q: 支持哪些音频格式？**
   A: 支持 6 种格式：mp3、opus、aac、flac、wav、pcm。默认输出 WAV（24kHz, 16bit, 单声道）。格式转换通过 FFmpeg WASM 实现，首次请求需加载 2-5 秒。

3. **Q: 有请求限制吗？**
   A:
   - Cloudflare Workers 免费版每天 100,000 次请求
   - MiMo API 有自身的速率限制，请参考 MiMo 平台文档

4. **Q: 如何调整语音效果？**
   A: 有三种方式：
   - 方式一：传递 `speed` 参数调整语速（0.25-4.0）
   - 方式二：通过 `instructions` 传递风格引导（"cheerful"、"严肃霸道" 等自然语言描述）
   - 方式三：配置 `VOICE_PRESETS` 环境变量预设完整音色配置

5. **Q: 预设中的参数会被覆盖吗？**
   A: **不会**。使用预设语音时，预设中定义的所有参数（voice、style、speed）都会完全覆盖请求中传入的同名参数。如果想修改预设中的某个参数，需要重新配置预设或在请求中直接使用音色 ID 而非预设名称。

6. **Q: 如何配置 VoiceDesign 和 VoiceClone 预设？**
   A:
   - **VoiceDesign**：在预设中设置 `"model": "mimo-v2.5-tts-voicedesign"` 和 `"style"`（描述想要的声音），无需填写 `voice` 字段
   - **VoiceClone**：设置 `"model": "mimo-v2.5-tts-voiceclone"`，`"audio"` 填写 R2 存储桶中的参考音频路径，`"style"` 描述期望的说话风格

7. **Q: 为什么第一次请求很慢？**
   A: 首次请求（尤其是格式转换请求）需要下载和初始化 FFmpeg WASM 模块（约 30MB），这个过程需要 2-5 秒。后续请求会复用已加载的模块，速度正常。如果直接输出 WAV 格式，则无需等待 FFmpeg 加载。

8. **Q: 可以同时输出流式音频吗？**
   A: 不能。本项目不支持流式输出（streaming），原因有两个：
   - MiMo 的流式接口与本项目的批量处理模式不兼容
   - FFmpeg WASM 格式转换需要完整音频文件，无法对流式数据实时转码

9. **Q: 如何使用自定义域名？**
   A: 有两种方式：
   - 方式一：直接使用 Workers 提供的子域名
   - 方式二：使用自己的域名
     1. 域名需要先托管在 Cloudflare
     2. 在 Worker 设置中添加自定义域名
     3. 等待 DNS 生效（通常几分钟）
     4. 使用自定义域名访问 API

## 📄 许可证

MIT License
