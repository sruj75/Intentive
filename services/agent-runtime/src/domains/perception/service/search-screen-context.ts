import { tool, type StructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import type { ScreenContextSearchInput, ScreenContextSearchResult } from "../types/perception.js";

const SearchScreenContextInput = z
  .object({
    query: z.string().default(""),
    limit: z.number().int().positive().max(10).optional(),
  })
  .strict();

export type SearchScreenContext = (
  input: ScreenContextSearchInput,
) => Promise<ScreenContextSearchResult[]>;

export function createSearchScreenContextTool(params: {
  readonly search: SearchScreenContext;
  readonly userId: string;
}): StructuredTool {
  return tool(
    async ({ query, limit }) => {
      const results = await params.search({ userId: params.userId, query, limit });
      if (results.length === 0) {
        return "No Screen Memory records matched.";
      }
      return results.map(renderResult).join("\n\n");
    },
    {
      name: "search_screen_context",
      description:
        "Search the user's synced Screen Memory summaries. Use it when recent perception is insufficient and you need older screen context.",
      schema: SearchScreenContextInput,
    },
  );
}

function renderResult(result: ScreenContextSearchResult): string {
  return [
    `Event: ${result.eventId}`,
    `Artifact: ${result.artifactType}`,
    `Captured at: ${result.capturedAt}`,
    `Period: ${result.periodStart} to ${result.periodEnd}`,
    `Sensitivity: ${result.sensitivityLabel}`,
    `Confidence: ${result.confidence}`,
    `Summary: ${result.summary}`,
    `Local ref: ${result.localRecordRef}`,
  ].join("\n");
}
