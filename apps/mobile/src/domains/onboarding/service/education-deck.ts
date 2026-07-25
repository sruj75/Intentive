import { onboardingContent } from "../config/content.js";
import type {
  EducationDeckController,
  EducationDeckEvent,
  EducationDeckSnapshot,
} from "../types/journey.js";
import { createControllerStore } from "./controller-store.js";

const initialEducation: EducationDeckSnapshot = { index: 0, complete: false };

function reduceEducation(
  snapshot: EducationDeckSnapshot,
  event: EducationDeckEvent,
): EducationDeckSnapshot {
  if (event.type === "reset") return initialEducation;
  if (event.type === "skip") return { ...snapshot, complete: true };
  if (event.type === "previous" && snapshot.index > 0) {
    return { ...snapshot, index: snapshot.index - 1 };
  }
  if (event.type === "next" && snapshot.index < onboardingContent.education.length - 1) {
    return { ...snapshot, index: snapshot.index + 1 };
  }
  if (event.type === "next" && snapshot.index === onboardingContent.education.length - 1) {
    return { ...snapshot, complete: true };
  }
  return snapshot;
}

export function createEducationDeckController(): EducationDeckController {
  return createControllerStore(initialEducation, reduceEducation);
}
