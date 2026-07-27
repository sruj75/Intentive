import type { FloorSource, ProcedureFloorResolver } from "../types/floor.js";

export function createProcedureFloorResolver(params: {
  readonly source: FloorSource;
}): ProcedureFloorResolver {
  return {
    async resolve(label) {
      const floor = await params.source.fetch(label);
      if (!floor) {
        throw new Error(`Procedure Floor label "${label}" is unavailable.`);
      }
      return floor;
    },
  };
}
