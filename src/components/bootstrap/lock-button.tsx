"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LockButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onLock() {
    setIsSubmitting(true);

    try {
      await fetch("/api/bootstrap/lock", { method: "POST" });
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onLock}
      disabled={isSubmitting}
      className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800 disabled:opacity-60"
    >
      {isSubmitting ? "Locking..." : "Lock app"}
    </button>
  );
}
