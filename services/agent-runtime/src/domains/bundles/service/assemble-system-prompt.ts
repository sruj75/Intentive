import type { PinnedProcedureFloor, TurnTrigger } from "../types/floor.js";

export function assembleSystemPrompt(input: {
  readonly floor: PinnedProcedureFloor;
  readonly trigger: TurnTrigger;
  readonly userProfile?: string | null;
  readonly recentPerception?: string | null;
  readonly firstRun?: boolean;
}): string {
  const sections = [
    section("SOUL", input.floor.documents.SOUL),
    section("AGENTS", input.floor.documents.AGENTS),
  ];

  if (input.firstRun) {
    sections.push(section("BOOTSTRAP", input.floor.documents.BOOTSTRAP));
  }

  if (input.trigger === "heartbeat" || input.trigger === "context_snapshot") {
    sections.push(section("HEARTBEAT", input.floor.documents.HEARTBEAT));
  }

  const profile = input.userProfile?.trim();
  if (profile) {
    sections.push(section("USER.md", profile));
  }

  const perception = input.recentPerception?.trim();
  if (perception) {
    sections.push(section("RECENT_PERCEPTION", perception));
  }

  return sections.join("\n\n");
}

function section(title: string, body: string): string {
  return [`# ${title}`, body.trim()].join("\n");
}
