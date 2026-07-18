import type { ConversationTimelineItem } from "../types/conversation-timeline.js";

export const chatContent = {
  welcome: {
    title: "Welcome to Intentive, let’s learn how to Intentive.",
    action: "Get Started",
  },
  drawer: {
    rows: [
      { id: "tasks", label: "Tasks", icon: "▰" },
      { id: "messages", label: "Messages", icon: "◒" },
      { id: "friends", label: "Friends", icon: "✣" },
    ] as const,
    recent: "Recent",
    empty: "Nothing here yet",
    home: "Intentive",
    openSettings: "Open settings",
    closeMenu: "Close menu",
  },
  openMenu: "Open profile menu",
  capabilityTitle: "Friends",
  capabilityBody:
    "Connect with friends to let Intentive help you stay close to the people in your life.",
  capabilityAction: "Add Friends",
  suggestions: [
    "What can you do for me?",
    "Lunch spots open nearby now?",
    "Remind me to call someone?",
  ],
  composerPlaceholder: "Follow up",
  composerLabel: "Message Intentive",
  attachmentUnavailable: "Add attachment unavailable",
  microphoneUnavailable: "Microphone unavailable",
  thinkingLabel: "Intentive is thinking",
  composingLabel: "Intentive is composing",
  replyNameFallback: "there",
  firstReply: "Hey {firstName}. Good to see you. How’s your day looking—anything on your mind?",
  laterReply:
    "I’m right here. This local prototype can keep the conversation moving while we shape the real experience.",
} as const;

export function createReadyTimeline(): readonly ConversationTimelineItem[] {
  return [
    {
      id: "capability-friends",
      kind: "capability_card",
      title: chatContent.capabilityTitle,
      body: chatContent.capabilityBody,
      actionLabel: chatContent.capabilityAction,
      disabled: true,
    },
    { id: "suggestions", kind: "suggestion_group", suggestions: chatContent.suggestions },
  ];
}
