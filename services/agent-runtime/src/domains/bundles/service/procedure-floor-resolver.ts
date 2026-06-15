import type { FloorSource, ProcedureFloorResolver } from "../types/floor.js";

export function createProcedureFloorResolver(params: {
  readonly source: FloorSource | null;
  readonly fallback: FloorSource;
}): ProcedureFloorResolver {
  return {
    async resolve(label) {
      if (params.source) {
        try {
          const floor = await params.source.fetch(label);
          if (floor) {
            return floor;
          }
        } catch {
          // Langfuse is behavior iteration infrastructure, not a runtime dependency.
        }
      }

      const fallback = await params.fallback.fetch(label);
      if (!fallback) {
        throw new Error("Bundled Procedure Floor fallback is unavailable.");
      }
      return fallback;
    },
  };
}
