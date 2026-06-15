import { getConfig } from "@langchain/langgraph";
import type {
  BackendProtocolV2,
  EditResult,
  GlobResult,
  GrepResult,
  LsResult,
  ReadRawResult,
  ReadResult,
  WriteResult,
} from "deepagents";

import { computeNextFireAt, resolveTz } from "../config/schedule.js";
import { parseCard, renderCard } from "../config/cron-card.js";
import type { CronJob } from "../types/cron.js";
import type { CronJobsRepo } from "./cron-jobs.js";

export interface CronBackendDeps {
  readonly repo: Pick<CronJobsRepo, "upsertQuery" | "loadByPath" | "listByUser">;
  readonly runQuery?: <Row>(query: Promise<Row[]>) => Promise<Row[]>;
  readonly loadUserTz?: (userId: string) => Promise<string | null>;
  readonly getUserId?: () => string;
  readonly clock?: () => Date;
}

export function createCronBackend(deps: CronBackendDeps): BackendProtocolV2 {
  const backend = new CronBackend(deps);
  return backend;
}

class CronBackend implements BackendProtocolV2 {
  private readonly clock: () => Date;

  constructor(private readonly deps: CronBackendDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  async ls(path: string): Promise<LsResult> {
    if (normalizeDir(path) !== "/") {
      return { files: [] };
    }
    const userId = this.userId();
    const jobs = await this.deps.repo.listByUser(userId);
    return {
      files: jobs.map((job) => ({
        path: job.path,
        is_dir: false,
        size: renderCard(job).length,
        modified_at: job.updatedAt?.toISOString() ?? "",
      })),
    };
  }

  async read(filePath: string): Promise<ReadResult> {
    const job = await this.load(filePath);
    if (!job) {
      return { error: `File '${filePath}' not found` };
    }
    return { content: renderCard(job), mimeType: "text/markdown" };
  }

  async readRaw(filePath: string): Promise<ReadRawResult> {
    const result = await this.read(filePath);
    if (result.error || typeof result.content !== "string") {
      return { error: result.error ?? `File '${filePath}' not found` };
    }
    const now = new Date().toISOString();
    return {
      data: {
        content: result.content,
        mimeType: "text/markdown",
        created_at: now,
        modified_at: now,
      },
    };
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const path = normalizeFilePath(filePath);
    const userId = this.userId();
    try {
      const card = parseCard(content);
      const userTz = await this.deps.loadUserTz?.(userId);
      const tz = resolveTz(card.tz, userTz);
      const nextFireAt =
        card.status === "active" ? computeNextFireAt(card.schedule, tz, this.clock()) : null;
      const rows = await this.run(
        this.deps.repo.upsertQuery({
          userId,
          path,
          name: card.name,
          scheduleKind: card.schedule.kind,
          scheduleExpr: card.schedule.expr,
          tz: card.tz ?? null,
          status: card.status,
          nextFireAt,
          prompt: card.prompt,
        }),
      );
      if (rows.length === 0) {
        return { error: `Failed to persist cron card '${path}'.` };
      }
      return { path, filesUpdate: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<EditResult> {
    const existing = await this.read(filePath);
    if (existing.error || typeof existing.content !== "string") {
      return { error: existing.error ?? `File '${filePath}' not found` };
    }
    const occurrences = existing.content.split(oldString).length - 1;
    if (occurrences === 0) {
      return { error: `Error: String not found in file: '${oldString}'` };
    }
    if (occurrences > 1 && !replaceAll) {
      return { error: `Error: String '${oldString}' has multiple occurrences in file.` };
    }
    const edited = replaceAll
      ? existing.content.split(oldString).join(newString)
      : existing.content.replace(oldString, newString);
    const result = await this.write(filePath, edited);
    if (result.error) {
      return { error: result.error };
    }
    return { path: normalizeFilePath(filePath), filesUpdate: null, occurrences };
  }

  async grep(pattern: string): Promise<GrepResult> {
    const jobs = await this.deps.repo.listByUser(this.userId());
    const matches = [];
    for (const job of jobs) {
      const lines = renderCard(job).split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (line.includes(pattern)) {
          matches.push({ path: job.path, line: index + 1, text: line });
        }
      }
    }
    return { matches };
  }

  async glob(pattern: string): Promise<GlobResult> {
    const jobs = await this.deps.repo.listByUser(this.userId());
    if (pattern === "*" || pattern === "*.md" || pattern === "**/*.md") {
      return { files: jobs.map((job) => ({ path: job.path, is_dir: false })) };
    }
    return {
      files: jobs
        .filter((job) => job.path.includes(pattern))
        .map((job) => ({ path: job.path, is_dir: false })),
    };
  }

  private async load(filePath: string): Promise<CronJob | null> {
    return this.deps.repo.loadByPath(this.userId(), normalizeFilePath(filePath));
  }

  private userId(): string {
    if (this.deps.getUserId) {
      return this.deps.getUserId();
    }
    const userId = getConfig().configurable?.user_id;
    if (typeof userId === "string" && userId.length > 0) {
      return userId;
    }
    throw new Error("Cron backend requires configurable.user_id.");
  }

  private run<Row>(query: Promise<Row[]>): Promise<Row[]> {
    return this.deps.runQuery ? this.deps.runQuery(query) : query;
  }
}

function normalizeFilePath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!normalized.endsWith(".md") || normalized.includes("..")) {
    throw new Error("Cron card path must be /<name>.md.");
  }
  return normalized;
}

function normalizeDir(path: string): string {
  if (!path || path === ".") {
    return "/";
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}
