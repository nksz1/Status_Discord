import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, db, saveDb } from './db';
import { fetchBotStatuses } from './uptime';
import type {
  BotEndpoint,
  BotSnapshot,
  PublicBotSnapshot,
  PublicFeatureStatus,
  PublicImpact,
  PublicIncident,
} from '../src/types';

dotenv.config({ path: ['.env.local', '.env'] });

interface PublicFeatureConfig {
  id: string;
  label: string;
}

interface BotConfigInput extends BotEndpoint {
  url: string;
  tokenEnv?: string;
  features: PublicFeatureConfig[];
  latencySlowMs?: number;
}

interface BotConfig extends BotConfigInput {
  token: string;
}

interface BotConfigFile {
  defaults?: {
    latencySlowMs?: number;
    slowGraceMs?: number;
    interruptionGraceMs?: number;
    recoveringWindowMs?: number;
  };
  bots?: BotConfigInput[];
}

interface PublicState {
  currentImpact?: PublicImpact;
  unhealthySince?: string | null;
  slowSince?: string | null;
  recoveringUntil?: string | null;
  activeIncidentId?: string | null;
  lastHealthyAt?: string | null;
  lastSeenAt?: string | null;
}

const CONFIG_FILE = path.join(process.cwd(), 'bots.config.json');
const POLL_INTERVAL_MS = 3 * 1000;
const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_SAVE_INTERVAL_MS = 2 * 60 * 1000;
const PUBLIC_INCIDENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LATENCY_SLOW_MS = 800;
const DEFAULT_SLOW_GRACE_MS = 9 * 1000;
const DEFAULT_INTERRUPTION_GRACE_MS = 30 * 1000;
const DEFAULT_RECOVERING_WINDOW_MS = 15 * 60 * 1000;
const PUBLIC_STATUS_CACHE_TTL_MS = 5 * 1000;
const PUBLIC_STATUS_RATE_LIMIT_WINDOW_MS = readPositiveIntEnv('PUBLIC_STATUS_RATE_LIMIT_WINDOW_MS', 60 * 1000);
const PUBLIC_STATUS_RATE_LIMIT_MAX = readPositiveIntEnv('PUBLIC_STATUS_RATE_LIMIT_MAX', 60);

const configFile = readBotConfigFile();
const publicDefaults = {
  latencySlowMs: configFile?.defaults?.latencySlowMs ?? DEFAULT_LATENCY_SLOW_MS,
  slowGraceMs: configFile?.defaults?.slowGraceMs ?? DEFAULT_SLOW_GRACE_MS,
  interruptionGraceMs: configFile?.defaults?.interruptionGraceMs ?? DEFAULT_INTERRUPTION_GRACE_MS,
  recoveringWindowMs: configFile?.defaults?.recoveringWindowMs ?? DEFAULT_RECOVERING_WINDOW_MS,
};
const botConfigs = readConfiguredBots(configFile);
const botEndpoints = botConfigs.map(({ id, label, url, token }) => ({ id, label, url, token }));
const botConfigById = new Map(botConfigs.map((bot) => [bot.id, bot]));

const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

const publicCorsOrigin = process.env.PUBLIC_CORS_ORIGIN?.trim();
const trustProxyHops = readPositiveIntEnv('TRUST_PROXY_HOPS', 0, true);
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
if (publicCorsOrigin) {
  app.use(cors({ origin: publicCorsOrigin, methods: ['GET'], allowedHeaders: ['Accept'] }));
}

let lastHistorySave = 0;
let publicStatusCache: { expiresAt: number; payload: PublicStatusPayload } | null = null;
const publicStatusRateLimits = new Map<string, { count: number; resetAt: number }>();

interface PublicStatusPayload {
  bots: PublicBotSnapshot[];
  history: Record<string, any[]>;
  features: PublicFeatureStatus[];
  incidents: PublicIncident[];
}

function readBotConfigFile(): BotConfigFile | null {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as BotConfigFile;
  } catch {
    return null;
  }
}

