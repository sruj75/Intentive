export interface AgentInstance {
  readonly id: string;
  readonly userId: string;
  readonly clientTz?: string | null;
}
