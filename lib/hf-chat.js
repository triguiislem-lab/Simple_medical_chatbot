import "server-only";

import OpenAI from "openai";

const APP_NAME = "nextjs-hf-qwen35-chat";
const DEFAULT_MODEL = "Qwen/Qwen3.5-9B";
const DEFAULT_BASE_URL = "https://router.huggingface.co/v1";
const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful, accurate assistant. Give clear, complete, well-structured answers. When the user asks a medical question, stay cautious, avoid unsupported claims, and remind the user that the answer is informational and not a substitute for a licensed clinician.";
const CONTINUE_PROMPT =
  "Continue exactly where you stopped. Do not repeat earlier text. Finish the answer completely.";

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readFloatInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min || parsed > max) return fallback;
  return parsed;
}

function createError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function getChatConfig() {
  return {
    app: APP_NAME,
    model: process.env.HF_MODEL || DEFAULT_MODEL,
    baseUrl: process.env.HF_BASE_URL || DEFAULT_BASE_URL,
    systemPrompt: process.env.SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT,
    maxMessages: readPositiveInt(process.env.MAX_MESSAGES, 12),
    maxMessageChars: readPositiveInt(process.env.MAX_MESSAGE_CHARS, 4000),
    maxOutputTokens: readPositiveInt(process.env.MAX_OUTPUT_TOKENS, 1200),
    maxGenerationRounds: readPositiveInt(process.env.MAX_GENERATION_ROUNDS, 3),
    temperature: readFloatInRange(process.env.TEMPERATURE, 0.2, 0, 2)
  };
}

export function getChatHealth() {
  const config = getChatConfig();
  const hasToken = Boolean(process.env.HF_TOKEN);

  return {
    status: hasToken ? "ok" : "degraded",
    app: config.app,
    model: config.model,
    hasToken
  };
}

function createClient(baseUrl) {
  const apiKey = process.env.HF_TOKEN;
  if (!apiKey) {
    throw createError("Missing HF_TOKEN in .env.local", 500);
  }

  return new OpenAI({
    baseURL: baseUrl,
    apiKey,
    timeout: 60000,
    maxRetries: 1
  });
}

function isAllowedRole(role) {
  return role === "user" || role === "assistant";
}

function normalizeSessionId(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  return trimmed;
}

function normalizeMessages(messages, maxMessages, maxMessageChars) {
  if (!Array.isArray(messages)) {
    return {
      messages: [],
      error: "messages must be an array"
    };
  }

  const normalized = messages
    .filter((message) => {
      return (
        message &&
        isAllowedRole(message.role) &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
      );
    })
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }));

  if (normalized.length === 0) {
    return {
      messages: [],
      error: "messages must contain at least one valid user or assistant message"
    };
  }

  const tooLong = normalized.some((message) => message.content.length > maxMessageChars);
  if (tooLong) {
    return {
      messages: [],
      error: `each message must be ${maxMessageChars} characters or fewer`
    };
  }

  const trimmedHistory = normalized.slice(-maxMessages);
  if (trimmedHistory.at(-1)?.role !== "user") {
    return {
      messages: [],
      error: "the last message must be from the user"
    };
  }

  return {
    messages: trimmedHistory
  };
}

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (typeof part.text === "string") return part.text;
        if (typeof part.text?.value === "string") return part.text.value;
        return "";
      })
      .join("");
  }

  return "";
}

async function generateOnce(client, { model, messages, temperature, maxTokens, sessionId }) {
  const completion = await client.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(sessionId ? { user: sessionId } : {})
  });

  const choice = completion.choices?.[0];

  return {
    text: extractTextContent(choice?.message?.content),
    finishReason: choice?.finish_reason || null,
    usage: completion.usage || null
  };
}

async function generateReplyWithContinuation(client, baseMessages, sessionId, config) {
  let fullReply = "";
  let lastUsage = null;
  let finishReason = null;
  let currentMessages = [...baseMessages];

  for (let index = 0; index < config.maxGenerationRounds; index += 1) {
    const result = await generateOnce(client, {
      model: config.model,
      messages: currentMessages,
      temperature: config.temperature,
      maxTokens: config.maxOutputTokens,
      sessionId
    });

    if (result.text.trim()) {
      fullReply += fullReply ? `\n\n${result.text}` : result.text;
    }

    finishReason = result.finishReason;
    lastUsage = result.usage;

    if (finishReason !== "length") {
      break;
    }

    currentMessages = [
      ...baseMessages,
      { role: "assistant", content: fullReply },
      { role: "user", content: CONTINUE_PROMPT }
    ];
  }

  return { fullReply, finishReason, lastUsage };
}

export function validateChatBody(body) {
  const config = getChatConfig();
  const { messages, error } = normalizeMessages(
    body?.messages,
    config.maxMessages,
    config.maxMessageChars
  );

  if (error) {
    return { error, messages: [], sessionId: undefined };
  }

  return {
    error: null,
    messages,
    sessionId: normalizeSessionId(body?.sessionId)
  };
}

export async function generateChatReply({ messages, sessionId }) {
  const config = getChatConfig();
  const client = createClient(config.baseUrl);
  const startedAt = Date.now();
  const baseMessages = [{ role: "system", content: config.systemPrompt }, ...messages];
  const { fullReply, finishReason, lastUsage } = await generateReplyWithContinuation(
    client,
    baseMessages,
    sessionId,
    config
  );

  if (!fullReply.trim()) {
    throw createError("The model returned an empty response.", 502);
  }

  return {
    reply: fullReply.trim(),
    model: config.model,
    finish_reason: finishReason,
    latencyMs: Date.now() - startedAt,
    usage: lastUsage
  };
}

export function formatChatError(error) {
  const message = error?.message || "Unknown server error";

  if (/missing hf_token/i.test(message)) {
    return {
      status: 500,
      body: { error: message }
    };
  }

  if (/not supported by any provider/i.test(message)) {
    return {
      status: 400,
      body: {
        error: `${message} Set HF_MODEL to a provider-backed model, for example Qwen/Qwen3.5-9B or Qwen/Qwen3.5-9B:together.`
      }
    };
  }

  const upstreamStatus = typeof error?.status === "number" ? error.status : 502;
  const status = upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502;

  return {
    status,
    body: {
      error: "Model request failed.",
      details: message
    }
  };
}
