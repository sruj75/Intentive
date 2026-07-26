import {
  PROCEDURE_FLOOR_DOCUMENTS,
  PROCEDURE_FLOOR_PROMPT_NAME,
  type FloorSource,
  type PinnedProcedureFloor,
  type ProcedureFloorDocument,
} from "../types/floor.js";

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
      const prompt = await params.client.getPrompt(PROCEDURE_FLOOR_PROMPT_NAME, undefined, {
        label,
        type: "text",
      });
      const documents = parseProcedureFloorBundle(promptText(prompt));

      return {
        version: String(prompt.version ?? "unknown"),
        documents,
        langfusePrompts: [parsePromptHandle(prompt.toJSON())],
      };
    },
  };
}

function promptText(prompt: LangfusePrompt): string {
  const compiled = prompt.compile?.();
  const value = compiled ?? prompt.prompt;
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

export function parseProcedureFloorBundle(content: string): PinnedProcedureFloor["documents"] {
  const marker = /^## File: (SOUL|AGENTS|BOOTSTRAP|HEARTBEAT)\.md\s*$/gm;
  const matches = [...content.matchAll(marker)];
  const documents = new Map<ProcedureFloorDocument, string>();

  for (const [index, match] of matches.entries()) {
    const document = match[1] as ProcedureFloorDocument;
    if (documents.has(document)) {
      throw new Error(`Langfuse Procedure Floor contains duplicate ${document}.md.`);
    }
    const bodyStart = (match.index ?? 0) + match[0].length;
    const bodyEnd = matches[index + 1]?.index ?? content.length;
    const body = content.slice(bodyStart, bodyEnd).trim();
    if (!body) {
      throw new Error(`Langfuse Procedure Floor contains an empty ${document}.md.`);
    }
    documents.set(document, body);
  }

  const missing = PROCEDURE_FLOOR_DOCUMENTS.filter((document) => !documents.has(document));
  if (missing.length > 0) {
    throw new Error(
      `Langfuse Procedure Floor is missing required documents: ${missing.join(", ")}.`,
    );
  }

  return Object.fromEntries(documents) as PinnedProcedureFloor["documents"];
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
