import { NextResponse } from "next/server";

import { formatChatError, generateChatReply, validateChatBody } from "@/lib/hf-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseRequestBody(request) {
  try {
    const body = await request.json();
    return { body, errorResponse: null };
  } catch {
    return {
      body: null,
      errorResponse: NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      )
    };
  }
}

export async function POST(request) {
  const { body, errorResponse } = await parseRequestBody(request);
  if (errorResponse) {
    return errorResponse;
  }

  const { messages, sessionId, error: validationError } = validateChatBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const result = await generateChatReply({ messages, sessionId });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Chat request failed:", error);
    const { status, body: errorBody } = formatChatError(error);
    return NextResponse.json(errorBody, { status });
  }
}
