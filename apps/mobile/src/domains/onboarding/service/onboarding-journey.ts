import type {
  OnboardingJourneyController,
  OnboardingJourneyEvent,
  OnboardingJourneySnapshot,
} from "../types/journey.js";
import { validateFullName } from "./name-validation.js";
import { createControllerStore } from "./controller-store.js";

const initialJourney: OnboardingJourneySnapshot = {
  stage: "name",
  fullName: "",
  nameError: null,
};

function reduceJourney(
  snapshot: OnboardingJourneySnapshot,
  event: OnboardingJourneyEvent,
): OnboardingJourneySnapshot {
  if (event.type === "reset") return initialJourney;
  if (event.type === "name_edited" && snapshot.stage === "name") {
    return { ...snapshot, fullName: event.value, nameError: null };
  }
  if (event.type === "name_submitted" && snapshot.stage === "name") {
    const result = validateFullName(snapshot.fullName);
    return result.ok
      ? { stage: "friends_intro", fullName: result.value, nameError: null }
      : { ...snapshot, nameError: result.error };
  }
  if (event.type === "advanced" && snapshot.stage === "friends_intro") {
    return { ...snapshot, stage: "permissions_intro" };
  }
  if (event.type === "advanced" && snapshot.stage === "permissions_intro") {
    return { ...snapshot, stage: "complete" };
  }
  return snapshot;
}

export function createOnboardingJourneyController(): OnboardingJourneyController {
  return createControllerStore(initialJourney, reduceJourney);
}
