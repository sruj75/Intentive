/**
 * Reference pack and topic-card configuration for generate-reference-llms.mjs
 */

export const REPOMIX_IGNORE =
  "**/*.test.ts,**/*.test.tsx,**/*.test.py,**/__tests__/**,**/test/**,**/tests/**,**/*.snap,**/ui/**,**/website/i18n/**,**/patches/**,**/changelog/**,**/.agents/**";

export const REPOMIX_ARGS = [
  "--style",
  "plain",
  "--compress",
  "--parsable-style",
  "--no-directory-structure",
  "--ignore",
  REPOMIX_IGNORE,
];

/** @type {Array<{ id: string; repo: "openclaw" | "hermes"; source: string; include: string[]; note: string }>} */
export const TOPICS = [
  {
    id: "architecture",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "README.md",
      "VISION.md",
      "docs/start/openclaw.md",
      "docs/start/getting-started.md",
      "docs/start/hubs.md",
    ],
    note: "Product shape: always-on agent OS vs harness.",
  },
  {
    id: "architecture",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "README.md",
      "website/docs/index.md",
      "website/docs/guides/migrate-from-openclaw.md",
      "hermes-already-has-routines.md",
    ],
    note: "Hermes positioning and OpenClaw migration notes.",
  },
  {
    id: "gateway",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: ["src/gateway/**", "docs/gateway/**", "src/cli/gateway-cli/**"],
    note: "Control plane: WS server, auth, config, HTTP APIs.",
  },
  {
    id: "gateway",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "gateway/**",
      "tui_gateway/**",
      "website/docs/user-guide/features/tool-gateway.md",
      "website/docs/user-guide/features/api-server.md",
    ],
    note: "Hermes gateway runtime and tool-gateway docs.",
  },
  {
    id: "channels",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/channels/**",
      "docs/channels/**",
      "extensions/**/src/**/channel*",
    ],
    note: "Channel adapters, routing, allowlists.",
  },
  {
    id: "channels",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "gateway/platforms/**",
      "gateway/channel_directory.py",
      "gateway/delivery.py",
      "website/docs/user-guide/messaging/index.md",
    ],
    note: "Messaging platforms and delivery.",
  },
  {
    id: "sessions",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/sessions/**",
      "src/routing/session-key.ts",
      "docs/reference/session-management-compaction.md",
    ],
    note: "Session keys, compaction, multi-chat isolation.",
  },
  {
    id: "sessions",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "gateway/session.py",
      "gateway/session_context.py",
      "website/docs/user-guide/sessions.md",
    ],
    note: "Gateway session model.",
  },
  {
    id: "cron",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/cron/**",
      "docs/automation/cron*.md",
      "docs/automation/tasks.md",
    ],
    note: "Scheduled jobs and task ledger interaction.",
  },
  {
    id: "cron",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: ["cron/**", "website/docs/user-guide/features/cron.md"],
    note: "Cron scheduler implementation.",
  },
  {
    id: "heartbeat",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/infra/heartbeat-*.ts",
      "docs/gateway/heartbeat.md",
      "docs/reference/templates/HEARTBEAT.md",
      "docs/automation/tasks.md",
    ],
    note: "Periodic wake loop and HEARTBEAT_OK semantics.",
  },
  {
    id: "heartbeat",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: ["gateway/run.py", "gateway/runtime_footer.py"],
    note: "Hermes gateway run loop (heartbeat overlap).",
  },
  {
    id: "workspace",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "docs/reference/templates/**",
      "docs/concepts/soul.md",
      "docs/tools/skills.md",
      "docs/tools/skills-config.md",
      "skills/README.md",
      "AGENTS.md",
    ],
    note: "SOUL/AGENTS/SKILL/MEMORY workspace conventions.",
  },
  {
    id: "workspace",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "agent/skill_*.py",
      "skills/README.md",
      "website/docs/user-guide/features/skills.md",
      "website/docs/user-guide/features/context-files.md",
      "website/docs/user-guide/features/personality.md",
      "AGENTS.md",
    ],
    note: "Skills layout and context/personality docs.",
  },
  {
    id: "memory",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/memory/**",
      "packages/memory-host-sdk/**",
      "docs/reference/memory-config.md",
    ],
    note: "Long-term memory (DeepAgents parity reference).",
  },
  {
    id: "memory",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "agent/memory_manager.py",
      "agent/memory_provider.py",
      "website/docs/user-guide/features/memory.md",
    ],
    note: "Hermes memory providers.",
  },
  {
    id: "tools",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: ["src/tools/**", "docs/tools/index.md", "docs/tools/exec.md"],
    note: "Tool surface (DeepAgents parity reference).",
  },
  {
    id: "tools",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "toolsets.py",
      "model_tools.py",
      "website/docs/user-guide/features/tools.md",
    ],
    note: "Hermes toolsets and tool dispatch.",
  },
  {
    id: "subagents",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "docs/tools/subagents.md",
      "docs/tools/multi-agent-sandbox-tools.md",
    ],
    note: "Subagent patterns (DeepAgents parity reference).",
  },
  {
    id: "subagents",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "website/docs/user-guide/features/delegation.md",
      "website/docs/user-guide/features/kanban.md",
    ],
    note: "Delegation and multi-agent kanban.",
  },
  {
    id: "routing",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: ["src/routing/**", "docs/channels/channel-routing.md"],
    note: "Multi-tenant / session routing.",
  },
  {
    id: "routing",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: ["gateway/slash_access.py"],
    note: "Access and routing helpers.",
  },
  {
    id: "hooks",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/hooks/**",
      "src/plugins/hooks.ts",
      "src/plugins/host-hooks.ts",
      "src/plugins/hook-types.ts",
    ],
    note: "Event hooks and plugin host hooks.",
  },
  {
    id: "hooks",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: [
      "gateway/hooks.py",
      "gateway/builtin_hooks/**",
      "website/docs/user-guide/features/hooks.md",
    ],
    note: "Gateway and agent hooks.",
  },
  {
    id: "agent-runtime",
    repo: "openclaw",
    source: "https://github.com/openclaw/openclaw",
    include: [
      "src/auto-reply/**",
      "src/context-engine/**",
      "docs/tools/thinking.md",
    ],
    note: "Inner loop (DeepAgents parity reference).",
  },
  {
    id: "agent-runtime",
    repo: "hermes",
    source: "https://github.com/nousresearch/hermes-agent",
    include: ["run_agent.py", "hermes_cli/**"],
    note: "Hermes entrypoints (DeepAgents parity reference).",
  },
];

/**
 * Curated SECTION aliases per pack topic id.
 * Key = alias id (used in topic cards as SECTION:alias).
 * Value = path substring or exact path matched against Repomix `File:` lines.
 */
export const SECTION_ALIASES = {
  architecture: {
    "architecture:vision": "VISION.md",
    "architecture:openclaw-start": "docs/start/openclaw.md",
    "architecture:migrate": "migrate-from-openclaw.md",
    "architecture:hermes-index": "website/docs/index.md",
  },
  gateway: {
    "gateway:protocol": "docs/gateway/protocol.md",
    "gateway:authentication": "docs/gateway/authentication.md",
    "gateway:index": "docs/gateway/index.md",
    "gateway:configuration": "docs/gateway/configuration.md",
    "gateway:session-py": "gateway/session.py",
    "gateway:run-py": "gateway/run.py",
    "gateway:tool-gateway-doc": "tool-gateway.md",
  },
  channels: {
    "channels:routing-doc": "docs/channels/channel-routing.md",
    "channels:index-doc": "docs/channels/index.md",
    "channels:delivery-py": "gateway/delivery.py",
    "channels:messaging-index": "messaging/index.md",
  },
  sessions: {
    "sessions:compaction-doc":
      "docs/reference/session-management-compaction.md",
    "sessions:session-key-ts": "src/routing/session-key.ts",
    "sessions:session-py": "gateway/session.py",
    "sessions:session-context-py": "gateway/session_context.py",
    "sessions:user-guide": "user-guide/sessions.md",
  },
  cron: {
    "cron:tasks-doc": "docs/automation/tasks.md",
    "cron:scheduler-py": "cron/scheduler.py",
    "cron:jobs-py": "cron/jobs.py",
    "cron:feature-doc": "features/cron.md",
  },
  heartbeat: {
    "heartbeat:doc": "docs/gateway/heartbeat.md",
    "heartbeat:template": "docs/reference/templates/HEARTBEAT.md",
    "heartbeat:runner-ts": "src/infra/heartbeat-runner.ts",
    "heartbeat:run-py": "gateway/run.py",
  },
  workspace: {
    "workspace:soul": "docs/concepts/soul.md",
    "workspace:agents-template": "docs/reference/templates/AGENTS.md",
    "workspace:soul-template": "docs/reference/templates/SOUL.md",
    "workspace:skills-doc": "docs/tools/skills.md",
    "workspace:personality-doc": "features/personality.md",
    "workspace:context-files-doc": "features/context-files.md",
  },
  memory: {
    "memory:config-doc": "docs/reference/memory-config.md",
    "memory:manager-py": "agent/memory_manager.py",
    "memory:feature-doc": "features/memory.md",
  },
  tools: {
    "tools:index-doc": "docs/tools/index.md",
    "tools:exec-doc": "docs/tools/exec.md",
    "tools:toolsets-py": "toolsets.py",
    "tools:feature-doc": "features/tools.md",
  },
  subagents: {
    "subagents:doc": "docs/tools/subagents.md",
    "subagents:delegation-doc": "features/delegation.md",
    "subagents:kanban-doc": "features/kanban.md",
  },
  routing: {
    "routing:channel-routing": "docs/channels/channel-routing.md",
    "routing:slash-access": "gateway/slash_access.py",
  },
  hooks: {
    "hooks:hook-types-ts": "src/plugins/hook-types.ts",
    "hooks:hooks-py": "gateway/hooks.py",
    "hooks:feature-doc": "features/hooks.md",
  },
  "agent-runtime": {
    "agent-runtime:thinking-doc": "docs/tools/thinking.md",
    "agent-runtime:run-agent-py": "run_agent.py",
  },
};

/** @type {Array<{ id: string; role: "shell" | "parity"; loadWhen: string }>} */
export const TOPIC_CARDS = [
  {
    id: "architecture",
    role: "shell",
    loadWhen: "Understanding brain vs shell before any implementation",
  },
  { id: "gateway", role: "shell", loadWhen: "WS control plane, auth, protocol" },
  { id: "channels", role: "shell", loadWhen: "Channel adapters and delivery" },
  { id: "sessions", role: "shell", loadWhen: "Session keys, store, compaction" },
  { id: "cron", role: "shell", loadWhen: "Scheduler and task ledger" },
  { id: "heartbeat", role: "shell", loadWhen: "Periodic wake and HEARTBEAT_OK" },
  { id: "workspace", role: "shell", loadWhen: "SOUL, AGENTS, SKILL layout" },
  { id: "routing", role: "shell", loadWhen: "Multi-tenant routing and allowlists" },
  { id: "hooks", role: "shell", loadWhen: "Hooks and event bus patterns" },
  {
    id: "memory",
    role: "parity",
    loadWhen: "Parity only — use DeepAgents for LTM implementation",
  },
  {
    id: "tools",
    role: "parity",
    loadWhen: "Parity only — use DeepAgents for tool loop",
  },
  {
    id: "subagents",
    role: "parity",
    loadWhen: "Parity only — use DeepAgents for subagents",
  },
  {
    id: "agent-runtime",
    role: "parity",
    loadWhen: "Parity only — do not port Python/Hermes inner loop",
  },
];
