import type { BotEndpoint, BotEvent, BotSignal, BotSnapshot, BotStatus, EventTone } from "../src/types.js";

const FETCH_TIMEOUT_MS = 6_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

interface AuthenticatedBotEndpoint extends BotEndpoint {
  url: string;
  token: string;
}

interface RawStatusPayload {
  serviceName?: unknown;
  status?: unknown;
  checkedAt?: unknown;
  bootedAt?: unknown;
  uptimeSeconds?: unknown;
  processUptimeSeconds?: unknown;
  latencyMs?: unknown;
  guildCount?: unknown;
  bot?: {
    name?: unknown;
    tag?: unknown;
    id?: unknown;
    avatarUrl?: unknown;
  };
  host?: unknown;
  port?: unknown;
  lastReadyAt?: unknown;
  lastError?: unknown;
  lastReconnect?: unknown;
  lastDisconnect?: unknown;
  events?: unknown;
}

export async function fetchBotStatuses(endpoints: AuthenticatedBotEndpoint[]) {
  return Promise.all(endpoints.map((endpoint) => fetchBotStatus(endpoint)));
}

async function fetchBotStatus(endpoint: AuthenticatedBotEndpoint): Promise<BotSnapshot> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint.url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${endpoint.token}`,
      },
      redirect: "error",
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new Error("Response too large");
    }

    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_RESPONSE_BYTES) {
      throw new Error("Response too large");
    }

    const payload = JSON.parse(raw) as RawStatusPayload;
    return normalizePayload(endpoint, payload, Math.round(performance.now() - startedAt));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return offlineSnapshot(endpoint, message);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizePayload(endpoint: AuthenticatedBotEndpoint, payload: RawStatusPayload, responseTimeMs: number): BotSnapshot {
  const checkedAt = asString(payload.checkedAt) || new Date().toISOString();
  const serviceName = asString(payload.serviceName) || endpoint.label;
  const status = normalizeStatus(payload.status);
  const botName = asString(payload.bot?.name) || serviceName;

  return {
    endpoint: publicEndpoint(endpoint),
    liveData: true,
    serviceName,
    status,
    checkedAt,
    bootedAt: asString(payload.bootedAt),
    uptimeSeconds: asNumber(payload.uptimeSeconds) ?? 0,
    processUptimeSeconds: asNumber(payload.processUptimeSeconds),
    latencyMs: asNumber(payload.latencyMs),
    guildCount: asNumber(payload.guildCount),
    bot: {
      name: botName,
      tag: asString(payload.bot?.tag),
      id: asString(payload.bot?.id),
      avatarUrl: asString(payload.bot?.avatarUrl),
    },
    host: asString(payload.host),
    port: asNumber(payload.port),
    lastReadyAt: asString(payload.lastReadyAt),
    lastError: asSignal(payload.lastError),
    lastReconnect: asSignal(payload.lastReconnect),
    lastDisconnect: asSignal(payload.lastDisconnect),
    events: asEvents(payload.events),
    responseTimeMs,
  };
}

function offlineSnapshot(endpoint: AuthenticatedBotEndpoint, message: string): BotSnapshot {
  const checkedAt = new Date().toISOString();

  return {
    endpoint: publicEndpoint(endpoint),
    liveData: false,
    serviceName: endpoint.label,
    status: "offline",
    checkedAt,
    bootedAt: null,
    uptimeSeconds: 0,
    processUptimeSeconds: null,
    latencyMs: null,
    guildCount: null,
    bot: {
      name: endpoint.label,
      tag: null,
      id: null,
      avatarUrl: null,
    },
    host: null,
    port: null,
    lastReadyAt: null,
    lastError: {
      at: checkedAt,
      source: "dashboard.fetch",
      message,
    },
    lastReconnect: null,
    lastDisconnect: null,
    events: [
      {
        id: `${endpoint.id}-offline-${Date.now()}`,
        type: "fetch",
        tone: "danger",
        message: "Không thể cập nhật trạng thái lúc này",
        at: checkedAt,
      },
    ],
    responseTimeMs: null,
    errorMessage: message,
  };
}

function publicEndpoint(endpoint: AuthenticatedBotEndpoint): BotEndpoint {
  return { id: endpoint.id, label: endpoint.label };
}

function normalizeStatus(value: unknown): BotStatus {
  if (value === "online" || value === "offline" || value === "connecting" || value === "error") return value;
  return "connecting";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asSignal(value: unknown): BotSignal | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const at = asString(record.at);
  const message = asString(record.message);
  if (!at || !message) return null;

  return {
    at,
    source: asString(record.source) || undefined,
    shardId: asString(record.shardId) || asNumber(record.shardId),
    code: asString(record.code) || asNumber(record.code),
    message,
  };
}

function asEvents(value: unknown): BotEvent[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const message = asString(record.message);
      const at = asString(record.at);
      if (!message || !at) return null;

      return {
        id: asString(record.id) || `${at}-${index}`,
        type: asString(record.type) || "event",
        tone: normalizeTone(record.tone),
        message,
        at,
      };
    })
    .filter((item): item is BotEvent => Boolean(item));
}

function normalizeTone(value: unknown): EventTone {
  if (value === "success" || value === "warning" || value === "danger" || value === "info") return value;
  return "info";
}
