export type BotStatus = "online" | "offline" | "connecting" | "error";
export type PublicImpact = "normal" | "slow" | "interrupted" | "checking" | "recovering";
export type PublicIncidentStatus = "active" | "monitoring" | "resolved";

export interface StatusSample {
  at: string;
  status: BotStatus;
  liveData: boolean;
  latencyMs: number | null;
  publicImpact?: PublicImpact;
}

export type EventTone = "success" | "warning" | "danger" | "info";

export interface BotEndpoint {
  id: string;
  label: string;
}

export interface BotIdentity {
  name: string;
  tag: string | null;
  id: string | null;
  avatarUrl: string | null;
}

export interface BotSignal {
  at: string;
  source?: string;
  shardId?: number | string | null;
  code?: number | string | null;
  message: string;
}

export interface BotEvent {
  id: string;
  type: string;
  tone: EventTone;
  message: string;
  at: string;
}

export interface PublicFeatureStatus {
  id: string;
  botId: string;
  botName: string;
  label: string;
  impact: PublicImpact;
  message: string;
  updatedAt: string;
}

export interface PublicIncident {
  id: string;
  botId: string;
  botName: string;
  impact: PublicImpact;
  status: PublicIncidentStatus;
  title: string;
  description: string;
  startedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface BotSnapshot {
  endpoint: BotEndpoint;
  liveData: boolean;
  serviceName: string;
  status: BotStatus;
  checkedAt: string;
  bootedAt: string | null;
  uptimeSeconds: number;
  processUptimeSeconds: number | null;
  latencyMs: number | null;
  guildCount: number | null;
  bot: BotIdentity;
  host: string | null;
  port: number | null;
  lastReadyAt: string | null;
  lastError: BotSignal | null;
  lastReconnect: BotSignal | null;
  lastDisconnect: BotSignal | null;
  events: BotEvent[];
  responseTimeMs: number | null;
  publicImpact?: PublicImpact;
  publicMessage?: string;
  publicFeatures?: PublicFeatureStatus[];
  errorMessage?: string;
}

export interface PublicBotSnapshot {
  endpoint: BotEndpoint;
  liveData: boolean;
  serviceName: string;
  status: BotStatus;
  checkedAt: string;
  uptimeSeconds: number;
  latencyMs: number | null;
  bot: Pick<BotIdentity, "name" | "avatarUrl">;
  publicImpact?: PublicImpact;
  publicMessage?: string;
  publicFeatures?: PublicFeatureStatus[];
}
