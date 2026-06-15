import type { CronCardFields, CronJob } from "../types/cron.js";
import { parseSchedule } from "./schedule.js";

export function renderCard(job: CronJob): string {
  const frontmatter: Record<string, string> = {
    name: job.name,
    schedule: `${job.scheduleKind} ${job.scheduleExpr}`,
    status: job.status,
  };
  if (job.tz) {
    frontmatter.tz = job.tz;
  }
  if (job.nextFireAt) {
    frontmatter.next_fire_at = job.nextFireAt.toISOString();
  }

  const lines = [
    "---",
    ...Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`),
    "---",
  ];
  return `${lines.join("\n")}\n${job.prompt}`;
}

export function parseCard(content: string): CronCardFields {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---\n")) {
    throw new Error("Cron card requires YAML-style frontmatter.");
  }

  const end = trimmed.indexOf("\n---", 4);
  if (end < 0) {
    throw new Error("Cron card frontmatter must close with ---.");
  }

  const frontmatter = parseFrontmatter(trimmed.slice(4, end));
  const prompt = trimmed.slice(end + 4).trim();
  const name = required(frontmatter, "name");
  const schedule = frontmatter.schedule
    ? parseSchedule(frontmatter.schedule)
    : {
        kind: required(frontmatter, "schedule_kind") as CronCardFields["schedule"]["kind"],
        expr: required(frontmatter, "schedule_expr"),
      };
  const status = (frontmatter.status ?? "active") as CronCardFields["status"];
  if (status !== "active" && status !== "cancelled") {
    throw new Error("Cron card status must be active or cancelled.");
  }
  if (!prompt) {
    throw new Error("Cron card body prompt is required.");
  }

  return {
    name,
    schedule,
    tz: frontmatter.tz || undefined,
    status,
    nextFireAt: frontmatter.next_fire_at ? new Date(frontmatter.next_fire_at) : null,
    prompt,
  };
}

function parseFrontmatter(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const index = line.indexOf(":");
    if (index < 0) {
      throw new Error(`Invalid cron card frontmatter line: ${line}`);
    }
    const key = line.slice(0, index).trim();
    const value = line
      .slice(index + 1)
      .trim()
      .replace(/^["']|["']$/gu, "");
    fields[key] = value;
  }
  return fields;
}

function required(fields: Record<string, string>, key: string): string {
  const value = fields[key];
  if (!value) {
    throw new Error(`Cron card missing required field: ${key}`);
  }
  return value;
}
