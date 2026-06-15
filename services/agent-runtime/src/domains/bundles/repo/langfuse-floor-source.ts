import type { FloorSource, PinnedProcedureFloor, ProcedureFloorDocument } from "../types/floor.js";

const promptNames: Record<ProcedureFloorDocument, string> = {
  SOUL: "companion-soul",
  AGENTS: "companion-agents",
  BOOTSTRAP: "companion-bootstrap",
  HEARTBEAT: "companion-heartbeat",
};

interface LangfusePrompt {
  readonly name?: string;
  readonly version?: number;
  readonly prompt?: string | readonly unknown[];
  compile?: () => string | readonly unknown[];
  toJSON(): unknown;
}

export interface LangfusePromptClient {
  getPrompt(
    name: string,
    version?: number,
    options?: { label?: string; type?: "text" },
  ): Promise<LangfusePrompt>;
}

export function createLangfuseFloorSource(params: {
  readonly client: LangfusePromptClient;
}): FloorSource {
  return {
    async fetch(label) {
      const entries = await Promise.all(
        Object.entries(promptNames).map(async ([document, name]) => {
          const prompt = await params.client.getPrompt(name, undefined, { label, type: "text" });
          return [document as ProcedureFloorDocument, prompt] as const;
        }),
      );

      const documents = Object.fromEntries(
        entries.map(([document, prompt]) => [document, promptText(prompt)]),
      ) as PinnedProcedureFloor["documents"];
      const langfusePrompts = entries.map(([, prompt]) => parsePromptHandle(prompt.toJSON()));

      return {
        version: resolvedVersion(entries),
        documents,
        langfusePrompts,
      };
    },
  };
}

function promptText(prompt: LangfusePrompt): string {
  const compiled = prompt.compile?.();
  const value = compiled ?? prompt.prompt;
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function resolvedVersion(
  entries: readonly (readonly [ProcedureFloorDocument, LangfusePrompt])[],
): string {
  return entries
    .map(([document, prompt]) => `${document}:${String(prompt.version ?? "unknown")}`)
    .join(",");
}

function parsePromptHandle(handle: unknown): unknown {
  if (typeof handle !== "string") {
    return handle;
  }

  try {
    return JSON.parse(handle);
  } catch {
    return handle;
  }
}
