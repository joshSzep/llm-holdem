import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  CURATED_MODELS,
  isCuratedModel,
  isSupportedProvider,
  type SupportedProvider,
} from "@/lib/llm/curated-models";
import { encryptAgentApiKey } from "@/lib/security/agent-key-crypto";
import { getSessionKey } from "@/lib/security/unlock-session";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

const createAgentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  provider: z.string(),
  modelId: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1).max(12000),
  apiKey: z.string().trim().min(1).max(500),
});

function validateProviderModel(
  provider: string,
  modelId: string,
): { provider: SupportedProvider } | { error: string } {
  if (!isSupportedProvider(provider)) {
    return { error: "Unsupported provider." };
  }

  if (!isCuratedModel(provider, modelId)) {
    return {
      error: `Model is not in curated list for provider '${provider}'.`,
    };
  }

  return { provider };
}

export async function GET() {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      provider: true,
      modelId: true,
      systemPrompt: true,
      keyVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    agents: agents.map((agent) => ({
      ...agent,
      hasApiKey: true,
    })),
  });
}

export async function POST(request: Request) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const input = createAgentSchema.safeParse(await request.json());
  if (!input.success) {
    return NextResponse.json(
      { error: "Invalid agent payload.", details: input.error.flatten() },
      { status: 400 },
    );
  }

  const providerCheck = validateProviderModel(input.data.provider, input.data.modelId);
  if ("error" in providerCheck) {
    return NextResponse.json({ error: providerCheck.error }, { status: 400 });
  }

  const encrypted = encryptAgentApiKey(input.data.apiKey, getSessionKey());

  const createdAgent = await prisma.agent.create({
    data: {
      name: input.data.name,
      provider: providerCheck.provider,
      modelId: input.data.modelId,
      systemPrompt: input.data.systemPrompt,
      encryptedKey: encrypted.encryptedKey,
      keySalt: encrypted.keySalt,
      keyIv: encrypted.keyIv,
      keyVersion: encrypted.keyVersion,
    },
    select: {
      id: true,
      name: true,
      provider: true,
      modelId: true,
      systemPrompt: true,
      keyVersion: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(
    {
      agent: {
        ...createdAgent,
        hasApiKey: true,
      },
    },
    { status: 201 },
  );
}

export async function OPTIONS() {
  return NextResponse.json(
    {
      providers: Object.keys(CURATED_MODELS),
    },
    { status: 200 },
  );
}
