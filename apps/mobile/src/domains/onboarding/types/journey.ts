export type OnboardingJourneyStage = "name" | "friends_intro" | "permissions_intro" | "complete";

export interface OnboardingJourneySnapshot {
  readonly stage: OnboardingJourneyStage;
  readonly fullName: string;
  readonly nameError: string | null;
}

export type OnboardingJourneyEvent =
  | { readonly type: "name_edited"; readonly value: string }
  | { readonly type: "name_submitted" }
  | { readonly type: "advanced" }
  | { readonly type: "reset" };

export interface OnboardingJourneyController {
  getSnapshot(): OnboardingJourneySnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: OnboardingJourneyEvent): void;
  dispose(): void;
}

export interface EducationDeckSnapshot {
  readonly index: number;
  readonly complete: boolean;
}

export type EducationDeckEvent =
  | { readonly type: "next" }
  | { readonly type: "previous" }
  | { readonly type: "skip" }
  | { readonly type: "reset" };

export interface EducationDeckController {
  getSnapshot(): EducationDeckSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: EducationDeckEvent): void;
  dispose(): void;
}
