import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  isCuratedModel,
  isSupportedProvider,
  type SupportedProvider,
} from "@/lib/llm/curated-models";
import { encryptAgentApiKey } from "@/lib/security/agent-key-crypto";
import { getSessionKey } from "@/lib/security/unlock-session";
import { requireUnlockedResponse } from "@/lib/security/require-unlock";

const updateAgentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  provider: z.string(),
  modelId: z.string().trim().min(1),
  systemPrompt: z.string().trim().min(1).max(12000),
  apiKey: z.string().trim().max(500).optional(),
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

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

export async function PATCH(request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { agentId } = await context.params;
  const existing = await prisma.agent.findUnique({ where: { id: agentId } });

  if (!existing) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  const input = updateAgentSchema.safeParse(await request.json());
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

  const apiKey = input.data.apiKey?.trim();
  const encrypted = apiKey
    ? encryptAgentApiKey(apiKey, getSessionKey())
    : {
        encryptedKey: existing.encryptedKey,
        keySalt: existing.keySalt,
        keyIv: existing.keyIv,
        keyVersion: existing.keyVersion,
      };

  const updated = await prisma.agent.update({
    where: { id: agentId },
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

  return NextResponse.json({
    agent: {
      ...updated,
      hasApiKey: true,
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const lockedResponse = requireUnlockedResponse();
  if (lockedResponse) {
    return lockedResponse;
  }

  const { agentId } = await context.params;

  const existing = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!existing) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }

  await prisma.agent.delete({ where: { id: agentId } });

  return NextResponse.json({ deleted: true, agentId });
}
