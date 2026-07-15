import { createReadyTimeline, experienceContent } from "./content.js";
import type {
  ConversationTimelineItem,
  ExperienceController,
  ExperienceEvent,
  ExperienceSnapshot,
} from "./types.js";

declare function setTimeout(callback: () => void, delayMs: number): unknown;
declare function clearTimeout(handle: unknown): void;

interface ExperienceScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface LocalExperienceControllerOptions {
  readonly scheduler?: ExperienceScheduler;
  readonly delays?: {
    readonly thinkingMs: number;
    readonly composingMs: number;
    readonly replyMs: number;
  };
}

const defaultScheduler: ExperienceScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

const defaultDelays = { thinkingMs: 450, composingMs: 1_050, replyMs: 1_750 } as const;

function initialSnapshot(): ExperienceSnapshot {
  return {
    scene: "auth",
    chatMode: "welcome",
    fullName: "",
    firstName: "",
    initials: "",
    nameError: null,
    educationIndex: 0,
    overlay: "none",
    settings: {
      proactiveSuggestions: true,
      privacy: true,
      additionalPrivacyRules: "",
    },
    composerValue: "",
    timeline: [],
    chatPhase: "idle",
  };
}

function normalizedName(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).join(" ");
}

function initialsFor(parts: readonly string[]): string {
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function createLocalExperienceController(
  options: LocalExperienceControllerOptions = {},
): ExperienceController {
  const scheduler = options.scheduler ?? defaultScheduler;
  const delays = options.delays ?? defaultDelays;
  const listeners = new Set<() => void>();
  const timerHandles = new Set<unknown>();
  let snapshot = initialSnapshot();
  let disposed = false;
  let turnId = 0;

  const publish = (next: ExperienceSnapshot): void => {
    if (disposed || Object.is(next, snapshot)) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const clearTimers = (): void => {
    timerHandles.forEach((handle) => scheduler.clearTimeout(handle));
    timerHandles.clear();
  };

  const reset = (): void => {
    clearTimers();
    turnId = 0;
    publish(initialSnapshot());
  };

  const schedule = (callback: () => void, delayMs: number): void => {
    let handle: unknown;
    handle = scheduler.setTimeout(() => {
      timerHandles.delete(handle);
      if (!disposed) callback();
    }, delayMs);
    timerHandles.add(handle);
  };

  const replaceActivity = (
    items: readonly ConversationTimelineItem[],
    activity: ConversationTimelineItem,
  ): readonly ConversationTimelineItem[] => [
    ...items.filter((item) => item.kind !== "activity"),
    activity,
  ];

  const enterReadyChat = (): void => {
    publish({
      ...snapshot,
      scene: "chat",
      chatMode: "ready",
      overlay: "none",
      timeline: createReadyTimeline(),
      chatPhase: "idle",
    });
  };

  const submitComposer = (): void => {
    const text = snapshot.composerValue.trim();
    if (snapshot.scene !== "chat" || snapshot.chatMode !== "ready" || text.length === 0) return;

    clearTimers();
    turnId += 1;
    const activeTurn = turnId;
    const responseNumber = snapshot.timeline.filter(
      (item) => item.kind === "companion_message",
    ).length;
    publish({
      ...snapshot,
      composerValue: "",
      chatPhase: "user_sent",
      timeline: [
        ...snapshot.timeline.filter(
          (item) => item.kind === "user_message" || item.kind === "companion_message",
        ),
        { id: `user-${activeTurn}`, kind: "user_message", text },
      ],
    });

    schedule(() => {
      if (activeTurn !== turnId) return;
      publish({
        ...snapshot,
        chatPhase: "thinking",
        timeline: replaceActivity(snapshot.timeline, {
          id: `activity-${activeTurn}`,
          kind: "activity",
          phase: "thinking",
        }),
      });
    }, delays.thinkingMs);

    schedule(() => {
      if (activeTurn !== turnId) return;
      publish({
        ...snapshot,
        chatPhase: "composing",
        timeline: replaceActivity(snapshot.timeline, {
          id: `activity-${activeTurn}`,
          kind: "activity",
          phase: "composing",
        }),
      });
    }, delays.composingMs);

    schedule(() => {
      if (activeTurn !== turnId) return;
      const reply =
        responseNumber === 0
          ? experienceContent.chat.firstReply.replace(
              "{firstName}",
              snapshot.firstName || experienceContent.chat.replyNameFallback,
            )
          : experienceContent.chat.laterReply;
      publish({
        ...snapshot,
        chatPhase: "replied",
        timeline: [
          ...snapshot.timeline.filter((item) => item.kind !== "activity"),
          { id: `companion-${activeTurn}`, kind: "companion_message", text: reply },
        ],
      });
    }, delays.replyMs);
  };

  const dispatch = (event: ExperienceEvent): void => {
    if (disposed) return;

    switch (event.type) {
      case "authentication_selected":
        if (snapshot.scene === "auth") publish({ ...snapshot, scene: "name" });
        return;
      case "name_edited":
        if (snapshot.scene === "name") {
          publish({ ...snapshot, fullName: event.value, nameError: null });
        }
        return;
      case "name_submitted": {
        if (snapshot.scene !== "name") return;
        const value = normalizedName(snapshot.fullName);
        const parts = value.split(" ").filter(Boolean);
        if (parts.length < 2) {
          publish({ ...snapshot, nameError: experienceContent.name.error });
          return;
        }
        publish({
          ...snapshot,
          scene: "friends_intro",
          fullName: value,
          firstName: parts[0] ?? "",
          initials: initialsFor(parts),
          nameError: null,
        });
        return;
      }
      case "advance":
        if (snapshot.scene === "friends_intro") {
          publish({ ...snapshot, scene: "permissions_intro" });
        } else if (snapshot.scene === "permissions_intro") {
          publish({ ...snapshot, scene: "chat", chatMode: "welcome" });
        } else if (snapshot.scene === "chat" && snapshot.chatMode === "welcome") {
          publish({ ...snapshot, scene: "education", educationIndex: 0, overlay: "none" });
        }
        return;
      case "education_next":
        if (snapshot.scene !== "education") return;
        if (snapshot.educationIndex < experienceContent.education.length - 1) {
          publish({ ...snapshot, educationIndex: snapshot.educationIndex + 1 });
        } else {
          enterReadyChat();
        }
        return;
      case "education_previous":
        if (snapshot.scene === "education" && snapshot.educationIndex > 0) {
          publish({ ...snapshot, educationIndex: snapshot.educationIndex - 1 });
        }
        return;
      case "education_skipped":
        if (snapshot.scene === "education") {
          enterReadyChat();
        }
        return;
      case "overlay_opened":
        if (snapshot.scene === "chat") publish({ ...snapshot, overlay: event.overlay });
        return;
      case "overlay_closed":
        if (snapshot.overlay !== "none") publish({ ...snapshot, overlay: "none" });
        return;
      case "setting_toggled":
        if (snapshot.overlay === "settings") {
          publish({
            ...snapshot,
            settings: {
              ...snapshot.settings,
              [event.setting]: !snapshot.settings[event.setting],
            },
          });
        }
        return;
      case "privacy_rule_edited":
        if (snapshot.overlay === "settings") {
          publish({
            ...snapshot,
            settings: { ...snapshot.settings, additionalPrivacyRules: event.value },
          });
        }
        return;
      case "suggestion_selected":
        if (snapshot.scene === "chat" && snapshot.chatMode === "ready") {
          publish({ ...snapshot, composerValue: event.value });
        }
        return;
      case "composer_edited":
        if (snapshot.scene === "chat" && snapshot.chatMode === "ready") {
          publish({ ...snapshot, composerValue: event.value });
        }
        return;
      case "composer_submitted":
        submitComposer();
        return;
      case "education_replayed":
        if (snapshot.overlay === "settings") {
          publish({ ...snapshot, scene: "education", educationIndex: 0, overlay: "none" });
        }
        return;
      case "logged_out":
      case "reset":
        reset();
        return;
    }
  };

  const controller: ExperienceController = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch,
    dispose() {
      if (disposed) return;
      clearTimers();
      listeners.clear();
      disposed = true;
    },
  };

  return controller;
}
