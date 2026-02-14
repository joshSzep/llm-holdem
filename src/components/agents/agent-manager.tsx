"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  CURATED_MODELS,
  type SupportedProvider,
} from "@/lib/llm/curated-models";

type AgentSummary = {
  id: string;
  name: string;
  provider: SupportedProvider;
  modelId: string;
  systemPrompt: string;
  keyVersion: number;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
};

type EditorState = {
  name: string;
  provider: SupportedProvider;
  modelId: string;
  systemPrompt: string;
  apiKey: string;
};

const defaultProvider: SupportedProvider = "openai";

const initialEditor: EditorState = {
  name: "",
  provider: defaultProvider,
  modelId: CURATED_MODELS[defaultProvider][0],
  systemPrompt: "You are a disciplined tournament poker player.",
  apiKey: "",
};

const editorDraftStorageKey = "llm-holdem-agent-editor-draft-v1";

type EditorDraft = {
  editor: EditorState;
  editingId: string | null;
};

export function AgentManager() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editor, setEditor] = useState<EditorState>(initialEditor);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const availableModels = useMemo(
    () => CURATED_MODELS[editor.provider],
    [editor.provider],
  );

  useEffect(() => {
    void refreshAgents();
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(editorDraftStorageKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Partial<EditorDraft>;
      if (!parsed.editor) {
        return;
      }

      const draft = parsed.editor;
      if (
        typeof draft.name !== "string" ||
        typeof draft.provider !== "string" ||
        typeof draft.modelId !== "string" ||
        typeof draft.systemPrompt !== "string" ||
        typeof draft.apiKey !== "string"
      ) {
        return;
      }

      setEditor({
        name: draft.name,
        provider: draft.provider as SupportedProvider,
        modelId: draft.modelId,
        systemPrompt: draft.systemPrompt,
        apiKey: draft.apiKey,
      });
      setEditingId(typeof parsed.editingId === "string" ? parsed.editingId : null);
    } catch {
      window.sessionStorage.removeItem(editorDraftStorageKey);
    }
  }, []);

  useEffect(() => {
    const draft: EditorDraft = {
      editor,
      editingId,
    };

    window.sessionStorage.setItem(editorDraftStorageKey, JSON.stringify(draft));
  }, [editor, editingId]);

  async function refreshAgents() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to fetch agents.");
      }

      const body = (await response.json()) as { agents: AgentSummary[] };
      setAgents(body.agents);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to fetch agents.",
      );
    } finally {
      setLoading(false);
    }
  }

  function resetEditor() {
    setEditingId(null);
    setEditor(initialEditor);
    window.sessionStorage.removeItem(editorDraftStorageKey);
  }

  function beginEdit(agent: AgentSummary) {
    setEditingId(agent.id);
    setEditor({
      name: agent.name,
      provider: agent.provider,
      modelId: agent.modelId,
      systemPrompt: agent.systemPrompt,
      apiKey: "",
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const endpoint = editingId ? `/api/agents/${editingId}` : "/api/agents";
    const method = editingId ? "PATCH" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editor.name,
          provider: editor.provider,
          modelId: editor.modelId,
          systemPrompt: editor.systemPrompt,
          apiKey: editor.apiKey,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save agent.");
      }

      await refreshAgents();
      resetEditor();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to save agent.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(agentId: string) {
    setError(null);

    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to delete agent.");
      }

      if (editingId === agentId) {
        resetEditor();
      }

      await refreshAgents();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete agent.",
      );
    }
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Agents</h2>
        <p className="text-sm text-zinc-400">
          Create and manage LLM agents with provider, curated model, system prompt, and encrypted API key.
        </p>
      </div>

      <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm text-zinc-300" htmlFor="agent-name">
              Display name
            </label>
            <input
              id="agent-name"
              value={editor.name}
              onChange={(event) =>
                setEditor((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-300" htmlFor="agent-provider">
              Provider
            </label>
            <select
              id="agent-provider"
              value={editor.provider}
              onChange={(event) => {
                const provider = event.target.value as SupportedProvider;
                setEditor((current) => ({
                  ...current,
                  provider,
                  modelId: CURATED_MODELS[provider][0],
                }));
              }}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            >
              {Object.keys(CURATED_MODELS).map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300" htmlFor="agent-model">
            Model
          </label>
          <select
            id="agent-model"
            value={editor.modelId}
            onChange={(event) =>
              setEditor((current) => ({ ...current, modelId: event.target.value }))
            }
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          >
            {availableModels.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300" htmlFor="agent-system-prompt">
            System prompt
          </label>
          <textarea
            id="agent-system-prompt"
            value={editor.systemPrompt}
            onChange={(event) =>
              setEditor((current) => ({ ...current, systemPrompt: event.target.value }))
            }
            rows={5}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm text-zinc-300" htmlFor="agent-api-key">
            API key {editingId ? "(leave blank to keep existing key)" : ""}
          </label>
          <input
            id="agent-api-key"
            type="password"
            value={editor.apiKey}
            onChange={(event) =>
              setEditor((current) => ({ ...current, apiKey: event.target.value }))
            }
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            required={!editingId}
          />
        </div>

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-60"
          >
            {submitting
              ? "Saving..."
              : editingId
                ? "Update agent"
                : "Create agent"}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetEditor}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <div className="mt-8">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Saved agents
        </h3>

        {loading ? <p className="mt-3 text-sm text-zinc-400">Loading agents...</p> : null}

        {!loading && agents.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No agents yet. Create your first one above.
          </p>
        ) : null}

        <ul className="mt-3 space-y-3">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{agent.name}</p>
                  <p className="text-xs text-zinc-400">
                    {agent.provider} · {agent.modelId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => beginEdit(agent)}
                    className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void onDelete(agent.id)}
                    className="rounded-md border border-rose-900 px-3 py-1.5 text-xs text-rose-300 transition hover:bg-rose-950/60"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-zinc-400">{agent.systemPrompt}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
