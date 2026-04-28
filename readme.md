# MiMo TTS Worker

MiMo TTS Worker is a proxy service deployed on Cloudflare Workers that wraps the Xiaomi MiMo TTS v2.5 speech synthesis service into an OpenAI-compatible API. With this project, you can easily use MiMo's high-quality TTS service, supporting three audio output formats: **wav**, **pcm**, and **mp3**.

## 📑 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Deploy](#-quick-deploy)
- [🔧 API Usage](#-api-usage)
- [📝 Notes](#-notes)
- [❓ FAQ](#-faq)
- [📄 License](#-license)

## ✨ Features

- Provides an OpenAI-compatible TTS API, a drop-in replacement for the OpenAI SDK audio endpoint
- Supports all 9 MiMo v2.5 voices, covering Chinese and English, male and female
- Three output formats: wav (default), pcm (raw), mp3 (via lamejs)
- Three preset types: Standard presets (voice + style + speed), VoiceDesign (custom voice generation via description), VoiceClone (voice cloning from a reference audio)
- Speed control from 0.25x to 4.0x, delivered naturally via text instructions
- Style control via free-form natural language descriptions, fully leveraging MiMo's style understanding
- Completely free — based on Cloudflare Workers free tier
- Secure — supports custom API key authentication
- Quick to deploy — get started in minutes

## 🚀 Quick Deploy

### 1. Create a Worker

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to `Workers & Pages`
3. Click `Create Worker`
4. Name your Worker (e.g., `mimo-tts`)

### 2. Deploy the Code

1. Delete the default code in the editor
2. Copy and paste the code from [worker.js](worker.js)
3. Click `Save and deploy`

### 3. Configure the MiMo API Key

There are two ways to provide the MiMo API Key, with the following priority order:

**Method 1 (Recommended): Pass via request header**

Pass your own MiMo API key via the `Authorization: Bearer` header on each request. No environment variable configuration needed. Ideal for multi-user scenarios.

```bash
curl ... -H "Authorization: Bearer sk-your-mimo-key"
```

**Method 2: Environment variable fallback**

If no `Authorization` header is provided, the Worker falls back to this configured key. Ideal for single-user scenarios.

1. In the Worker's settings page, go to `Settings` → `Variables and Secrets`
2. Click `Add variable`
3. Fill in:
   - **Variable name**: `MIMO_API_KEY`
   - **Type**: Select `Secret`
   - **Value**: Enter your MiMo API Key
4. Click `Save and deploy`

> Note: The dashboard supports three variable types — `JSON` (structured data), `Text` (plain string), `Secret` (encrypted string, cannot be viewed again).

### 4. Configure Voice Presets (Optional)

You can configure preset voice parameters to quickly apply predefined styles using the `voice` parameter's preset name. Three preset types are supported:

**Type 1: Standard Preset** — specify voice, style, and speed

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

**Type 2: VoiceDesign Preset** — generate a custom voice from a text description

```json
{
  "young_male": {
    "model": "mimo-v2.5-tts-voicedesign",
    "style": "年轻男声，充满活力，声音清亮"
  }
}
```

VoiceDesign automatically generates a brand new voice based on your text description. No `voice` field is needed — MiMo creates a custom voice for you.

**Type 3: VoiceClone Preset** — clone a voice from a reference audio

```json
{
  "boss": {
    "model": "mimo-v2.5-tts-voiceclone",
    "audio": "r2://references/boss.wav",
    "style": "沉稳大气"
  }
}
```

VoiceClone requires a reference audio file. In production, you need to upload the audio to a Cloudflare R2 bucket first, then specify the R2 object path in the `audio` field:

```
r2://<bucket-name>/<path-to-audio>.wav
```

> **Note**: The reference audio must be in WAV format, recommended length 10-30 seconds, with clear pronunciation.

Setup steps:

1. In the Worker's settings page, go to `Settings` → `Variables and Secrets`
2. Click `Add variable`
3. Fill in:
   - **Variable name**: `VOICE_PRESETS`
   - **Type**: Select `Text`
   - **Value**: Paste the JSON preset configuration above
4. Click `Save and deploy`

### 5. Configure an API Key (Optional)

To add access control to your proxy service:

1. In the Worker's settings page, go to `Settings` → `Variables and Secrets`
2. Click `Add variable`
3. Fill in:
   - **Variable name**: `API_KEY`
   - **Type**: Select `Secret`
   - **Value**: Enter your desired API key
4. Click `Save and deploy`

Once set, all API requests must include an `Authorization: Bearer your-api-key` header.

### 6. Configure a Custom Domain (Optional)

#### Prerequisites

- Your domain is managed on Cloudflare
- DNS records for your domain are proxied through Cloudflare (orange cloud icon)

#### Setup Steps

1. Go to your Worker's detail page
2. Click the `Settings` tab
3. Find the `Domains & Routes` section
4. Click the `Add` button
5. Select `Custom Domain`
6. Enter your desired domain (e.g., `mimo.example.com`)
7. Click `Add Domain`
8. Wait for the certificate to be provisioned (usually a few minutes)

Once complete, you can access the service via:
- Worker domain: `https://your-worker-name.your-username.workers.dev`
- Custom domain: `https://mimo.example.com`

> Note: Custom domains must use HTTPS. Cloudflare automatically provisions SSL certificates.

## 🔧 API Usage

### Basic Usage

**The simplest way to call:**

```bash
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "Hello, welcome to MiMo speech synthesis!",
    "voice": "mimo_default"
  }' --output output.wav
```

The `voice` parameter accepts MiMo voice IDs, OpenAI-compatible names, or preset names.

**Using a voice preset:**

```bash
# Use a pre-configured preset (assuming "soft_female" preset has been set up)
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "This is a test using a preset voice.",
    "voice": "soft_female"
  }' --output output.wav
```

When using a preset, all parameters defined in the preset (voice, style, speed, etc.) completely override any matching parameters in the request.

### Audio Format

Specify the output format via the `response_format` parameter:

| response_format | Content-Type | Description |
|-----------------|-------------|-------------|
| wav | audio/wav | Default format. 24kHz, 16-bit, mono. Fastest. |
| pcm | audio/pcm | Raw audio data (no header) |
| mp3 | audio/mpeg | MP3 format, 128kbps (via lamejs) |

```bash
# MP3 format
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{"input":"Convert to MP3","voice":"冰糖","response_format":"mp3"}' \
  --output output.mp3
```

> Unsupported formats (opus, aac, flac) will return a 400 error.

### Speed Control

Control the speaking rate via the `speed` parameter, ranging from 0.25 to 4.0 (1.0 is normal speed). Speed is passed to MiMo via text instructions for a natural feel.

```bash
# 1.5x speed
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "The weather is great today, perfect for a walk.",
    "voice": "苏打",
    "speed": 1.5
  }' --output fast.wav

# 0.7x slower
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "Please speak slowly, I'll listen carefully.",
    "voice": "茉莉",
    "speed": 0.7
  }' --output slow.wav
```

At speed 1.0, no extra instructions are added — the voice's natural pace is used.

### Style Control

Pass style instructions via the `instructions` parameter. MiMo supports natural language style descriptions — no need to memorize fixed style names.

```bash
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "input": "Congratulations on winning Employee of the Year! Your hard work is recognized by everyone.",
    "voice": "冰糖",
    "instructions": "cheerful"
  }' --output happy.wav
```

The `instructions` parameter accepts arbitrary natural language descriptions, for example:
- Single words: `"cheerful"`, `"sad"`, `"serious"`
- Chinese phrases: `"温柔亲切"`, `"激动兴奋"`, `"严肃庄重"`
- Full descriptions: `"like an old man telling a story, slow and emotional"`

When both `instructions` and `speed` are used, the speed instruction is automatically appended to the style description.

### List Models

```bash
curl https://your-worker-url/v1/models
```

Returns an OpenAI-compatible model list showing available MiMo TTS models.

### Parameters

| Parameter | Type | Required | Description | Default | Example |
|-----------|------|----------|-------------|---------|---------|
| input | string | Yes | Text to synthesize | - | "Hello, world!" |
| voice | string | Yes | Voice ID, OpenAI-compatible name, or preset name | mimo_default | 冰糖, alloy, soft_female |
| model | string | No | Model name | mimo-v2.5-tts | tts-1, gpt-4o-mini-tts |
| response_format | string | No | Audio output format | wav | wav, pcm, mp3 |
| speed | number | No | Speech speed (0.25-4.0) | 1.0 | 1.2, 0.8 |
| instructions | string | No | Style instruction (natural language) | - | cheerful, 温柔亲切 |

### Model Mapping

| OpenAI Model | MiMo Model | Description |
|-------------|-----------|-------------|
| tts-1 | mimo-v2-tts | MiMo v2 standard TTS |
| tts-1-hd | mimo-v2-tts | Same as above, MiMo v2 |
| gpt-4o-mini-tts | mimo-v2.5-tts | MiMo v2.5 (recommended) |
| - | mimo-v2.5-tts-voicedesign | Voice Design (preset only) |
| - | mimo-v2.5-tts-voiceclone | Voice Clone (preset only) |

You can also pass MiMo model names directly if you're familiar with them:

```bash
curl -X POST https://your-worker-url/v1/audio/speech \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5-tts",
    "input": "Using a MiMo model name directly.",
    "voice": "mimo_default"
  }' --output output.wav
```

### Voice Mapping

#### OpenAI-Compatible Voice Mapping

To ease migration from the OpenAI SDK, OpenAI voice names are mapped to MiMo voices.

| OpenAI Voice | MiMo Voice | Description |
|-------------|-----------|-------------|
| alloy | 茉莉 | Warm, natural Chinese female voice |
| echo | 白桦 | Steady, authoritative Chinese male voice |
| fable | 苏打 | Warm, gentle Chinese male voice |
| onyx | Milo | English male voice |
| nova | 冰糖 | Bright, lively Chinese female voice |
| shimmer | Chloe | English female voice |
| ash | mimo_default | MiMo default adaptive voice |
| ballad | mimo_default | MiMo default adaptive voice |
| coral | mimo_default | MiMo default adaptive voice |
| sage | mimo_default | MiMo default adaptive voice |
| verse | mimo_default | MiMo default adaptive voice |
| marin | mimo_default | MiMo default adaptive voice |
| cedar | mimo_default | MiMo default adaptive voice |

#### Full MiMo v2.5 Voice List

| Voice ID | Name | Language | Gender | Style |
|----------|------|----------|--------|-------|
| 冰糖 | BingTang | Chinese | Female | Bright and lively — news and daily conversation |
| 茉莉 | MoLi | Chinese | Female | Gentle and natural — audiobook narration and assistant |
| 苏打 | SuDa | Chinese | Male | Warm and soft — storytelling |
| 白桦 | BaiHua | Chinese | Male | Steady and authoritative — professional content |
| Mia | Mia | English | Female | Clear and natural — English content |
| Chloe | Chloe | English | Female | Sweet and smooth — English conversation |
| Milo | Milo | English | Male | Steady and professional — English narration |
| Dean | Dean | English | Male | Natural and fluid — English broadcast |
| mimo_default | Auto | Adaptive | Adaptive | MiMo default voice, auto-selected based on text |

### Usage Tips

1. **Matching voice to text language**
   - Chinese voices (冰糖, 茉莉, 苏打, 白桦) work best with Chinese text
   - English voices (Mia, Chloe, Milo, Dean) work best with English text
   - mimo_default auto-adapts to the text language

   Mismatched voice-text pairs may result in unnatural pronunciation or degraded quality.

2. **Text length recommendations**
   - Single requests should not exceed 4096 characters
   - Split long text into multiple requests

3. **Format conversion**
   - WAV and PCM have no conversion overhead, offering the fastest response
   - MP3 uses the built-in lamejs encoder with no external dependencies

## 📝 Notes

1. This project is for learning and personal use only
2. A valid MiMo API Key is required (obtained through the MiMo platform)
3. **Streaming output is not supported** — passing `stream_format` will return a 400 error
4. **Pitch control is not supported** — the MiMo API does not provide a pitch parameter
5. **Direct audio upload for voice cloning is not supported** — VoiceClone requires pre-uploading the reference audio to an R2 bucket
6. Speed control is implemented via text instructions, not direct audio sample rate adjustment
7. Cookie and other features need to be added by the user
8. Keep text length reasonable to avoid request timeouts

## ❓ FAQ

1. **Q: Why does synthesis fail?**
   A: Common reasons:
   - Empty text or text with only symbols
   - MIMO_API_KEY is not configured or invalid
   - MiMo service is temporarily unavailable
   - Text is too long causing request timeout
   - Using a voice that doesn't match the text language

2. **Q: What audio formats are supported?**
   A: Three formats are supported: wav (default), pcm, mp3. Default output is WAV (24kHz, 16-bit, mono). Opus, aac, and flac are not supported.

3. **Q: Are there request limits?**
   A:
   - Cloudflare Workers free tier: 100,000 requests per day
   - MiMo API has its own rate limits — refer to the MiMo platform documentation

4. **Q: How do I adjust the voice output?**
   A: There are three methods:
   - Method 1: Pass the `speed` parameter to adjust speech rate (0.25-4.0)
   - Method 2: Pass the `instructions` parameter for style guidance (natural language like "cheerful", "serious and authoritative")
   - Method 3: Configure `VOICE_PRESETS` environment variable to predefine full voice configurations

5. **Q: Will preset parameters be overridden?**
   A: **No.** When using a preset voice, all parameters defined in the preset (voice, style, speed) will fully override matching parameters in the request. To modify a specific parameter in a preset, either reconfigure the preset or use a voice ID directly in the request instead of a preset name.

6. **Q: How do I configure VoiceDesign and VoiceClone presets?**
   A:
   - **VoiceDesign**: In the preset, set `"model": "mimo-v2.5-tts-voicedesign"` and `"style"` (describe the desired voice). No `voice` field needed.
   - **VoiceClone**: Set `"model": "mimo-v2.5-tts-voiceclone"`, `"audio"` to the R2 bucket reference audio path, and `"style"` to describe the desired speaking style.

7. **Q: Why is the first request slow?**
   A: First requests may be slower due to Cloudflare Worker cold starts and MiMo API response time. Format conversion uses built-in JS encoders (like lamejs) with no external dependencies.

8. **Q: Can I output streaming audio?**
   A: No. This project does not support streaming output.

9. **Q: How do I use a custom domain?**
   A: There are two ways:
   - Option 1: Use the Workers-provided subdomain directly
   - Option 2: Use your own domain
     1. The domain must be managed on Cloudflare
     2. Add a custom domain in the Worker settings
     3. Wait for DNS to propagate (usually a few minutes)
     4. Access the API via your custom domain

## 📄 License

MIT License