function readConfiguredBots(config: BotConfigFile | null): BotConfig[] {
  const fromFile = (config?.bots || [])
    .filter((bot) => bot?.url && bot?.label)
    .map((bot) => ({
      id: normalizeId(bot.id || bot.label),
      label: bot.label,
      url: bot.url,
      tokenEnv: bot.tokenEnv,
      token: resolveUptimeToken(bot.tokenEnv || 'UPTIME_API_TOKEN'),
      features: Array.isArray(bot.features) && bot.features.length
        ? bot.features.map((feature) => ({
            id: normalizeId(feature.id || feature.label),
            label: feature.label,
          }))
        : [{ id: 'bot-commands', label: 'Các lệnh của bot' }],
      latencySlowMs: bot.latencySlowMs,
    }));

  if (fromFile.length) return fromFile;

  const value = process.env.BOT_ENDPOINTS;
  if (!value) return [];

  return value
    .split(',')
    .map((item, index) => {
      const trimmed = item.trim();
      if (!trimmed) return null;
      const [labelPart, urlPart] = trimmed.includes('|') ? trimmed.split('|') : [`Bot ${index + 1}`, trimmed];
      const label = labelPart.trim() || `Bot ${index + 1}`;
      const url = (urlPart || '').trim();
      if (!url) return null;

      return {
        id: normalizeId(label),
        label,
        url,
        token: resolveUptimeToken('UPTIME_API_TOKEN'),
        features: [{ id: 'bot-commands', label: 'Các lệnh của bot' }],
      };
    })
    .filter((item): item is BotConfig => Boolean(item));
}

function normalizeId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'bot';
}

function resolveUptimeToken(envName: string) {
  const token = process.env[envName]?.trim();
  if (!token || token.length < 32) {
    throw new Error(`${envName} must contain an uptime API token of at least 32 characters`);
  }
  return token;
}

function readPositiveIntEnv(name: string, fallback: number, allowZero = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  const minimum = allowZero ? 0 : 1;
  return Number.isInteger(value) && value >= minimum ? value : fallback;
}

async function pollBots() {
  console.log(`[${new Date().toISOString()}] Polling bots...`);
  try {
    const snapshots = await fetchBotStatuses(botEndpoints);
    const checkedAt = new Date().toISOString();
    const now = Date.now();
    const shouldSaveHistory = now - lastHistorySave >= HISTORY_SAVE_INTERVAL_MS;
    if (shouldSaveHistory) lastHistorySave = now;

    for (const snapshot of snapshots) {
      const config = botConfigById.get(snapshot.endpoint.id) || fallbackBotConfig(snapshot.endpoint);
      const decorated = decoratePublicSnapshot(snapshot, config, checkedAt, now);

      db.latest_snapshots[decorated.endpoint.id] = {
        snapshot_json: JSON.stringify(decorated),
        updated_at: checkedAt,
      };

      if (shouldSaveHistory) {
        db.history_logs.push({
          bot_id: decorated.endpoint.id,
          at: checkedAt,
          status: decorated.status,
          liveData: decorated.liveData ? 1 : 0,
          latencyMs: decorated.latencyMs,
          publicImpact: decorated.publicImpact,
        });
      }
    }

    if (shouldSaveHistory) {
      const historyCutoff = new Date(Date.now() - HISTORY_RETENTION_MS).toISOString();
      db.history_logs = db.history_logs.filter((log) => log.at >= historyCutoff);
      cleanupPublicIncidents();
    }

    await saveDb();
  } catch (error) {
    console.error('Error polling bots:', error);
  }
}

function fallbackBotConfig(endpoint: BotEndpoint): BotConfig {
  return {
    ...endpoint,
    features: [{ id: 'bot-commands', label: 'Các lệnh của bot' }],
  };
}

