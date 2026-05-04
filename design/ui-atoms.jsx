// CLMM Autopilot — shared atoms
// Icons are inline SVGs, kept minimal (stroke-based, 1.6 weight)

const Icon = {
  shield: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M12 3l8 3v6c0 4.8-3.4 8.7-8 9-4.6-.3-8-4.2-8-9V6l8-3z"/>
    </svg>
  ),
  shieldCheck: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M12 3l8 3v6c0 4.8-3.4 8.7-8 9-4.6-.3-8-4.2-8-9V6l8-3z"/>
      <path d="M8.5 12.5l2.5 2.5 4.5-5"/>
    </svg>
  ),
  alert: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M12 4l9 16H3L12 4z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>
    </svg>
  ),
  bell: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z"/><path d="M10 20a2 2 0 004 0"/>
    </svg>
  ),
  layers: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17l9 5 9-5"/>
    </svg>
  ),
  wallet: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="17" cy="14.5" r="1" fill="currentColor"/>
    </svg>
  ),
  history: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M3 12a9 9 0 109-9 9 9 0 00-7.5 4"/><path d="M3 4v4h4"/><path d="M12 7v5l3 2"/>
    </svg>
  ),
  trend: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M3 17l6-6 4 4 8-9"/><path d="M14 6h7v7"/>
    </svg>
  ),
  arrowRight: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
    </svg>
  ),
  chevronRight: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M9 6l6 6-6 6"/>
    </svg>
  ),
  chevronLeft: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M15 6l-6 6 6 6"/>
    </svg>
  ),
  x: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M6 6l12 12"/><path d="M18 6l-6 6-6 6"/>
    </svg>
  ),
  lock: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>
    </svg>
  ),
  swap: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M7 7h13"/><path d="M16 3l4 4-4 4"/><path d="M17 17H4"/><path d="M8 21l-4-4 4-4"/>
    </svg>
  ),
  check: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <path d="M4 12l5 5L20 6"/>
    </svg>
  ),
  dot: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
    </svg>
  ),
  search: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>
    </svg>
  ),
  gear: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 00-2.1 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2.1 1.2L10 21h4l.5-2.6c.8-.3 1.5-.7 2.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>
    </svg>
  ),
  radar: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>
      <path d="M12 12l6-4"/>
    </svg>
  ),
  info: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/>
    </svg>
  ),
  copy: (p) => (
    <svg className={`ic ${p?.size||""}`} viewBox="0 0 24 24" {...p}>
      <rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>
    </svg>
  ),
};

// Simple phone frame — tuned to the existing app's aspect (~770x812)
function Phone({ children, width = 390, height = 812, label }) {
  return (
    <div style={{
      width, height, position: "relative",
      borderRadius: 42, overflow: "hidden",
      background: "var(--bg-0)",
      boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 0 0 1px #1a2230, 0 40px 80px -20px rgba(0,0,0,0.7)",
    }}>
      {/* status bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 44, zIndex: 20,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 24px 0 28px", color: "var(--fg-1)",
        fontSize: 14, fontWeight: 600, fontFamily: "var(--font-ui)",
        pointerEvents: "none",
      }}>
        <span className="tnum">9:41</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
          <svg width="17" height="11" viewBox="0 0 17 11" fill="none">
            <rect x="0.5" y="6" width="2" height="4" rx="0.5" fill="#F4F6F8"/>
            <rect x="4.5" y="4" width="2" height="6" rx="0.5" fill="#F4F6F8"/>
            <rect x="8.5" y="2" width="2" height="8" rx="0.5" fill="#F4F6F8"/>
            <rect x="12.5" y="0" width="2" height="10" rx="0.5" fill="#F4F6F8"/>
          </svg>
          <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
            <path d="M8 3a7 7 0 015 2M8 6a4 4 0 013 1" stroke="#F4F6F8" strokeWidth="1.1" strokeLinecap="round"/>
            <circle cx="8" cy="9" r="1" fill="#F4F6F8"/>
          </svg>
          <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
            <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="#F4F6F8" opacity="0.5"/>
            <rect x="2" y="2" width="17" height="8" rx="1.5" fill="#F4F6F8"/>
            <rect x="23" y="4" width="2" height="4" rx="0.5" fill="#F4F6F8" opacity="0.5"/>
          </svg>
        </div>
      </div>
      {/* dynamic island */}
      <div style={{
        position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
        width: 112, height: 32, borderRadius: 999, background: "#000", zIndex: 25,
      }}/>
      {/* content */}
      <div style={{ position: "absolute", top: 44, left: 0, right: 0, bottom: 0 }}>
        {children}
      </div>
      {/* home indicator */}
      <div style={{
        position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
        width: 134, height: 5, borderRadius: 999, background: "rgba(255,255,255,0.9)", zIndex: 30,
      }}/>
    </div>
  );
}

// Top bar for all CLMM screens
function TopBar({ title, sub, left, right }) {
  return (
    <div className="clmm-topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {left}
        <div>
          <div className="clmm-topbar__title">{title}</div>
          {sub && <div className="clmm-topbar__sub">{sub}</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div>
    </div>
  );
}

// Bottom tab bar — constant across screens
function TabBar({ active = "positions" }) {
  const tabs = [
    { id: "positions", label: "Positions", icon: Icon.layers },
    { id: "alerts",    label: "Alerts",    icon: Icon.bell   },
    { id: "regime",    label: "Regime",    icon: Icon.radar  },
    { id: "wallet",    label: "Wallet",    icon: Icon.wallet },
  ];
  return (
    <div className="clmm-tabbar">
      {tabs.map(t => {
        const I = t.icon;
        const on = t.id === active;
        return (
          <div key={t.id} className={`clmm-tab ${on?"is-active":""}`}>
            <I className={`ic ic-20 ${on?"":""}`}/>
            <span>{t.label}</span>
            <div className="dot"/>
          </div>
        );
      })}
    </div>
  );
}

function Chip({ tone = "neutral", children }) {
  return (
    <span className={`clmm-chip ${tone}`}>
      <span className="d"/>
      {children}
    </span>
  );
}

// Token glyph — simple, original (circle + letter). No brand mark.
function TokenGlyph({ sym = "SOL", size = 28, tint = "var(--fg-2)" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: "1px solid var(--line-2)", background: "var(--bg-2)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      color: tint, fontFamily: "var(--font-mono)", fontSize: size * 0.36, fontWeight: 600,
      letterSpacing: "-0.02em",
    }}>{sym.slice(0,3)}</div>
  );
}

