export interface EducationSlide {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly mediaLabel: string;
  readonly example: readonly {
    readonly side: "user" | "companion" | "system";
    readonly text: string;
  }[];
}

export const onboardingContent = {
  name: {
    label: "Full Name",
    placeholder: "First and last name",
    error: "Enter your first and last name",
    continue: "Continue",
  },
  friends: {
    title: "Genie Mentions",
    body: "Genie keeps tabs on you and your friends. Genie will bring you closer to the people in your life.",
    action: "Add Friends",
    example: {
      firstPrompt: "How’s Matt?",
      reply:
        "He’s alive, technically. Currently three coffees deep, debating whether a 1974 thriller counts as ‘underrated cinema’ while ignoring every text except the group chat. So… very Matt.",
      secondPrompt: "Remind him to meet me later.",
    },
  },
  permissions: {
    title: "Genie is proactive.",
    action: "Enable Permissions",
    mediaLabel: "Proactive conversation preview",
    example: {
      prompt: "We did, you nailed it.",
      reply:
        "Happy anniversary! See, good things happen when you actually listen to my advice. I’m already thinking about what you and Max can do next.",
      composerPlaceholder: "Say hi…",
    },
  },
  education: [
    {
      eyebrow: "Context",
      title: "Genie understands your context",
      body: "Share what matters in the moment and Genie keeps the people, details, and meaning together.",
      mediaLabel: "Context preview",
      example: [
        { side: "user", text: "Look at this." },
        {
          side: "companion",
          text: "That’s beautiful. Soft, intimate, and more colorful than your usual style, but still very you. I’ll remember it.",
        },
      ],
    },
    {
      eyebrow: "Reminders",
      title: "Set social reminders",
      body: "Genie understands your relationships and routines to create timely, contextual reminders that feel natural.",
      mediaLabel: "Reminder preview",
      example: [
        { side: "user", text: "Remind him to meet me later." },
        { side: "system", text: "Get Matt to chill · Reminder sent to Matt" },
        {
          side: "companion",
          text: "Done, I’ll remind him. Though convincing Matt to unwind may require food, emotional support, and a very specific level of ambient lighting.",
        },
      ],
    },
    {
      eyebrow: "Memory",
      title: "Genie remembers",
      body: "The details you share stay connected, so conversations can pick up naturally instead of starting over.",
      mediaLabel: "Memory preview",
      example: [
        { side: "user", text: "The blue one was my favorite." },
        { side: "companion", text: "Got it. I’ll keep that in mind next time we compare options." },
      ],
    },
    {
      eyebrow: "Taste",
      title: "Genie learns your taste",
      body: "The more you share, the better Genie understands the places, ideas, and experiences that feel like you.",
      mediaLabel: "Taste preview",
      example: [
        { side: "user", text: "Somewhere quiet, warm, and not too polished." },
        { side: "companion", text: "I know exactly the kind of place you mean." },
      ],
    },
    {
      eyebrow: "Sibling Connect",
      title: "Genie sends messages",
      body: "Found something good? Genie can send it to someone and keep the conversation moving.",
      mediaLabel: "Message preview",
      example: [
        { side: "user", text: "Send this to Max." },
        { side: "system", text: "Message ready for Max" },
        { side: "companion", text: "Done. I kept it simple and sent the useful part." },
      ],
    },
  ] satisfies readonly EducationSlide[],
  educationControls: {
    skip: "Skip education",
    continue: "Continue",
    finish: "Get Started",
  },
} as const;