function decoratePublicSnapshot(
  snapshot: BotSnapshot,
  config: BotConfig,
  checkedAt: string,
  now: number,
): BotSnapshot {
  const state = getPublicState(snapshot.endpoint.id);
  const previousImpact = state.currentImpact;
  const impact = calculateImpact(snapshot, config, state, checkedAt, now);
  const botName = getDisplayName(snapshot, config);
  const publicMessage = buildPublicMessage(impact, botName, snapshot);
  const publicFeatures = buildFeatureStatuses(config, botName, impact, publicMessage, checkedAt);

  state.currentImpact = impact;
  state.lastSeenAt = checkedAt;
  if (impact === 'normal' || impact === 'recovering') state.lastHealthyAt = checkedAt;
  db.public_state[snapshot.endpoint.id] = state;

  updatePublicIncident(snapshot, botName, impact, previousImpact, state, checkedAt);

  return {
    ...snapshot,
    publicImpact: impact,
    publicMessage,
    publicFeatures,
  };
}

function getPublicState(botId: string): PublicState {
  const state = db.public_state[botId] || {};
  db.public_state[botId] = state;
  return state;
}

function calculateImpact(
  snapshot: BotSnapshot,
  config: BotConfig,
  state: PublicState,
  checkedAt: string,
  now: number,
): PublicImpact {
  const latencySlowMs = config.latencySlowMs ?? publicDefaults.latencySlowMs;
  const isInterruptedSignal = snapshot.liveData && (snapshot.status === 'offline' || snapshot.status === 'error');
  const isCheckingSignal = !snapshot.liveData || snapshot.status === 'connecting';
  const isSlowSignal =
    snapshot.liveData &&
    snapshot.status === 'online' &&
    typeof snapshot.latencyMs === 'number' &&
    snapshot.latencyMs >= latencySlowMs;

  if (isInterruptedSignal || isCheckingSignal) {
    if (!state.unhealthySince) state.unhealthySince = checkedAt;
    state.slowSince = null;
    state.recoveringUntil = null;
    const unhealthyFor = now - Date.parse(state.unhealthySince);
    return unhealthyFor >= publicDefaults.interruptionGraceMs ? 'interrupted' : 'checking';
  }

  if (isSlowSignal) {
    if (!state.slowSince) state.slowSince = checkedAt;
    state.unhealthySince = null;
    const slowFor = now - Date.parse(state.slowSince);
    return slowFor >= publicDefaults.slowGraceMs ? 'slow' : 'normal';
  }

  state.unhealthySince = null;
  state.slowSince = null;

  if ((state.currentImpact === 'interrupted' || state.currentImpact === 'slow') && !state.recoveringUntil) {
    state.recoveringUntil = new Date(now + publicDefaults.recoveringWindowMs).toISOString();
  }

  if (state.recoveringUntil && Date.parse(state.recoveringUntil) > now) {
    return 'recovering';
  }

  state.recoveringUntil = null;
  return 'normal';
}

function buildPublicMessage(impact: PublicImpact, botName: string, snapshot: BotSnapshot) {
  if (impact === 'normal') return `${botName} đang hoạt động ổn định.`;
  if (impact === 'slow') return `${botName} vẫn hoạt động nhưng có thể phản hồi chậm.`;
  if (impact === 'interrupted') return `${botName} đang gián đoạn, một số lệnh có thể chưa dùng được.`;
  if (impact === 'recovering') return `${botName} đã hoạt động trở lại, chúng tôi đang tiếp tục theo dõi.`;
  if (!snapshot.liveData) return 'Không thể cập nhật trạng thái lúc này. Dữ liệu sẽ tự làm mới sau ít phút.';
  return `${botName} đang được kiểm tra trạng thái.`;
}

function buildFeatureStatuses(
  config: BotConfig,
  botName: string,
  impact: PublicImpact,
  publicMessage: string,
  updatedAt: string,
): PublicFeatureStatus[] {
  return config.features.map((feature) => ({
    id: `${config.id}:${feature.id}`,
    botId: config.id,
    botName,
    label: feature.label,
    impact,
    message: buildFeatureMessage(feature.label, impact, publicMessage),
    updatedAt,
  }));
}

