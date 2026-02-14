import { NextResponse } from "next/server";

import { CURATED_MODELS } from "@/lib/llm/curated-models";

export async function GET() {
  return NextResponse.json({ models: CURATED_MODELS });
}
