import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList, type ReactNode } from "react";
import { fetchDashboardData } from "./services/uptime";
import { NotFound } from "./NotFound";
import type {
  PublicBotSnapshot,
  PublicFeatureStatus,
  PublicImpact,
  PublicIncident,
  StatusSample,
} from "./types";

const POLL_INTERVAL_MS = 30_000;
const SHOW_DEBUG = import.meta.env.VITE_SHOW_DEBUG === "true";

type PublicTone = "good" | "warn" | "bad" | "checking";
type BarState = "good" | "warn" | "bad" | "unknown";
type HistoryMap = Record<string, StatusSample[]>;

interface BarData {
  state: BarState;
  start: number;
  end: number;
  ping: number | null;
  maxPing: number | null;
  checks: number;
  uptimePercent: number | null;
  impact: PublicImpact | null;
  message: string;
  x: number;
}

const impactMeta: Record<PublicImpact, { label: string; tone: PublicTone; short: string }> = {
  normal: { label: "Hoạt động", tone: "good", short: "Sẵn sàng cho member" },
  slow: { label: "Phản hồi chậm", tone: "warn", short: "Có thể chậm hơn bình thường" },
  interrupted: { label: "Gián đoạn", tone: "bad", short: "Một số chức năng bị ảnh hưởng" },
  checking: { label: "Đang cập nhật", tone: "checking", short: "Dữ liệu sẽ tự làm mới" },
  recovering: { label: "Đang theo dõi", tone: "warn", short: "Vừa ổn định trở lại" },
};