function buildFeatureMessage(label: string, impact: PublicImpact, publicMessage: string) {
  if (impact === 'normal') return `${label} sẵn sàng cho member.`;
  if (impact === 'slow') return `${label} có thể phản hồi chậm.`;
  if (impact === 'interrupted') return `${label} đang bị ảnh hưởng.`;
  if (impact === 'recovering') return `${label} đã ổn định lại, đang được theo dõi.`;
  return publicMessage;
}

function updatePublicIncident(
  snapshot: BotSnapshot,
  botName: string,
  impact: PublicImpact,
  previousImpact: PublicImpact | undefined,
  state: PublicState,
  checkedAt: string,
) {
  if (impact === 'interrupted' || impact === 'slow') {
    const id = state.activeIncidentId || `${snapshot.endpoint.id}-${impact}-${Date.now()}`;
    state.activeIncidentId = id;
    const startedAt =
      (impact === 'interrupted' ? state.unhealthySince : state.slowSince) ||
      db.public_incidents[id]?.startedAt ||
      checkedAt;

    db.public_incidents[id] = {
      id,
      botId: snapshot.endpoint.id,
      botName,
      impact,
      status: 'active',
      title: impact === 'slow' ? `${botName} phản hồi chậm` : `${botName} đang gián đoạn`,
      description:
        impact === 'slow'
          ? 'Một số thao tác có thể mất nhiều thời gian hơn bình thường.'
          : 'Một số chức năng của bot có thể chưa dùng được trong lúc này.',
      startedAt,
      updatedAt: checkedAt,
      resolvedAt: null,
    } satisfies PublicIncident;
    return;
  }

  if (impact === 'recovering' && state.activeIncidentId) {
    const incident = db.public_incidents[state.activeIncidentId];
    if (incident) {
      incident.status = 'monitoring';
      incident.impact = 'recovering';
      incident.title = `${botName} đã hoạt động ổn định trở lại`;
      incident.description = 'Bot đã phản hồi trở lại. Chúng tôi tiếp tục theo dõi thêm một thời gian.';
      incident.updatedAt = checkedAt;
      incident.resolvedAt = incident.resolvedAt || checkedAt;
    }
    return;
  }

  if (impact === 'normal' && state.activeIncidentId) {
    const incident = db.public_incidents[state.activeIncidentId];
    if (incident) {
      incident.status = 'resolved';
      incident.impact = 'normal';
      incident.title = `${botName} đã ổn định`;
      incident.description = 'Không còn ghi nhận ảnh hưởng tới member.';
      incident.updatedAt = checkedAt;
      incident.resolvedAt = incident.resolvedAt || checkedAt;
    }
    state.activeIncidentId = null;
    return;
  }

  if (previousImpact && previousImpact !== impact) {
    state.activeIncidentId = state.activeIncidentId || null;
  }
}

function cleanupPublicIncidents() {
  const cutoff = Date.now() - PUBLIC_INCIDENT_RETENTION_MS;
  for (const [id, incident] of Object.entries(db.public_incidents)) {
    const updatedAt = Date.parse(incident.updatedAt || incident.startedAt || '');
    if (Number.isFinite(updatedAt) && updatedAt < cutoff) {
      delete db.public_incidents[id];
    }
  }
}

function getDisplayName(snapshot: BotSnapshot, config: BotConfig) {
  return snapshot.serviceName || config.label || snapshot.bot.name || snapshot.endpoint.label;
}

let warnedUntrustedProxy = false;
function checkUntrustedProxyWarning(req: Request) {
  if (!warnedUntrustedProxy && trustProxyHops === 0 && req.headers['x-forwarded-for']) {
    warnedUntrustedProxy = true;
    console.warn(
      '[SECURITY WARNING] Detected X-Forwarded-For header while TRUST_PROXY_HOPS is 0. ' +
      'If this service is deployed behind a reverse proxy (Cloudflare/Nginx), set TRUST_PROXY_HOPS=1 ' +
      'so client IPs are distinguished properly, avoiding global 429 rate-limiting.'
    );
  }
}

