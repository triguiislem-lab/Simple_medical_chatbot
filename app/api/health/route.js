import { NextResponse } from "next/server";

import { getChatHealth } from "@/lib/hf-chat";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getChatHealth());
}
