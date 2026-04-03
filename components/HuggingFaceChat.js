"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./HuggingFaceChat.module.css";

const DEFAULT_MODEL = "Qwen/Qwen3.5-9B";

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseStoredMessages(rawValue) {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((message) => {
        return (
          message &&
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string"
        );
      })
      .map((message) => ({
        role: message.role,
        content: message.content,
        ...(typeof message.model === "string" ? { model: message.model } : {})
      }));
  } catch {
    return [];
  }
}

function getLastAssistantModel(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant" && message.model) {
      return message.model;
    }
  }

  return DEFAULT_MODEL;
}

export default function HuggingFaceChat({
  apiPath = "/api/chat",
  storageKeyPrefix = "hf-qwen35-chat",
  appTitle = "Next.js Chatbot Demo",
  appDescription = "Reusable chat UI backed by a Next.js server route and Hugging Face Inference Providers. Your Hugging Face token stays server-side in .env.local.",
  chatTitle = "Chat",
  chatDescription = "Ask anything. This demo keeps recent conversation history in the browser."
}) {
  const sessionStorageKey = `${storageKeyPrefix}-session`;
  const messageStorageKey = `${storageKeyPrefix}-messages`;
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("Ready");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    const existingSessionId = globalThis.localStorage.getItem(sessionStorageKey);
    if (existingSessionId) {
      setSessionId(existingSessionId);
    } else {
      const nextSessionId = createSessionId();
      globalThis.localStorage.setItem(sessionStorageKey, nextSessionId);
      setSessionId(nextSessionId);
    }

    const savedMessages = parseStoredMessages(globalThis.localStorage.getItem(messageStorageKey));
    if (savedMessages.length > 0) {
      setMessages(savedMessages);
      setStatus("Restored previous conversation");
    }
  }, [messageStorageKey, sessionStorageKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const persistedMessages = messages.filter((message) => message.role !== "system");

    if (persistedMessages.length === 0) {
      globalThis.localStorage.removeItem(messageStorageKey);
      return;
    }

    globalThis.localStorage.setItem(messageStorageKey, JSON.stringify(persistedMessages));
  }, [messageStorageKey, messages]);

  async function handleSubmit(event) {
    event.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    const nextMessages = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setStatus("Sending...");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 70000);

    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          sessionId,
          messages: nextMessages
        })
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(data?.details || data?.error || `Request failed (${response.status})`);
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: data.reply || "No response received.",
          model: data.model
        }
      ]);

      const latencyLabel =
        typeof data?.latencyMs === "number" ? `${(data.latencyMs / 1000).toFixed(1)}s` : null;
      const totalTokens =
        typeof data?.usage?.total_tokens === "number"
          ? data.usage.total_tokens
          : typeof data?.usage?.totalTokens === "number"
            ? data.usage.totalTokens
            : null;
      const tokenLabel = typeof totalTokens === "number" ? `${totalTokens} tokens` : null;
      const finishReasonLabel =
        typeof data?.finish_reason === "string" ? `finish: ${data.finish_reason}` : null;
      const extra = [latencyLabel, tokenLabel, finishReasonLabel].filter(Boolean).join(", ");

      setStatus(extra ? `Model: ${data.model} (${extra})` : `Model: ${data.model}`);
    } catch (error) {
      const errorMessage =
        error?.name === "AbortError"
          ? "Request timed out. Please try again."
          : error?.message || "Request failed";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "system",
          content: `Error: ${errorMessage}`
        }
      ]);
      setStatus("Request failed");
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!loading && input.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  function handleReset() {
    setMessages([]);
    setInput("");
    setStatus("Conversation cleared");

    const nextSessionId = createSessionId();
    globalThis.localStorage.setItem(sessionStorageKey, nextSessionId);
    globalThis.localStorage.removeItem(messageStorageKey);
    setSessionId(nextSessionId);
  }

  const lastAssistantModel = getLastAssistantModel(messages);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <aside className={`${styles.card} ${styles.sidebar}`}>
          <h1>{appTitle}</h1>
          <p>{appDescription}</p>

          <div className={styles.meta}>
            <div className={styles.metaRow}>
              <small>Session ID</small>
              <div>{sessionId || "Creating..."}</div>
            </div>
            <div className={styles.metaRow}>
              <small>Current model</small>
              <div>{lastAssistantModel}</div>
            </div>
            <div className={styles.metaRow}>
              <small>API route</small>
              <div>{apiPath}</div>
            </div>
            <div className={styles.metaRow}>
              <small>Flow</small>
              <div>Browser -&gt; Next.js API route -&gt; Hugging Face</div>
            </div>
          </div>
        </aside>

        <section className={`${styles.card} ${styles.chat}`}>
          <header className={styles.chatHeader}>
            <div>
              <h2>{chatTitle}</h2>
              <p>{chatDescription}</p>
            </div>
            <div className={styles.actions}>
              <button className={styles.button} type="button" onClick={handleReset} disabled={loading}>
                Reset
              </button>
            </div>
          </header>

          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? (
              <div className={styles.empty}>
                Start with a simple test like <strong>&quot;Hello&quot;</strong> or ask a full question.
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`${styles.message} ${styles[message.role]}`}
                >
                  {message.content}
                </div>
              ))
            )}
            {loading ? <div className={`${styles.message} ${styles.assistant}`}>Thinking...</div> : null}
            <div ref={endRef} />
          </div>

          <div className={styles.composer}>
            <form onSubmit={handleSubmit} className={styles.form}>
              <textarea
                className={styles.textarea}
                placeholder="Type your message and press Enter..."
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={loading}
              />
              <div className={styles.composerFooter}>
                <div className={styles.status}>{status}</div>
                <button
                  className={`${styles.button} ${styles.primaryButton}`}
                  type="submit"
                  disabled={loading || !input.trim()}
                >
                  {loading ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
