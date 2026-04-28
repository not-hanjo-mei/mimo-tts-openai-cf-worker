// ============================================================================
// MiMo TTS Worker — Cloudflare Worker for MiMo TTS API (OpenAI-compatible)
// ============================================================================

// --- Auth -------------------------------------------------------------------
const API_KEY = globalThis.API_KEY;

// --- Voice Mapping (OpenAI → MiMo) ------------------------------------------
const VOICE_MAPPING = {
  'alloy': '茉莉',
  'echo': '白桦',
  'fable': '苏打',
  'onyx': 'Milo',
  'nova': '冰糖',
  'shimmer': 'Chloe',
  'ash': 'mimo_default',
  'ballad': 'mimo_default',
  'coral': 'mimo_default',
  'sage': 'mimo_default',
  'verse': 'mimo_default',
  'marin': 'mimo_default',
  'cedar': 'mimo_default'
};

// --- Model Mapping (OpenAI → MiMo) ------------------------------------------
const MODEL_MAPPING = {
  'tts-1': 'mimo-v2-tts',
  'tts-1-hd': 'mimo-v2-tts',
  'gpt-4o-mini-tts': 'mimo-v2.5-tts',
  'gpt-4o-mini-tts-2025-12-15': 'mimo-v2.5-tts'
};
const DEFAULT_MODEL = 'mimo-v2.5-tts';

// --- Audio Formats ----------------------------------------------------------

const CONTENT_TYPES = {
  'mp3': 'audio/mpeg',
  'opus': 'audio/opus',
  'aac': 'audio/aac',
  'flac': 'audio/flac',
  'wav': 'audio/wav',
  'pcm': 'audio/pcm'
};

// ============================================================================
// Entry Point
// ============================================================================
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

