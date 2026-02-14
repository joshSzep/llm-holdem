"use client";

import { useCallback, useEffect, useState } from "react";

import { AgentManager } from "@/components/agents/agent-manager";
import { LockButton } from "@/components/bootstrap/lock-button";
import { SetupForm } from "@/components/bootstrap/setup-form";
import { UnlockForm } from "@/components/bootstrap/unlock-form";
import { MatchManager } from "@/components/matches/match-manager";
import { LeaderboardPanel } from "@/components/leaderboard/leaderboard-panel";
import { AnalyticsPanel } from "@/components/analytics/analytics-panel";

type BootstrapStatus = {
  initialized: boolean;
  unlocked: boolean;
};

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-50">{title}</h1>
      <p className="mt-2 text-sm text-zinc-400">{description}</p>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export default function Home() {
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/bootstrap/status", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Failed to load bootstrap status.");
      }

      const body = (await response.json()) as BootstrapStatus;

      setStatus({
        initialized: Boolean(body.initialized),
        unlocked: Boolean(body.unlocked),
      });
      setStatusError(null);
    } catch {
      setStatusError("Unable to load app status.");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  if (statusError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-6 font-sans">
        <Card
          title="LLM Hold’em"
          description={statusError}
        >
          <button
            className="inline-flex w-full items-center justify-center rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
            onClick={() => void refreshStatus()}
            type="button"
          >
            Retry
          </button>
        </Card>
      </main>
    );
  }

  if (!status) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-6 font-sans">
        <Card
          title="LLM Hold’em"
          description="Loading app status..."
        >
          <p className="text-sm text-zinc-400">Checking initialization and unlock state.</p>
        </Card>
      </main>
    );
  }

  if (!status.initialized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-6 font-sans">
        <Card
          title="Set up LLM Hold&apos;em"
          description="Create a master passphrase to encrypt provider API keys at rest."
        >
          <SetupForm onSuccess={refreshStatus} />
        </Card>
      </main>
    );
  }

  if (!status.unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-6 font-sans">
        <Card
          title="Unlock LLM Hold’em"
          description="Enter your master passphrase to unlock encrypted agent credentials for this server session."
        >
          <UnlockForm onSuccess={refreshStatus} />
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-900 p-6 font-sans text-zinc-100">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                LLM Hold’em
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                App unlocked
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Startup passphrase flow is active. Next up: agent creator, encrypted key CRUD, and match runtime.
              </p>
            </div>
            <LockButton onLocked={refreshStatus} />
          </div>
        </header>

        <AgentManager />
        <MatchManager />
        <LeaderboardPanel />
        <AnalyticsPanel />
      </section>
    </main>
  );
}
