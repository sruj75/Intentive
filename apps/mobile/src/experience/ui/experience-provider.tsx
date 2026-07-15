import React, { createContext, useEffect, useMemo, useSyncExternalStore } from "react";

import { createLocalExperienceController } from "../controller";
import type { ExperienceController, ExperienceEvent, ExperienceSnapshot } from "../types";

interface ExperienceContextValue {
  readonly snapshot: ExperienceSnapshot;
  readonly dispatch: (event: ExperienceEvent) => void;
}

const ExperienceContext = createContext<ExperienceContextValue | null>(null);

interface ExperienceProviderProps {
  readonly children: React.ReactNode;
  readonly createController?: () => ExperienceController;
}

export function ExperienceProvider({
  children,
  createController = createLocalExperienceController,
}: ExperienceProviderProps) {
  const controller = useMemo(() => createController(), [createController]);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => () => controller.dispose(), [controller]);

  const value = useMemo(
    () => ({ snapshot, dispatch: (event: ExperienceEvent) => controller.dispatch(event) }),
    [controller, snapshot],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience(): ExperienceContextValue {
  const context = React.use(ExperienceContext);
  if (context === null) throw new Error("useExperience must be rendered inside ExperienceProvider");
  return context;
}

export type { ExperienceController };
