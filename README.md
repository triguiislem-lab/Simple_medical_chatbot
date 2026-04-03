# Hugging Face Chatbot Starter for Next.js

This project is a verified Next.js chatbot starter that:

- keeps the Hugging Face token on the server
- sends browser requests to a local `/api/chat` route
- calls Hugging Face Inference Providers through the OpenAI-compatible SDK
- ships with a reusable chat UI component you can move into another Next.js app

## Project structure

- `components/HuggingFaceChat.js`: reusable client chat component
- `components/HuggingFaceChat.module.css`: component-scoped styles
- `app/api/chat/route.js`: server route your browser calls
- `app/api/health/route.js`: simple readiness endpoint
- `lib/hf-chat.js`: shared server-side validation and Hugging Face request logic

## What was verified

The current implementation was checked and tightened up before writing this guide:

- the client now lives in a reusable component instead of being hard-coded in `app/page.js`
- the server logic is centralized in `lib/hf-chat.js`, which makes reuse and maintenance easier
- the API now validates that the last message is from the user, which prevents malformed chat payloads
- transient system error messages are no longer restored from local storage as chat history
- the broken arrow text in the UI was fixed
- the lint script was updated to use the ESLint CLI instead of deprecated `next lint`
- the Next config now supports `NEXT_DIST_DIR`, so builds can run without colliding with an already-running dev server

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.local.example .env.local
```

PowerShell:

```powershell
Copy-Item .env.local.example .env.local
```

3. Put your real Hugging Face token in `.env.local`:

```env
HF_TOKEN=hf_your_real_token_here
HF_BASE_URL=https://router.huggingface.co/v1
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
SYSTEM_PROMPT=You are a helpful, accurate assistant for my app.
MAX_MESSAGES=12
MAX_MESSAGE_CHARS=4000
MAX_OUTPUT_TOKENS=1200
MAX_GENERATION_ROUNDS=3
TEMPERATURE=0.2
```

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`

## Verification commands

Lint:

```bash
npm run lint
```

Build:

```bash
npm run build
```

If you already have `next dev` running and want to build at the same time, use a separate output folder:

```powershell
$env:NEXT_DIST_DIR=".next-build"
npm run build
```

## API contract

`POST /api/chat`

Request body:

```json
{
  "sessionId": "optional-session-id",
  "messages": [
    { "role": "user", "content": "Hello" }
  ]
}
```

Rules:

- only `user` and `assistant` messages are sent upstream
- empty messages are removed
- the last valid message must be a `user` message
- message length and history size are capped by environment variables

Success response:

```json
{
  "reply": "Hello! How can I help?",
  "model": "meta-llama/Llama-3.1-8B-Instruct",
  "finish_reason": "stop",
  "latencyMs": 1420,
  "usage": {
    "total_tokens": 123
  }
}
```

Readiness endpoint:

```text
GET /api/health
```

## Integrate into another Next.js app

This starter is set up so you can copy the chatbot into another App Router project with minimal work.

### 1. Install dependencies in the target app

```bash
npm install openai
```

If the target app does not already have ESLint or Next defaults, install its normal Next.js tooling too.

### 2. Copy these files into the target app

| File | Where it goes |
|---|---|
| `components/HuggingFaceChat.js` | `components/HuggingFaceChat.js` |
| `components/HuggingFaceChat.module.css` | `components/HuggingFaceChat.module.css` |
| `lib/hf-chat.js` | `lib/hf-chat.js` |
| `app/api/chat/route.js` | `app/api/chat/route.js` |
| `app/api/health/route.js` | `app/api/health/route.js` |

If your target app uses a `src/` layout, place them under `src/components`, `src/lib`, and `src/app/api/...`.

### 3. Add the CSS custom properties

The component's CSS module uses custom properties (`--border`, `--muted`, `--text`, `--accent`, `--accent-2`) that must exist in a global stylesheet. Without them the component renders but colours are wrong.