// ============================================================================
// Request Handler — routes, auth, presets, mapping, API call, conversion
// ============================================================================
async function handleRequest(request) {
  // --- CORS Preflight ---
  if (request.method === 'OPTIONS') {
    return handleOptions(request);
  }

  // --- Auth Check (optional — skip if API_KEY not configured) ---
  if (API_KEY) {
    const authHeader = request.headers.get('Authorization');
    const apiKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (apiKey !== API_KEY) {
      return errorResponse('Invalid API key', 'invalid_request_error', null, 'invalid_api_key', 401);
    }
  }

  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname;

  // --- GET /v1/models ---
  if (request.method === 'GET' && path === '/v1/models') {
    const models = {
      object: 'list',
      data: [
        { id: 'tts-1', object: 'model', created: 1699050241, owned_by: 'mimo-proxy' },
        { id: 'tts-1-hd', object: 'model', created: 1699050241, owned_by: 'mimo-proxy' },
        { id: 'gpt-4o-mini-tts', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2.5-tts', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2.5-tts-voicedesign', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2.5-tts-voiceclone', object: 'model', created: 1734567890, owned_by: 'mimo-proxy' },
        { id: 'mimo-v2-tts', object: 'model', created: 1699050241, owned_by: 'mimo-proxy' }
      ]
    };
    return new Response(JSON.stringify(models), {
      headers: {
        'Content-Type': 'application/json',
        ...makeCORSHeaders()
      }
    });
  }

  // --- POST /v1/audio/speech ---
  if (request.method !== 'POST' || path !== '/v1/audio/speech') {
    return new Response('Not Found', { status: 404 });
  }

  try {
    // Parse request body
    const requestBody = await request.json();
    let {
      model,
      input,
      voice = 'mimo_default',
      response_format = 'wav',
      speed = 1.0,
      instructions,
      stream_format
    } = requestBody;

    // Validate required fields
    if (!input || typeof input !== 'string' || !input.trim()) {
      return errorResponse('input is required', 'invalid_request_error', 'input', null, 400);
    }
    if (!voice) {
      return errorResponse('voice is required', 'invalid_request_error', 'voice', null, 400);
    }

    // Reject unsupported features
    if (stream_format) {
      return errorResponse('streaming not supported', 'invalid_request_error', 'stream_format', null, 400);
    }

    // Validate speed range
    if (typeof speed !== 'number' || speed < 0.25 || speed > 4.0) {
      return errorResponse('speed must be between 0.25 and 4.0', 'invalid_request_error', 'speed', null, 400);
    }

    // Apply voice presets
    const presets = loadPresets();
    if (presets[voice] && typeof presets[voice] === 'object') {
      const p = presets[voice];
      voice = p.voice || voice;
      if (p.style !== undefined) instructions = p.style;
      if (p.speed !== undefined) speed = p.speed;
      if (p.model !== undefined) model = p.model;
    }

    // Map voice: OpenAI name → MiMo ID (or pass through if already MiMo ID or preset-resolved)
    voice = VOICE_MAPPING[voice] || voice;

    // Map model: OpenAI name → MiMo model (or pass through, or default)
    const mimoModel = MODEL_MAPPING[model] || model || DEFAULT_MODEL;

    // Build MiMo request
    const mimoRequest = buildMimoRequest(input, voice, instructions, speed, mimoModel);

    // Call MiMo API
    const mimoResponse = await callMimoAPI(mimoRequest, request);

    // Parse MiMo response — extract WAV bytes
    const wavBytes = parseMimoResponse(mimoResponse);

    // Convert audio if needed (FFmpeg for non-WAV formats)
    const targetFormat = response_format || 'wav';
    const audioBytes = await convertAudio(wavBytes, targetFormat);

    // Return audio with correct Content-Type
    const contentType = CONTENT_TYPES[targetFormat] || 'audio/wav';
    return new Response(audioBytes, {
      headers: {
        'Content-Type': contentType,
        ...makeCORSHeaders()
      }
    });

  } catch (error) {
    console.error('Speech synthesis error:', error.message);

    // Map specific errors to appropriate HTTP status codes
    const msg = error.message;
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
    if (msg.includes('FFmpeg not available')) {
      return errorResponse('Audio format conversion unavailable', 'api_error', null, 'conversion_error', 500);
    }
    if (msg.includes('Unsupported target format')) {
      return errorResponse(`Unsupported audio format`, 'invalid_request_error', 'response_format', null, 400);
    }

    // Generic backend error
    return errorResponse('Speech synthesis failed', 'api_error', null, 'tts_error', 500);
  }
}

// ============================================================================
// CORS
// ============================================================================
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
      'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Authorization'
    }
  });
}

// ============================================================================
// Error Response Helper (OpenAI-compatible error format)
// ============================================================================
function errorResponse(message, type, param, code, status) {
  return new Response(JSON.stringify({
    error: { message, type, param, code }
  }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...makeCORSHeaders()
    }
  });
}

// ============================================================================
// Preset Loading
// ============================================================================
function loadPresets() {
  const presetsRaw = globalThis.VOICE_PRESETS;
  if (!presetsRaw) return {};
  if (typeof presetsRaw === 'object') return presetsRaw;
  if (typeof presetsRaw === 'string') {
    try { return JSON.parse(presetsRaw); }
    catch (e) { console.error('Failed to parse VOICE_PRESETS:', e); return {}; }
  }
  return {};
}


// ============================================================================
// FFmpeg WASM Audio Conversion
// ============================================================================

let ffmpeg = null;
let ffmpegReady = false;
let ffmpegLoadPromise = null;

async function initFFmpeg() {
  if (ffmpegReady) return;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    try {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      ffmpeg = new FFmpeg();
      ffmpeg.on('log', ({ message }) => {
        // Suppress verbose FFmpeg logs in production
      });
      await ffmpeg.load();
      ffmpegReady = true;
      console.log('FFmpeg WASM loaded successfully');
    } catch (e) {
      console.error('FFmpeg WASM initialization failed:', e.message);
      ffmpeg = null;
      ffmpegReady = false;
      ffmpegLoadPromise = null;
      throw e;
    }
  })();

  return ffmpegLoadPromise;
}