// Pair glyph — two overlapping circles
function PairGlyph({ a = "SOL", b = "USDC", size = 28 }) {
  return (
    <div style={{ display: "inline-flex", position: "relative", width: size * 1.55, height: size }}>
      <div style={{ position: "absolute", left: 0, top: 0 }}>
        <TokenGlyph sym={a} size={size} />
      </div>
      <div style={{ position: "absolute", left: size * 0.55, top: 0 }}>
        <TokenGlyph sym={b} size={size} tint="var(--accent-ink)" />
      </div>
    </div>
  );
}

// Range visualization — clean horizontal bar
function RangeBar({ min, max, current, breached = false, breachSide }) {
  // domain extends 15% past each edge so band sits in middle
  const pad = (max - min) * 0.35;
  const lo = min - pad, hi = max + pad;
  const pct = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const bandL = pct(min), bandR = pct(max);
  const cur = pct(current);

  return (
    <div style={{ padding: "8px 4px 32px" }}>
      <div style={{ position: "relative", height: 10 }}>
        {/* base track */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(255,255,255,0.05)",
          borderRadius: 999,
        }}/>
        {/* out-of-range shading left */}
        <div style={{
          position: "absolute", left: 0, width: `${bandL}%`, top: 0, bottom: 0,
          background: breached && breachSide === "below"
            ? "color-mix(in oklab, var(--breach) 30%, transparent)"
            : "rgba(245,148,132,0.12)",
          borderRadius: "999px 0 0 999px",
        }}/>
        <div style={{
          position: "absolute", right: 0, width: `${100 - bandR}%`, top: 0, bottom: 0,
          background: breached && breachSide === "above"
            ? "color-mix(in oklab, var(--breach) 30%, transparent)"
            : "rgba(245,148,132,0.12)",
          borderRadius: "0 999px 999px 0",
        }}/>
        {/* in-range band */}
        <div style={{
          position: "absolute", left: `${bandL}%`, width: `${bandR - bandL}%`,
          top: 0, bottom: 0,
          background: "color-mix(in oklab, var(--safe) 18%, transparent)",
          borderLeft: "1px solid var(--line-3)",
          borderRight: "1px solid var(--line-3)",
        }}/>
        {/* current tick */}
        <div style={{
          position: "absolute", left: `${cur}%`, top: -6, width: 2, height: 22,
          background: breached ? "var(--breach-ink)" : "var(--fg-1)",
          borderRadius: 2,
          boxShadow: breached
            ? "0 0 0 3px rgba(7,10,15,0.9), 0 0 16px var(--breach-ink)"
            : "0 0 0 3px rgba(7,10,15,0.9)",
          transform: "translateX(-50%)",
        }}/>
        {/* edge labels */}
        <div className="mono tnum" style={{
          position: "absolute", left: `${bandL}%`, top: 20, transform: "translateX(-50%)",
          fontSize: 10, color: "var(--fg-3)",
        }}>${min.toFixed(2)}</div>
        <div className="mono tnum" style={{
          position: "absolute", left: `${bandR}%`, top: 20, transform: "translateX(-50%)",
          fontSize: 10, color: "var(--fg-3)",
        }}>${max.toFixed(2)}</div>
        <div className="mono tnum" style={{
          position: "absolute", left: `${cur}%`, top: 20, transform: "translateX(-50%)",
          fontSize: 10, color: breached ? "var(--breach-ink)" : "var(--fg-1)",
          fontWeight: 600,
        }}>${current.toFixed(2)}</div>
      </div>
    </div>
  );
}

// Sparkline — takes array of numbers, renders area+line
function Sparkline({ data, breach = false, height = 56, showBand, bandLo, bandHi }) {
  const w = 350, h = height;
  const min = Math.min(...data, bandLo ?? Infinity);
  const max = Math.max(...data, bandHi ?? -Infinity);
  const range = (max - min) || 1;
  const pad = 4;
  const x = (i) => (i / (data.length - 1)) * (w - pad*2) + pad;
  const y = (v) => h - pad - ((v - min) / range) * (h - pad*2);
  const path = data.map((v, i) => `${i===0?"M":"L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L ${x(data.length-1)} ${h} L ${x(0)} ${h} Z`;
  const stroke = breach ? "var(--breach-ink)" : "var(--fg-1)";
  return (
    <svg className="clmm-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {showBand && bandLo != null && bandHi != null && (
        <rect x={0} y={y(bandHi)} width={w} height={y(bandLo) - y(bandHi)}
          fill="rgba(158,236,209,0.08)" stroke="rgba(158,236,209,0.18)" strokeDasharray="2 3"/>
      )}
      <path d={area} fill={breach ? "rgba(245,148,132,0.10)" : "rgba(244,246,248,0.06)"}/>
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={x(data.length-1)} cy={y(data[data.length-1])} r="2.5" fill={stroke}/>
    </svg>
  );
}

Object.assign(window, { Icon, Phone, TopBar, TabBar, Chip, TokenGlyph, PairGlyph, RangeBar, Sparkline });
