interface NotFoundProps {
  onGoHome: () => void;
}

export function NotFound({ onGoHome }: NotFoundProps) {
  return (
    <section className="not-found-card glass-panel reveal-once" aria-labelledby="not-found-title">
      <div className="not-found-badge">
        <span className="not-found-dot" />
        <span>MẤT TÍN HIỆU · 404</span>
      </div>

      <div className="not-found-visual" aria-hidden="true">
        <div className="not-found-code">404</div>
        <svg className="not-found-radar" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" opacity="0.35" />
          <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
          <circle cx="50" cy="50" r="15" stroke="currentColor" strokeWidth="2" opacity="0.8" />
          <circle cx="50" cy="50" r="4" fill="currentColor" />
          <line x1="50" y1="50" x2="85" y2="25" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="radar-sweep" />
        </svg>
      </div>

      <div className="not-found-content">
        <h1 id="not-found-title">Không tìm thấy đường dẫn</h1>
        <p>
          Trang bạn đang truy cập không tồn tại hoặc đã được di chuyển trong hệ thống giám sát Neko Studio.
        </p>
      </div>

      <div className="not-found-actions">
        <button
          type="button"
          className="not-found-btn primary-glow"
          onClick={onGoHome}
          aria-label="Quay lại Dashboard Trạng Thái"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>Quay lại Dashboard</span>
        </button>
      </div>

      <div className="not-found-footnote">
        <span className="footnote-pulse" />
        <span>Hệ sinh thái bot Discord vẫn đang trực tuyến ổn định</span>
      </div>
    </section>
  );
}