async function convertAudio(audioBytes, targetFormat) {
  // Passthrough for WAV — no conversion needed
  if (targetFormat === 'wav') {
    return audioBytes;
  }

  // PCM: strip 44-byte WAV header (24kHz 16-bit mono PCM)
  if (targetFormat === 'pcm') {
    return audioBytes.slice(44);
  }

  // All other formats need FFmpeg
  await initFFmpeg();
  if (!ffmpegReady) {
    throw new Error('FFmpeg not available — cannot convert audio format');
  }

  const inputName = 'input.wav';
  const outputName = `output.${targetFormat}`;

  // Write input to FFmpeg virtual filesystem
  await ffmpeg.writeFile(inputName, audioBytes);

  // Execute conversion command based on target format
  const args = ['-i', inputName];

  switch (targetFormat) {
    case 'mp3':
      args.push('-codec:a', 'libmp3lame', '-b:a', '128k');
      break;
    case 'opus':
      args.push('-codec:a', 'libopus', '-b:a', '64k');
      break;
    case 'aac':
      args.push('-codec:a', 'aac', '-b:a', '128k');
      break;
    case 'flac':
      args.push('-codec:a', 'flac');
      break;
    default:
      throw new Error(`Unsupported target format: ${targetFormat}`);
  }

  args.push(outputName);
  await ffmpeg.exec(args);

  // Read output from virtual filesystem
  const outputData = await ffmpeg.readFile(outputName);

  // Clean up virtual filesystem
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  return outputData;
}

// ============================================================================
// MiMo API — Request Builder, Client, Response Parser
// ============================================================================

function buildSpeedInstruction(speed) {
  if (speed === 1.0) return '';
  return `(语速${speed}x)`;
}

function buildMimoRequest(text, voiceId, instructions, speed, model) {
  const messages = [];
  
  // Build style instruction text
  let userContent = '';
  if (instructions && instructions.trim()) {
    userContent = instructions.trim();
  }
  const speedInst = buildSpeedInstruction(speed);
  if (speedInst) {
    userContent = userContent ? `${userContent} ${speedInst}` : speedInst;
  }
  
  // User message FIRST (style instructions) — only if there's content
  if (userContent) {
    messages.push({ role: 'user', content: userContent });
  }
  
  // Assistant message SECOND (text to speak) — always included
  messages.push({ role: 'assistant', content: text });
  
  const body = {
    model: model,
    messages: messages,
    audio: {
      format: 'wav'
    }
  };
  
  // Voice handling:
  // - Standard TTS (mimo-v2-tts, mimo-v2.5-tts): include voice name
  // - VoiceDesign (mimo-v2.5-tts-voicedesign): OMIT audio.voice entirely
  // - VoiceClone (mimo-v2.5-tts-voiceclone): voiceId may be a data URI
  const isVoiceDesign = model === 'mimo-v2.5-tts-voicedesign';
  if (!isVoiceDesign) {
    body.audio.voice = voiceId;
  }
  
  return body;
}

function getMimoApiKey(request) {
  // Priority 1: Extract from Authorization header (client's Bearer token)
  const authHeader = request ? request.headers.get('Authorization') : null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  
  // Priority 2: Fall back to globalThis.MIMO_API_KEY
  const envKey = globalThis.MIMO_API_KEY;
  if (envKey) return envKey;
  
  throw new Error('MIMO_API_KEY not configured');
}

async function callMimoAPI(requestBody, request) {
  const apiKey = getMimoApiKey(request);
  
  const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const status = response.status;
    let errorText = '';
    try {
      const errorJson = await response.json();
      errorText = JSON.stringify(errorJson);
    } catch (e) {
      errorText = await response.text();
    }
    
    // Map MiMo status codes to proxy error codes
    if (status === 401 || status === 403) {
      throw new Error(`Backend authentication failed — check API key (HTTP ${status})`);
    } else if (status === 429) {
      throw new Error(`Backend rate limited — try again later (HTTP ${status})`);
    } else {
      throw new Error(`MiMo API error (HTTP ${status}): ${errorText}`);
    }
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
  
  const base64Data = message.audio.data;
  
  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return bytes;
}