function App() {
  const [bots, setBots] = useState<PublicBotSnapshot[]>([]);
  const [history, setHistory] = useState<HistoryMap>({});
  const [features, setFeatures] = useState<PublicFeatureStatus[]>([]);
  const [incidents, setIncidents] = useState<PublicIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [videoAvailable, setVideoAvailable] = useState(true);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const requestInFlight = useRef(false);

  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const isNotFound = currentPath !== "/" && currentPath !== "";
  const navigateHome = useCallback(() => {
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
    setCurrentPath("/");
  }, []);

  const load = useCallback(async (silent = false) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    if (!silent) setLoading(true);
    setRefreshing(true);
    setError(false);

    try {
      const data = await fetchDashboardData();
      setBots(data.bots);
      setHistory(data.history);
      setFeatures(data.features.length ? data.features : data.bots.flatMap((bot) => bot.publicFeatures || []));
      setIncidents(data.incidents);
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      console.error("Failed to load status page:", err);
      setError(true);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const summary = useMemo(() => getSummary(bots, history), [bots, history]);
  const visibleFeatures = features.length ? features : bots.flatMap((bot) => bot.publicFeatures || []);

  useRevealOnce([loading, bots.length, visibleFeatures.length, incidents.length, error ? 1 : 0]);

  return (
    <>
      <div className={`video-bg-container ${!videoAvailable ? "no-video" : ""}`}>
        {videoAvailable && (
          <video
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoAvailable(false)}
          >
            <source src="/Elaina.mp4" type="video/mp4" onError={() => setVideoAvailable(false)} />
          </video>
        )}
      </div>
      <div className="video-overlay" />

      <main className="status-page">
        <header className="site-header glass-panel reveal-once">
          <div
            className="brand"
            aria-label="Neko Studio Bot Status"
            onClick={navigateHome}
            style={{ cursor: "pointer" }}
          >
            <span className="brand-mark">NS</span>
            <div className="brand-text">
              <strong>Neko Studio</strong>
              <span>Bot Status</span>
            </div>
          </div>

          <div className="header-actions">
            {isNotFound ? (
              <button className="refresh-btn" type="button" onClick={navigateHome}>
                Về trang chủ
              </button>
            ) : (
              <>
                <span className="updated-text">
                  {lastUpdated ? `Cập nhật ${formatRelative(lastUpdated)}` : "Đang cập nhật"}
                </span>
                <button className="refresh-btn" type="button" onClick={() => void load(true)} disabled={refreshing}>
                  {refreshing ? "Đang làm mới" : "Làm mới"}
                </button>
              </>
            )}
          </div>
        </header>

        {isNotFound ? (
          <NotFound onGoHome={navigateHome} />
        ) : (
          <>
            <section className={`overview ${summary.tone} glass-panel reveal-once`}>
              <div className="overview-copy">
                <span className="eyebrow">Trạng thái hệ thống</span>
                <h1>{summary.title}</h1>
                <p>{summary.description}</p>
              </div>
              <div className="overview-stats" aria-label="Tổng quan trạng thái bot">
                <SummaryStat label="Bot hoạt động" value={`${summary.online}/${summary.total}`} />
                <SummaryStat label="Uptime 24h" value={formatPercent(summary.averageUptime24h)} />
                <SummaryStat label="Độ trễ TB" value={summary.averageLatencyMs === null ? "..." : `${summary.averageLatencyMs} ms`} />
              </div>
            </section>

            {error && (
              <section className="notice-card checking glass-panel reveal-once">
                <strong>Không thể cập nhật trạng thái lúc này</strong>
                <p>Dữ liệu sẽ tự làm mới sau ít phút. Trang vẫn giữ trạng thái gần nhất nếu có.</p>
              </section>
            )}

            {loading ? (
              <LoadingState />
            ) : (
              <>
                <section className="bot-section" aria-labelledby="bot-list-title">
                  <SectionHeader eyebrow="Dịch vụ" title="Bot Discord" meta={<BotSectionMeta count={bots.length} />} />
                  {bots.length ? (
                    <div className="bot-grid">
                      {bots.map((bot) => (
                        <BotStatusCard key={bot.endpoint.id} bot={bot} samples={history[bot.endpoint.id] || []} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="Chưa có bot để hiển thị" text="Dữ liệu trạng thái đang được khởi tạo." />
                  )}
                </section>

                <FeatureSection features={visibleFeatures} />
                <IncidentSection incidents={incidents} bots={bots} />

                {SHOW_DEBUG && <DebugPanel bots={bots} features={visibleFeatures} incidents={incidents} />}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

function SectionHeader({ eyebrow, title, meta }: { eyebrow: string; title: string; meta?: ReactNode }) {
  return (
    <div className="section-header reveal-once">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {meta && <span>{meta}</span>}
    </div>
  );
}

function BotSectionMeta({ count }: { count: number }) {
  return (
    <div className="section-meta">
      <span>{count} bot đang được theo dõi</span>
      <div className="status-color-guide" aria-label="Chú thích màu trạng thái">
        <span><i className="guide-dot good" />Xanh: ổn định</span>
        <span><i className="guide-dot warn" />Vàng: phản hồi chậm</span>
        <span><i className="guide-dot bad" />Đỏ: gián đoạn</span>
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function useRevealOnce(deps: DependencyList) {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>(".reveal-once:not(.is-visible)"));
    if (!targets.length) return undefined;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion || !("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.12,
      },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, deps);
}

function BotStatusCard({ bot, samples }: { bot: PublicBotSnapshot; samples: StatusSample[] }) {
  const displayName = getDisplayName(bot);
  const impact = getImpact(bot);
  const meta = impactMeta[impact];
  const uptime24h = calculateUptime(samples, 24, bot);
  const uptime7d = calculateUptime(samples, 24 * 7, bot);
  const uptime30d = calculateUptime(samples, 24 * 30, bot);
  const bars = buildStatusBars(samples);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const hoveredBar = hoveredBarIndex === null ? null : bars[hoveredBarIndex] || null;
  const selectedBar = selectedBarIndex === null ? null : bars[selectedBarIndex] || null;
  const activeBar = selectedBar || hoveredBar;
  const neonClass = meta.tone === "good" ? "neon-good" : meta.tone === "bad" ? "neon-bad" : "neon-warn";

  return (
    <article className={`bot-card ${meta.tone} glass-panel reveal-once`} onMouseLeave={() => setHoveredBarIndex(null)}>
      <div className="bot-card-top">
        <BotAvatar bot={bot} displayName={displayName} />
        <div className="bot-info">
          <h3>{displayName}</h3>
          <p>{bot.publicMessage || meta.short}</p>
        </div>
        <StatusBadge label={meta.label} tone={meta.tone} />
      </div>

      <div className="history-panel premium">
        <div className="history-bars" aria-label={`Lịch sử trạng thái 24 giờ của ${displayName}`}>
          {bars.map((bar, index) => (
            <button
              key={index}
              className={`status-bar-wrapper ${selectedBarIndex === index ? "selected" : ""}`}
              onMouseEnter={() => setHoveredBarIndex(index)}
              onFocus={() => setHoveredBarIndex(index)}
              onClick={() => setSelectedBarIndex((current) => (current === index ? null : index))}
              type="button"
              aria-label={`${barLabelLong(bar)} từ ${formatTime(bar.start)} đến ${formatTime(bar.end)}`}
            >
              <span className={`status-bar ${bar.state}`} style={{ animationDelay: `${0.56 + index * 0.018}s` }} />
            </button>
        ))}
        </div>
        <div className="timeline-scale" aria-hidden="true">
          <span>24h trước</span>
          <span>12h</span>
          <span>Bây giờ</span>
        </div>
        {activeBar && (
          <TimelineDetail
            bar={activeBar}
            pinned={selectedBarIndex !== null}
            onClose={() => setSelectedBarIndex(null)}
          />
        )}
      </div>

      <div className="uptime-summary-row premium">
        <span className="uptime-badge percentage">
          {uptime24h === null ? "Đang thu thập" : `Uptime 24h: ${formatPercent(uptime24h)}`}
        </span>
        {bot.liveData && bot.status === "online" && bot.uptimeSeconds > 0 && (
          <span className="uptime-badge duration">Duy trì: {formatDuration(bot.uptimeSeconds)}</span>
        )}
      </div>

      <div className="member-impact">
        <span>Ảnh hưởng member</span>
        <div className="feature-chips">
          {(bot.publicFeatures || []).slice(0, 3).map((feature) => (
            <span key={feature.id} className={`feature-chip ${impactMeta[feature.impact].tone}`}>
              {feature.label}
            </span>
          ))}
          {(!bot.publicFeatures || bot.publicFeatures.length === 0) && (
            <span className={`feature-chip ${meta.tone}`}>{meta.short}</span>
          )}
        </div>
      </div>

      <PingSparkline samples={samples} neonClass={neonClass} />

      <div className="bot-metrics">
        <Metric label="24h" value={formatPercent(uptime24h)} />
        <Metric label="7 ngày" value={formatPercent(uptime7d)} />
        <Metric label="30 ngày" value={formatPercent(uptime30d)} />
        <Metric label="Độ trễ" value={bot.liveData && bot.latencyMs !== null ? `${bot.latencyMs} ms` : "..."} />
      </div>

      <div className="bot-card-bottom premium">
        <div className="ping-section">
          <span className="ping-label">Ping hiện tại</span>
          <strong className={`ping-value ${neonClass}`}>
            {bot.liveData && bot.latencyMs !== null ? `${bot.latencyMs}ms` : "..."}
          </strong>
        </div>
        <span className="impact-line">{meta.short}</span>
      </div>
    </article>
  );
}

function FeatureSection({ features }: { features: PublicFeatureStatus[] }) {
  if (!features.length) return null;

  const ordered = [...features].sort((a, b) => impactWeight(a.impact) - impactWeight(b.impact));

  return (
    <section className="feature-section" aria-labelledby="feature-title">
      <SectionHeader eyebrow="Tình trạng chức năng" title="Member đang dùng được gì?" />
      <div className="feature-grid">
        {ordered.map((feature) => {
          const meta = impactMeta[feature.impact];
          return (
            <article key={feature.id} className={`feature-card ${meta.tone} glass-panel reveal-once`}>
              <div>
                <strong>{feature.label}</strong>
                <span>{feature.botName}</span>
              </div>
              <p>{feature.message}</p>
              <StatusBadge label={meta.label} tone={meta.tone} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function IncidentSection({ incidents, bots }: { incidents: PublicIncident[]; bots: PublicBotSnapshot[] }) {
  const fallback = buildFallbackIncidents(bots);
  const visible = incidents.length ? incidents.slice(0, 6) : fallback;

  return (
    <section className="incident-section" aria-labelledby="incident-title">
      <SectionHeader eyebrow="Cập nhật" title="Sự cố gần đây" />
      {visible.length ? (
        <div className="incident-list">
          {visible.map((incident) => {
            const meta = impactMeta[incident.impact] || impactMeta.checking;
            return (
              <article key={incident.id} className={`incident-card ${meta.tone} glass-panel reveal-once`}>
                <span className="incident-marker" />
                <div className="incident-content">
                  <strong>{incident.title}</strong>
                  <p>{incident.description}</p>
                  <time>{formatRelative(incident.updatedAt || incident.startedAt)}</time>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="all-clear glass-panel reveal-once">
          <strong>Hệ thống ổn định</strong>
          <p>Các bot đang phản hồi bình thường. Không có sự cố nào được ghi nhận gần đây.</p>
        </div>
      )}
    </section>
  );
}

function TimelineDetail({
  bar,
  pinned,
  onClose,
}: {
  bar: BarData;
  pinned: boolean;
  onClose: () => void;
}) {
  const left = Math.min(86, Math.max(14, bar.x));

  return (
    <div className={`timeline-detail ${bar.state} ${pinned ? "pinned" : ""}`} style={{ left: `${left}%` }}>
      <div className="timeline-detail-head">
        <div>
          <strong>{barLabelLong(bar)}</strong>
          <span>{formatTime(bar.start)} - {formatTime(bar.end)}</span>
        </div>
        {pinned && (
          <button className="timeline-close" type="button" onClick={onClose} aria-label="Đóng chi tiết timeline">
            ×
          </button>
        )}
      </div>

      <p>{bar.message}</p>

      <div className="timeline-detail-grid">
        <div>
          <span>Uptime đoạn này</span>
          <strong>{formatPercent(bar.uptimePercent)}</strong>
        </div>
        <div>
          <span>Ping TB</span>
          <strong>{bar.ping !== null ? `${bar.ping} ms` : "..."}</strong>
        </div>
        <div>
          <span>Ping cao nhất</span>
          <strong>{bar.maxPing !== null ? `${bar.maxPing} ms` : "..."}</strong>
        </div>
        <div>
          <span>Lần check</span>
          <strong>{bar.checks ? `${bar.checks}` : "..."}</strong>
        </div>
      </div>

      <div className="timeline-affected">
        {bar.impact ? impactMeta[bar.impact].short : "Đang chờ thêm dữ liệu để xác nhận trạng thái."}
      </div>
      <span className="timeline-hint">{pinned ? "Đã ghim đoạn này" : "Click vào cột để giữ chi tiết"}</span>
    </div>
  );
}

function PingSparkline({ samples, neonClass }: { samples: StatusSample[]; neonClass: string }) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const validPings = samples
    .filter((sample) => new Date(sample.at).getTime() >= cutoff && sample.latencyMs !== null)
    .map((sample) => sample.latencyMs as number);

  if (validPings.length < 2) return <div className="sparkline-container empty-sparkline" />;

  const min = Math.max(0, Math.min(...validPings) - 20);
  const max = Math.max(...validPings) + 20;
  const range = max - min || 1;
  const points = validPings
    .map((ping, index) => {
      const x = (index / (validPings.length - 1)) * 100;
      const y = 100 - ((ping - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="sparkline-container">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`sparkline-svg ${neonClass}`}>
        <defs>
          <linearGradient id={`sparkline-grad-${neonClass}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="sparkline-stop-top" />
            <stop offset="100%" className="sparkline-stop-bottom" />
          </linearGradient>
        </defs>
        <polygon points={`0,100 ${points} 100,100`} fill={`url(#sparkline-grad-${neonClass})`} />
        <polyline points={points} className="sparkline-line" />
      </svg>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: PublicTone }) {
  return (
    <span className={`status-badge ${tone}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function BotAvatar({ bot, displayName }: { bot: PublicBotSnapshot; displayName: string }) {
  return (
    <div className="bot-avatar">
      {bot.bot.avatarUrl && bot.liveData ? <img src={bot.bot.avatarUrl} alt="" /> : getInitials(displayName)}
    </div>
  );
}

function LoadingState() {
  return (
    <section className="loading-area reveal-once" aria-label="Đang cập nhật trạng thái">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="skeleton-card glass-panel" />
      ))}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state glass-panel reveal-once">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function DebugPanel({
  bots,
  features,
  incidents,
}: {
  bots: PublicBotSnapshot[];
  features: PublicFeatureStatus[];
  incidents: PublicIncident[];
}) {
  return (
    <details className="debug-panel glass-panel">
      <summary>Debug information</summary>
      <pre>{JSON.stringify({ bots, features, incidents }, null, 2)}</pre>
    </details>
  );
}

function getSummary(bots: PublicBotSnapshot[], history: HistoryMap) {
  const total = bots.length;
  const impacts = bots.map(getImpact);
  const online = bots.filter((bot) => bot.liveData && bot.status === "online").length;
  const latencyValues = bots
    .filter((bot) => bot.liveData && typeof bot.latencyMs === "number")
    .map((bot) => bot.latencyMs as number);
  const uptimeValues = bots
    .map((bot) => calculateUptime(history[bot.endpoint.id] || [], 24, bot))
    .filter((value): value is number => value !== null);

  if (!bots.length || impacts.every((impact) => impact === "checking")) {
    return {
      total,
      online,
      tone: "checking" as const,
      title: "Đang kiểm tra trạng thái bot",
      description: "Dữ liệu trạng thái đang được cập nhật. Trang sẽ tự làm mới sau ít phút.",
      averageLatencyMs: averageOrNull(latencyValues),
      averageUptime24h: averageOrNull(uptimeValues),
    };
  }

  if (impacts.includes("interrupted")) {
    return {
      total,
      online,
      tone: "bad" as const,
      title: "Một số bot đang gián đoạn",
      description: "Một số chức năng có thể chưa dùng được. Neko Studio đang theo dõi để cập nhật trạng thái.",
      averageLatencyMs: averageOrNull(latencyValues),
      averageUptime24h: averageOrNull(uptimeValues),
    };
  }

  if (impacts.includes("slow")) {
    return {
      total,
      online,
      tone: "warn" as const,
      title: "Một số chức năng có thể phản hồi chậm",
      description: "Bot vẫn hoạt động, nhưng vài thao tác có thể mất nhiều thời gian hơn bình thường.",
      averageLatencyMs: averageOrNull(latencyValues),
      averageUptime24h: averageOrNull(uptimeValues),
    };
  }

  if (impacts.includes("recovering")) {
    return {
      total,
      online,
      tone: "warn" as const,
      title: "Dịch vụ vừa ổn định trở lại",
      description: "Các bot đã phản hồi trở lại. Chúng tôi tiếp tục theo dõi thêm một thời gian.",
      averageLatencyMs: averageOrNull(latencyValues),
      averageUptime24h: averageOrNull(uptimeValues),
    };
  }

  return {
    total,
    online,
    tone: "good" as const,
    title: "Tất cả bot đang hoạt động",
    description: "Các bot Discord của Neko Studio đang sẵn sàng phục vụ member.",
    averageLatencyMs: averageOrNull(latencyValues),
    averageUptime24h: averageOrNull(uptimeValues),
  };
}

function getImpact(bot: PublicBotSnapshot): PublicImpact {
  if (bot.publicImpact) return bot.publicImpact;
  if (!bot.liveData || bot.status === "connecting") return "checking";
  if (bot.status === "offline" || bot.status === "error") return "interrupted";
  if (typeof bot.latencyMs === "number" && bot.latencyMs >= 800) return "slow";
  return "normal";
}

function buildFallbackIncidents(bots: PublicBotSnapshot[]): PublicIncident[] {
  return bots
    .map((bot): PublicIncident | null => {
      const impact = getImpact(bot);
      if (impact === "normal") return null;
      const botName = getDisplayName(bot);
      const meta = impactMeta[impact];
      return {
        id: `${bot.endpoint.id}-${impact}`,
        botId: bot.endpoint.id,
        botName,
        impact,
        status: impact === "recovering" ? "monitoring" : "active",
        title: `${botName}: ${meta.label.toLowerCase()}`,
        description: bot.publicMessage || meta.short,
        startedAt: bot.checkedAt,
        updatedAt: bot.checkedAt,
        resolvedAt: impact === "recovering" ? bot.checkedAt : null,
      } satisfies PublicIncident;
    })
    .filter((incident): incident is PublicIncident => Boolean(incident));
}

function calculateUptime(samples: StatusSample[], hours: number, bot?: PublicBotSnapshot) {
  if (bot && !bot.liveData) return null;

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const scoped = samples.filter((sample) => new Date(sample.at).getTime() >= cutoff);
  if (scoped.length < 3) return null;

  const healthy = scoped.filter((sample) => sample.liveData && sample.status === "online").length;
  return (healthy / scoped.length) * 100;
}

function buildStatusBars(samples: StatusSample[], count = 36, hours = 24): BarData[] {
  const now = Date.now();
  const windowMs = hours * 60 * 60 * 1000;
  const bucketMs = windowMs / count;

  return Array.from({ length: count }, (_, index) => {
    const start = now - windowMs + index * bucketMs;
    const end = start + bucketMs;
    const scoped = samples.filter((sample) => {
      const at = new Date(sample.at).getTime();
      return at >= start && at < end;
    });

    const pings = scoped.map((sample) => sample.latencyMs).filter((ping): ping is number => ping !== null);
    const ping = pings.length ? Math.round(pings.reduce((sum, value) => sum + value, 0) / pings.length) : null;
    const maxPing = pings.length ? Math.max(...pings) : null;
    const checks = scoped.length;
    const healthy = scoped.filter((sample) => sample.liveData && sample.status === "online" && sample.publicImpact !== "interrupted").length;
    const uptimePercent = checks ? (healthy / checks) * 100 : null;
    const impact = getBucketImpact(scoped);

    let state: BarState = "good";
    if (!checks) {
      state = "unknown";
    } else if (impact === "interrupted") {
      state = "bad";
    } else if (impact === "slow" || impact === "recovering" || impact === "checking") {
      state = "warn";
    }

    return {
      state,
      start,
      end,
      ping,
      maxPing,
      checks,
      uptimePercent,
      impact,
      message: buildBucketMessage(state, impact, uptimePercent, ping, checks),
      x: ((index + 0.5) / count) * 100,
    };
  });
}

function getBucketImpact(samples: StatusSample[]): PublicImpact | null {
  if (!samples.length) return null;
  if (samples.some((sample) => sample.publicImpact === "interrupted" || sample.status === "offline" || sample.status === "error")) {
    return "interrupted";
  }
  if (samples.some((sample) => sample.publicImpact === "slow" || (typeof sample.latencyMs === "number" && sample.latencyMs >= 800))) {
    return "slow";
  }
  if (samples.some((sample) => sample.publicImpact === "checking" || !sample.liveData || sample.status === "connecting")) {
    return "checking";
  }
  if (samples.some((sample) => sample.publicImpact === "recovering")) {
    return "recovering";
  }
  return "normal";
}

function buildBucketMessage(
  state: BarState,
  impact: PublicImpact | null,
  uptimePercent: number | null,
  ping: number | null,
  checks: number,
) {
  if (!checks || state === "unknown") return "Chưa có đủ dữ liệu trong đoạn thời gian này.";
  if (state === "bad") return "Trong đoạn này bot có lúc bị gián đoạn, một số lệnh có thể không dùng được.";
  if (impact === "slow") return "Bot vẫn hoạt động nhưng phản hồi chậm hơn bình thường trong đoạn này.";
  if (impact === "checking") return "Trang đang kiểm tra lại dữ liệu, trạng thái có thể được cập nhật sau ít phút.";
  if (impact === "recovering") return "Bot đã phản hồi trở lại và đang được theo dõi thêm.";
  if (uptimePercent !== null && uptimePercent < 100) return `Bot ổn định khoảng ${formatPercent(uptimePercent)} trong đoạn này.`;
  if (ping !== null) return `Bot hoạt động ổn định, ping trung bình ${ping} ms.`;
  return "Bot hoạt động ổn định trong đoạn thời gian này.";
}

function getDisplayName(bot: PublicBotSnapshot) {
  return bot.serviceName || bot.endpoint.label || bot.bot.name;
}

function averageOrNull(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function impactWeight(impact: PublicImpact) {
  if (impact === "interrupted") return 0;
  if (impact === "slow") return 1;
  if (impact === "checking") return 2;
  if (impact === "recovering") return 3;
  return 4;
}

function formatPercent(value: number | null) {
  if (value === null) return "...";
  if (value >= 99.995) return "100%";
  return `${value.toFixed(2)}%`;
}

function formatRelative(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "vừa xong";

  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

function formatTime(value: number) {
  return new Date(value).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

function barLabelLong(bar: BarData) {
  if (bar.state === "good") return "Hoạt động ổn định";
  if (bar.state === "bad") return "Có gián đoạn";
  if (bar.state === "warn") {
    if (bar.impact === "slow") return "Phản hồi chậm";
    if (bar.impact === "recovering") return "Đang ổn định lại";
    return "Đang theo dõi";
  }
  return "Chưa có dữ liệu";
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatDuration(totalSeconds: number) {
  if (!totalSeconds || totalSeconds < 0) return "< 1 phút";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days} ngày`);
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0) parts.push(`${minutes} phút`);
  return parts.slice(0, 2).join(" ") || "< 1 phút";
}

export default App;
