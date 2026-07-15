export type ExperienceScene =
  | "auth"
  | "name"
  | "friends_intro"
  | "permissions_intro"
  | "education"
  | "chat";

export type ChatMode = "welcome" | "ready";
export type ExperienceOverlay = "none" | "drawer" | "settings";
export type ChatPhase = "idle" | "user_sent" | "thinking" | "composing" | "replied";

export type ConversationTimelineItem =
  | {
      readonly id: string;
      readonly kind: "capability_card";
      readonly title: string;
      readonly body: string;
      readonly actionLabel: string;
      readonly disabled: true;
    }
  | {
      readonly id: string;
      readonly kind: "suggestion_group";
      readonly suggestions: readonly string[];
    }
  | { readonly id: string; readonly kind: "user_message"; readonly text: string }
  | { readonly id: string; readonly kind: "companion_message"; readonly text: string }
  | {
      readonly id: string;
      readonly kind: "activity";
      readonly phase: "thinking" | "composing";
    };

export interface ExperienceSettings {
  readonly proactiveSuggestions: boolean;
  readonly privacy: boolean;
  readonly additionalPrivacyRules: string;
}

export interface ExperienceSnapshot {
  readonly scene: ExperienceScene;
  readonly chatMode: ChatMode;
  readonly fullName: string;
  readonly firstName: string;
  readonly initials: string;
  readonly nameError: string | null;
  readonly educationIndex: number;
  readonly overlay: ExperienceOverlay;
  readonly settings: ExperienceSettings;
  readonly composerValue: string;
  readonly timeline: readonly ConversationTimelineItem[];
  readonly chatPhase: ChatPhase;
}

export type ExperienceEvent =
  | { readonly type: "authentication_selected"; readonly method: "apple" | "phone" }
  | { readonly type: "name_edited"; readonly value: string }
  | { readonly type: "name_submitted" }
  | { readonly type: "advance" }
  | { readonly type: "education_next" }
  | { readonly type: "education_previous" }
  | { readonly type: "education_skipped" }
  | { readonly type: "overlay_opened"; readonly overlay: "drawer" | "settings" }
  | { readonly type: "overlay_closed" }
  | {
      readonly type: "setting_toggled";
      readonly setting: "proactiveSuggestions" | "privacy";
    }
  | { readonly type: "privacy_rule_edited"; readonly value: string }
  | { readonly type: "suggestion_selected"; readonly value: string }
  | { readonly type: "composer_edited"; readonly value: string }
  | { readonly type: "composer_submitted" }
  | { readonly type: "education_replayed" }
  | { readonly type: "logged_out" }
  | { readonly type: "reset" };

export interface ExperienceController {
  getSnapshot(): ExperienceSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: ExperienceEvent): void;
  dispose(): void;
}
