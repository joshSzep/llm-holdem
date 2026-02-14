import { AgentManager } from "@/components/agents/agent-manager";
import { LockButton } from "@/components/bootstrap/lock-button";
import { SetupForm } from "@/components/bootstrap/setup-form";
import { UnlockForm } from "@/components/bootstrap/unlock-form";
import { prisma } from "@/lib/prisma";
import { isUnlocked } from "@/lib/security/unlock-session";

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

export default async function Home() {
  const secret = await prisma.appSecret.findUnique({
    where: { id: "singleton" },
  });
  const initialized = Boolean(secret);
  const unlocked = isUnlocked();

  if (!initialized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-6 font-sans">
        <Card
          title="Set up LLM Hold&apos;em"
          description="Create a master passphrase to encrypt provider API keys at rest."
        >
          <SetupForm />
        </Card>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-6 font-sans">
        <Card
          title="Unlock LLM Hold’em"
          description="Enter your master passphrase to unlock encrypted agent credentials for this server session."
        >
          <UnlockForm />
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
            <LockButton />
          </div>
        </header>

        <AgentManager />
      </section>
    </main>
  );
}
