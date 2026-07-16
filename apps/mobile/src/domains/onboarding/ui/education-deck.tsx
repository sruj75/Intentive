import { useEffect, useMemo, useSyncExternalStore } from "react";

import { createEducationDeckController } from "../service/education-deck";
import { EducationScene } from "./education-scene";

export function EducationDeck({ onComplete }: { readonly onComplete: () => void }) {
  const controller = useMemo(() => createEducationDeckController(), []);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => () => controller.dispose(), [controller]);

  const dispatchAndComplete = (event: "next" | "skip") => {
    controller.dispatch({ type: event });
    if (controller.getSnapshot().complete) onComplete();
  };

  return (
    <EducationScene
      index={snapshot.index}
      onNext={() => dispatchAndComplete("next")}
      onPrevious={() => controller.dispatch({ type: "previous" })}
      onSkip={() => dispatchAndComplete("skip")}
    />
  );
}
