const VOICE_MAPPING = {
  alloy: '茉莉',
  echo: '白桦',
  fable: '苏打',
  onyx: 'Milo',
  nova: '冰糖',
  shimmer: 'Chloe',
  ash: 'mimo_default',
  ballad: 'mimo_default',
  coral: 'mimo_default',
  sage: 'mimo_default',
  verse: 'mimo_default',
  marin: 'mimo_default',
  cedar: 'mimo_default'
};

const MODEL_MAPPING = {
  'tts-1': 'mimo-v2.5-tts',
  'tts-1-hd': 'mimo-v2.5-tts',
  'gpt-4o-mini-tts': 'mimo-v2.5-tts',
  'gpt-4o-mini-tts-2025-12-15': 'mimo-v2.5-tts'
};
const DEFAULT_MODEL = 'mimo-v2.5-tts';

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
  pcm16: 'audio/pcm'
};

const SUPPORTED_NONSTREAM_FORMATS = new Set(['wav', 'pcm', 'mp3']);
const SUPPORTED_STREAM_FORMATS = new Set(['pcm', 'pcm16']);

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  }
};

async function handleRequest(request, env) {
  const API_KEY = env.API_KEY;

  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  if (API_KEY) {
    const authHeader = request.headers.get('Authorization');
    const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (apiKey !== API_KEY) {
      return errorResponse('Invalid API key', 'invalid_request_error', null, 'invalid_api_key', 401);
    }
  }

  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname;

  if (request.method === 'GET' && path === '/v1/models') {
    const models = {
      object: 'list',
      data: [
        { id: 'tts-1', object: 'model', created: 1699050241, owned_by: 'mimo-proxy' },
        { id: 'tts-1-hd', object: 'model', created: 1699050241, owned_by: 'mimo-proxy' },
        { id: 'gpt-4o-mini-tts', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2.5-tts', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2.5-tts-voicedesign', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2.5-tts-voiceclone', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' }
      ]
    };
    return new Response(JSON.stringify(models), {
      headers: {
        'Content-Type': 'application/json',
        ...makeCORSHeaders()
      }
    });
  }

  if (request.method !== 'POST' || path !== '/v1/audio/speech') {
    return new Response('Not Found', { status: 404 });
  }

  try {
    const requestBody = await request.json();
    let {
      model,
      input,
      voice = 'mimo_default',
      response_format = 'wav',
      speed = 1.0,
      instructions,
      stream = false,
      stream_format
    } = requestBody;

    if (!input || typeof input !== 'string' || !input.trim()) {
      return errorResponse('input is required', 'invalid_request_error', 'input', null, 400);
    }
    if (!voice) {
      return errorResponse('voice is required', 'invalid_request_error', 'voice', null, 400);
    }

    if (typeof speed !== 'number' || speed < 0.25 || speed > 4.0) {
      return errorResponse('speed must be between 0.25 and 4.0', 'invalid_request_error', 'speed', null, 400);
    }

    const wantStream = stream === true || stream_format === 'audio' || stream_format === 'sse';
    const sseMode = stream_format === 'sse';

    const presets = loadPresets(env);
    if (presets[voice] && typeof presets[voice] === 'object') {
      const p = presets[voice];
      voice = p.voice || voice;
      if (p.style !== undefined) instructions = p.style;
      if (p.speed !== undefined) speed = p.speed;
      if (p.model !== undefined) model = p.model;
    }

    voice = VOICE_MAPPING[voice] || voice;
    const mimoModel = MODEL_MAPPING[model] || model || DEFAULT_MODEL;
    const targetFormat = (response_format || 'wav').toLowerCase();

    if (wantStream) {
      if (targetFormat === 'mp3') {
        return errorResponse(
          'Streaming does not support mp3. Use response_format pcm with stream, or non-stream for mp3/wav.',
          'invalid_request_error',
          'response_format',
          null,
          400
        );
      }

      const mimoRequest = buildMimoRequest(input, voice, instructions, speed, mimoModel, {
        stream: true,
        audioFormat: 'pcm16'
      });

      const mimoResponse = await callMimoAPI(mimoRequest, request, env, { stream: true });
      return streamMimoToOpenAI(mimoResponse, { sseMode });
    }

    if (!SUPPORTED_NONSTREAM_FORMATS.has(targetFormat)) {
      return errorResponse(
        'Unsupported audio format. Supported non-stream: wav, pcm, mp3.',
        'invalid_request_error',
        'response_format',
        null,
        400
      );
    }

    const mimoAudioFormat = targetFormat === 'pcm' ? 'pcm' : targetFormat;
    const mimoRequest = buildMimoRequest(input, voice, instructions, speed, mimoModel, {
      stream: false,
      audioFormat: mimoAudioFormat
    });

    const mimoJson = await callMimoAPI(mimoRequest, request, env, { stream: false });
    const audioBytes = parseMimoResponse(mimoJson);
    const contentType = CONTENT_TYPES[targetFormat] || 'audio/wav';

    return new Response(audioBytes, {
      headers: {
        'Content-Type': contentType,
        ...makeCORSHeaders()
      }
    });
  } catch (error) {
    console.error('Speech synthesis error:', error.message);

    const msg = error.message || '';
    if (msg.includes('MIMO_API_KEY not configured')) {
      return errorResponse('MIMO_API_KEY not configured', 'api_error', null, 'config_error', 500);
    }
    if (msg.includes('Backend authentication failed')) {
      return errorResponse('Backend authentication failed — check MIMO_API_KEY', 'api_error', null, 'backend_auth_error', 502);
    }
    if (msg.includes('rate limited')) {
      return errorResponse('Backend rate limited — try again later', 'api_error', null, 'rate_limit', 503);
    }
    if (msg.includes('No audio data')) {
      return errorResponse('No audio data in MiMo response', 'api_error', null, 'audio_parse_error', 500);
    }

    return errorResponse(msg || 'Speech synthesis failed', 'api_error', null, 'tts_error', 500);
  }
}

function makeCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

async function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: {
      ...makeCORSHeaders(),
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
      'Access-Control-Allow-Headers':
        request.headers.get('Access-Control-Request-Headers') || 'Authorization'
    }
  });
}

function errorResponse(message, type, param, code, status) {
  return new Response(
    JSON.stringify({
      error: { message, type, param, code }
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...makeCORSHeaders()
      }
    }
  );
}

function loadPresets(env) {
  const presetsRaw = env.VOICE_PRESETS;
  if (!presetsRaw) return {};
  if (typeof presetsRaw === 'object') return presetsRaw;
  if (typeof presetsRaw === 'string') {
    try {
      return JSON.parse(presetsRaw);
    } catch (e) {
      console.error('Failed to parse VOICE_PRESETS:', e);
      return {};
    }
  }
  return {};
}

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function buildSpeedInstruction(speed) {
  if (speed === 1.0) return '';
  return `Speak at ${speed}x speed.`;
}

function buildMimoRequest(text, voiceId, instructions, speed, model, options = {}) {
  const { stream = false, audioFormat = 'wav' } = options;
  const messages = [];

  let userContent = '';
  if (instructions && instructions.trim()) {
    userContent = instructions.trim();
  }
  const speedInst = buildSpeedInstruction(speed);
  if (speedInst) {
    userContent = userContent ? `${userContent} ${speedInst}` : speedInst;
  }

  if (userContent) {
    messages.push({ role: 'user', content: userContent });
  }

  messages.push({ role: 'assistant', content: text });

  const body = {
    model,
    messages,
    stream,
    audio: {
      format: audioFormat
    }
  };

  if (model !== 'mimo-v2.5-tts-voicedesign') {
    body.audio.voice = voiceId;
  }

  return body;
}

function getMimoApiKey(request, env) {
  if (env.API_KEY) {
    if (env.MIMO_API_KEY) return env.MIMO_API_KEY;
    throw new Error('MIMO_API_KEY not configured');
  }

  const authHeader = request ? request.headers.get('Authorization') : null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (env.MIMO_API_KEY) return env.MIMO_API_KEY;
  throw new Error('MIMO_API_KEY not configured');
}

async function callMimoAPI(requestBody, request, env, { stream = false } = {}) {
  const apiKey = getMimoApiKey(request, env);

  const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const status = response.status;
    let errorText = '';
    try {
      const errorJson = await response.json();
      errorText = JSON.stringify(errorJson);
    } catch {
      errorText = await response.text();
    }

    if (status === 401 || status === 403) {
      throw new Error(`Backend authentication failed — check API key (HTTP ${status})`);
    }
    if (status === 429) {
      throw new Error(`Backend rate limited — try again later (HTTP ${status})`);
    }
    throw new Error(`MiMo API error (HTTP ${status}): ${errorText}`);
  }

  if (stream) {
    if (!response.body) {
      throw new Error('MiMo stream response has no body');
    }
    return response;
  }

  return response.json();
}

function parseMimoResponse(responseJson) {
  if (!responseJson || !responseJson.choices || !responseJson.choices[0]) {
    throw new Error('No audio data in MiMo response');
  }

  const message = responseJson.choices[0].message;
  if (!message || !message.audio || !message.audio.data) {
    throw new Error('No audio data in MiMo response');
  }

  return base64ToUint8Array(message.audio.data);
}

function streamMimoToOpenAI(mimoResponse, { sseMode = false } = {}) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let carry = '';

  const readable = new ReadableStream({
    async start(controller) {
      const reader = mimoResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          carry += decoder.decode(value, { stream: true });
          const parts = carry.split(/\r?\n/);
          carry = parts.pop() ?? '';

          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (!trimmed.startsWith('data:')) continue;

            const dataStr = trimmed.slice(5).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            let payload;
            try {
              payload = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (payload.error) {
              const msg = payload.error.message || JSON.stringify(payload.error);
              if (sseMode) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'error',
                      error: { message: msg, type: 'api_error' }
                    })}\n\n`
                  )
                );
              }
              throw new Error(msg);
            }

            const choices = payload.choices;
            if (!choices || !choices.length) continue;

            const delta = choices[0].delta || choices[0].message || {};
            const audio = delta.audio;
            if (!audio || !audio.data) continue;

            if (sseMode) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'speech.audio.delta', audio: audio.data })}\n\n`
                )
              );
            } else {
              controller.enqueue(base64ToUint8Array(audio.data));
            }
          }
        }

        if (carry.trim().startsWith('data:')) {
          const dataStr = carry.trim().slice(5).trim();
          if (dataStr && dataStr !== '[DONE]') {
            try {
              const payload = JSON.parse(dataStr);
              const audio = payload?.choices?.[0]?.delta?.audio;
              if (audio?.data) {
                if (sseMode) {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'speech.audio.delta', audio: audio.data })}\n\n`
                    )
                  );
                } else {
                  controller.enqueue(base64ToUint8Array(audio.data));
                }
              }
            } catch {
            }
          }
        }

        if (sseMode) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'speech.audio.done' })}\n\n`)
          );
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        }

        controller.close();
      } catch (err) {
        try {
          controller.error(err);
        } catch {
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
        }
      }
    }
  });

  if (sseMode) {
    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...makeCORSHeaders()
      }
    });
  }

  return new Response(readable, {
    headers: {
      'Content-Type': 'audio/pcm',
      'X-Sample-Rate': '24000',
      'X-Audio-Format': 'pcm16le',
      'X-Channels': '1',
      ...makeCORSHeaders()
    }
  });
}