function enforcePublicStatusRateLimit(req: Request, res: Response, next: NextFunction) {
  checkUntrustedProxyWarning(req);
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  let bucket = publicStatusRateLimits.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + PUBLIC_STATUS_RATE_LIMIT_WINDOW_MS };
    publicStatusRateLimits.set(key, bucket);
  }

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.setHeader('X-RateLimit-Limit', String(PUBLIC_STATUS_RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count >= PUBLIC_STATUS_RATE_LIMIT_MAX) {
    res.setHeader('X-RateLimit-Remaining', '0');
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'Too Many Requests' });
    return;
  }

  bucket.count += 1;
  res.setHeader('X-RateLimit-Remaining', String(PUBLIC_STATUS_RATE_LIMIT_MAX - bucket.count));
  next();
}

function toPublicBotSnapshot(snapshot: BotSnapshot): PublicBotSnapshot {
  return {
    endpoint: {
      id: snapshot.endpoint.id,
      label: snapshot.endpoint.label,
    },
    liveData: snapshot.liveData,
    serviceName: snapshot.serviceName,
    status: snapshot.status,
    checkedAt: snapshot.checkedAt,
    uptimeSeconds: snapshot.uptimeSeconds,
    latencyMs: snapshot.latencyMs,
    bot: {
      name: snapshot.bot.name,
      avatarUrl: snapshot.bot.avatarUrl,
    },
    publicImpact: snapshot.publicImpact,
    publicMessage: snapshot.publicMessage,
    publicFeatures: snapshot.publicFeatures,
  };
}

function getPublicStatusPayload(): PublicStatusPayload {
  const now = Date.now();
  if (publicStatusCache && publicStatusCache.expiresAt > now) return publicStatusCache.payload;

  const configuredIds = botConfigs.map((bot) => bot.id);
  const internalBots = configuredIds
    .map((id) => db.latest_snapshots[id]?.snapshot_json)
    .filter(Boolean)
    .map((snapshot) => JSON.parse(snapshot) as BotSnapshot);
  const bots = internalBots.map(toPublicBotSnapshot);

  const history: Record<string, any[]> = {};
  for (const row of db.history_logs) {
    if (!configuredIds.includes(row.bot_id)) continue;
    if (!history[row.bot_id]) history[row.bot_id] = [];
    history[row.bot_id].push({
      at: row.at,
      status: row.status,
      liveData: Boolean(row.liveData),
      latencyMs: row.latencyMs,
      publicImpact: row.publicImpact,
    });
  }

  const features = bots.flatMap((bot) => bot.publicFeatures || []);
  const incidents = Object.values(db.public_incidents)
    .filter((incident: any) => configuredIds.includes(incident.botId))
    .sort((a: any, b: any) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)) as PublicIncident[];
  const payload = { bots, history, features, incidents };

  publicStatusCache = { expiresAt: now + PUBLIC_STATUS_CACHE_TTL_MS, payload };
  return payload;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of publicStatusRateLimits) {
    if (bucket.resetAt <= now) publicStatusRateLimits.delete(key);
  }
}, PUBLIC_STATUS_RATE_LIMIT_WINDOW_MS).unref();

app.get('/api/status', enforcePublicStatusRateLimit, (req, res) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=5, stale-while-revalidate=15');
    res.json(getPublicStatusPayload());
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint Not Found', status: 404 });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, '../dist');

app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    next();
  }
});

function scheduleNextPoll() {
  setTimeout(async () => {
    await pollBots();
    scheduleNextPoll();
  }, POLL_INTERVAL_MS);
}

async function startServer() {
  await initDb();
  console.log('Database initialized.');

  await pollBots();
  scheduleNextPoll();

  const rawPort = process.env.SERVER_PORT || process.env.PORT || '25133';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid SERVER_PORT/PORT: ${rawPort}`);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Backend API server running on port ${port} (0.0.0.0)`);
  });
}

startServer();