**Option A — copy the variables block** into your app's existing global CSS file:

```css
:root {
  color-scheme: dark;
  --bg: #07101e;
  --bg-accent: #15305d;
  --text: #eef6ff;
  --muted: #a7b6cd;
  --border: rgba(125, 153, 196, 0.22);
  --accent: #60abff;
  --accent-2: #43d8b8;
  --danger: #dc2626;
}
```

**Option B — use your own design tokens.** As long as the six variable names above are defined anywhere in a global CSS that your app already loads, the component will pick them up automatically.

### 4. Make sure path aliases match

This project uses `@/*` imports in `jsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

If your target app does not use that alias, either:

- add the alias to `jsconfig.json` or `tsconfig.json`
- or replace imports like `@/lib/hf-chat` with relative paths

### 5. Add the environment variables to the target app

Add these to the target app's `.env.local`:

```env
HF_TOKEN=hf_your_real_token_here
HF_BASE_URL=https://router.huggingface.co/v1
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
SYSTEM_PROMPT=You are a helpful, accurate assistant for my app.
MAX_MESSAGES=12
MAX_MESSAGE_CHARS=4000
MAX_OUTPUT_TOKENS=1200
MAX_GENERATION_ROUNDS=3
TEMPERATURE=0.2
```

### 6. Render the chatbot component

Example page:

```jsx
import HuggingFaceChat from "@/components/HuggingFaceChat";

export default function SupportPage() {
  return (
    <HuggingFaceChat
      apiPath="/api/chat"
      storageKeyPrefix="support-chat"
      appTitle="Support Assistant"
      appDescription="Customer support chatbot powered by Hugging Face."
      chatTitle="Support Chat"
      chatDescription="Ask about orders, billing, or account issues."
    />
  );
}
```

### 7. Optional: mount it inside an existing page layout

If your target app already has dashboards, tabs, or panels, the component can be rendered inside any route segment. It does not require being the home page.

### 8. Optional: customize server behavior

The main server settings live in `lib/hf-chat.js`:

- default model
- default base URL
- default system prompt
- request validation
- continuation behavior when the model stops because of length

If you want different behavior per app, the simplest options are:

- change the environment variables
- change the default prompt in `lib/hf-chat.js`
- create a second route such as `app/api/support-chat/route.js` that reuses `generateChatReply`

## Smoke tests after integration

After moving the chatbot into another app, check these in order:

1. `GET /api/health` returns JSON with `"status": "ok"`.
2. The chat page renders without a 500 error.
3. Sending an invalid payload to `/api/chat` returns a 400.
4. Sending a real user message returns a model reply.
5. Reloading the page restores the last browser-side conversation.

Example invalid-payload test:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"messages\":[]}"
```

Expected result: HTTP `400`.

## Troubleshooting

### 500 with `Missing HF_TOKEN in .env.local`

Add `HF_TOKEN` to `.env.local` and restart the server.

### 400 saying the model is not supported by any provider

Use a provider-backed model such as:

```env
HF_MODEL=meta-llama/Llama-3.1-8B-Instruct
```

### The page loads but requests time out

Common causes:

- model/provider latency
- cold starts
- large output limits

Reduce latency with:

```env
MAX_OUTPUT_TOKENS=300
MAX_MESSAGES=8
TEMPERATURE=0.2
```

### `next build` fails while `next dev` is already running

Build into a separate directory:

```powershell
$env:NEXT_DIST_DIR=".next-build"
npm run build
```

### You want this to be a generic chatbot instead of a medical assistant

Replace `SYSTEM_PROMPT` in `.env.local` with your own domain prompt. The current default is medical because that was the existing project behavior.


## Important

- Do not commit `.env.local`.
- The uploaded version included a real Hugging Face token. Rotate that token in Hugging Face settings before reusing this project.
- Do not ship `.next` or `node_modules` inside source-control or handoff zip files.
