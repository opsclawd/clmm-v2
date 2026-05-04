// CLMM Autopilot — Screens, part 1: Connect, Positions list, Position detail (safe)

// Generate realistic-looking price data
function priceSeries(n, start, drift, vol, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const arr = [start];
  for (let i = 1; i < n; i++) {
    arr.push(arr[i-1] + drift + (rnd() - 0.5) * vol);
  }
  return arr;
}

// ──────── CONNECT WALLET ────────
function ScreenConnect() {
  return (
    <div className="clmm-screen">
      <TopBar title="CLMM Autopilot" sub="Not connected" right={
        <span className="clmm-chip"><span className="d"/>Idle</span>
      }/>
      <div className="clmm-scroll" style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {/* Hero mark: concentric rings, original */}
        <div style={{ position: "relative", width: 120, height: 120, marginTop: 20, marginBottom: 24 }}>
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="58" fill="none" stroke="rgba(255,255,255,0.06)"/>
            <circle cx="60" cy="60" r="44" fill="none" stroke="rgba(255,255,255,0.10)"/>
            <circle cx="60" cy="60" r="30" fill="none" stroke="var(--safe-br)" strokeDasharray="3 4"/>
            <circle cx="60" cy="60" r="6" fill="var(--safe-ink)"/>
            <circle cx="60" cy="60" r="6" fill="none" stroke="var(--safe-ink)" opacity="0.3">
              <animate attributeName="r" values="6;40;6" dur="3s" repeatCount="indefinite"/>
              <animate attributeName="opacity" values="0.35;0;0.35" dur="3s" repeatCount="indefinite"/>
            </circle>
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", marginBottom: 8 }}>
          Protect your Orca positions
        </div>
        <div style={{ color: "var(--fg-2)", fontSize: 14, lineHeight: 1.5, maxWidth: 300, marginBottom: 28 }}>
          We monitor your concentrated liquidity range and prepare a safe one-click exit the moment price breaches it.
        </div>
        <button className="clmm-btn clmm-btn--primary clmm-btn--block" style={{ maxWidth: 320 }}>
          <Icon.wallet className="ic ic-20"/> Connect Wallet
        </button>
        <div style={{ marginTop: 28, display: "grid", gridTemplateColumns: "1fr", gap: 10, maxWidth: 320, width: "100%", textAlign: "left" }}>
          {[
            ["Read-only by default", "We only request signatures when you approve an exit."],
            ["Debounced breach logic", "Ignores 30–60s wicks so you don't exit on noise."],
            ["Auditable receipts", "Every action saved with tx hash and fills."],
          ].map(([h, p]) => (
            <div key={h} style={{ display: "flex", gap: 12, padding: "10px 2px" }}>
              <div style={{ marginTop: 2, color: "var(--safe-ink)" }}><Icon.check className="ic"/></div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h}</div>
                <div style={{ fontSize: 12, color: "var(--fg-3)" }}>{p}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <TabBar active="positions"/>
    </div>
  );
}

// ──────── POSITIONS LIST ────────
function PositionCard({ pair, pool, range, current, state, tvl, fees24, breachSide }) {
  const chip = state === "safe" ? <Chip tone="safe">In range</Chip>
             : state === "warn" ? <Chip tone="warn">Near edge</Chip>
             : <Chip tone="breach">Breach · {breachSide}</Chip>;
  return (
    <div className="clmm-card" style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PairGlyph a={pair[0]} b={pair[1]} size={30}/>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>
              {pair[0]} / {pair[1]}
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-3)" }}>{pool}</div>
          </div>
        </div>
        {chip}
      </div>
      <RangeBar min={range[0]} max={range[1]} current={current}
        breached={state === "breach"} breachSide={breachSide}/>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginTop: 4 }}>
        <div>
          <div className="clmm-label" style={{ fontSize: 10 }}>TVL</div>
          <div className="mono tnum" style={{ fontSize: 14, marginTop: 2 }}>${tvl}</div>
        </div>
        <div>
          <div className="clmm-label" style={{ fontSize: 10 }}>Fees 24h</div>
          <div className="mono tnum" style={{ fontSize: 14, marginTop: 2, color: "var(--safe-ink)" }}>+${fees24}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="clmm-label" style={{ fontSize: 10 }}>Monitor</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, marginTop: 3 }}>
            <span className="clmm-pulse" style={{
              width: 6, height: 6, borderRadius: "50%",
              background: state === "breach" ? "var(--breach-ink)" : state === "warn" ? "var(--warn-ink)" : "var(--safe-ink)",
            }}/> Live
          </div>
        </div>
      </div>
    </div>
  );
}

function ScreenPositions() {
  return (
    <div className="clmm-screen">
      <TopBar
        title="Positions"
        sub="3 monitored · 1 breach"
        right={<div style={{ display: "flex", gap: 14, color: "var(--fg-2)" }}>
          <Icon.search className="ic ic-20"/>
          <Icon.gear className="ic ic-20"/>
        </div>}
      />
      {/* Health strip */}
      <div style={{ padding: "14px 20px 4px", display: "flex", gap: 8 }}>
        <div style={{ flex: 1, padding: "10px 12px", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: 12 }}>
          <div className="clmm-label" style={{ fontSize: 10 }}>Portfolio</div>
          <div className="mono tnum" style={{ fontSize: 17, marginTop: 2 }}>$24,812</div>
        </div>
        <div style={{ flex: 1, padding: "10px 12px", background: "var(--bg-1)", border: "1px solid var(--line-1)", borderRadius: 12 }}>
          <div className="clmm-label" style={{ fontSize: 10 }}>Fees earned</div>
          <div className="mono tnum" style={{ fontSize: 17, marginTop: 2, color: "var(--safe-ink)" }}>+$142.30</div>
        </div>
      </div>

      <div className="clmm-section-h">
        <div className="title">Active positions</div>
        <div className="meta">Last check · 4s ago</div>
      </div>

      <div className="clmm-scroll" style={{ padding: "0 20px 12px" }}>
        <PositionCard pair={["SOL","USDC"]} pool="Czfq…44zE"
          range={[142.50, 168.00]} current={178.42}
          state="breach" breachSide="above"
          tvl="8,420.19" fees24="12.40"/>
        <PositionCard pair={["JTO","USDC"]} pool="9Hs2…pLx7"
          range={[2.18, 3.02]} current={2.61}
          state="safe"
          tvl="6,220.00" fees24="4.82"/>
        <PositionCard pair={["JUP","SOL"]} pool="Bn4k…Q9vm"
          range={[0.0062, 0.0081]} current={0.00638}
          state="warn"
          tvl="3,105.77" fees24="1.95"/>

        <div style={{ marginTop: 18, padding: "12px 14px", border: "1px dashed var(--line-2)",
          borderRadius: 12, color: "var(--fg-3)", fontSize: 12, display: "flex", gap: 10, alignItems: "center" }}>
          <Icon.info className="ic"/>
          <div>Push notifications unavailable on this platform. In-app alerts remain active.</div>
        </div>
      </div>
      <TabBar active="positions"/>
    </div>
  );
}

// ──────── POSITION DETAIL — SAFE ────────
function ScreenPositionSafe() {
  const data = priceSeries(80, 155, 0.02, 1.8, 7);
  return (
    <div className="clmm-screen">
      <TopBar title="SOL / USDC" sub="Orca · Tick −24493"
        left={<Icon.chevronLeft className="ic ic-20"/>}
        right={<Chip tone="safe">In range</Chip>}
      />
      <div className="clmm-scroll" style={{ padding: "16px 20px 20px" }}>
        {/* Hero price card */}
        <div className="clmm-card clmm-card--raised" style={{ padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div className="clmm-label">Current price</div>
              <div className="mono tnum" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4 }}>
                $158.24
              </div>
              <div style={{ fontSize: 12, color: "var(--safe-ink)", marginTop: 2 }} className="tnum">+1.24% · 24h</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="clmm-label">Position</div>
              <div className="mono tnum" style={{ fontSize: 20, marginTop: 4 }}>$8,420.19</div>
              <div className="tnum" style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }}>+$142.30 fees</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Sparkline data={data} showBand bandLo={142.5} bandHi={168}/>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>24h ago</span>
            <span className="mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>Now</span>
          </div>
        </div>

        {/* Range visual */}
        <div style={{ marginTop: 14 }} className="clmm-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div className="clmm-label">Range</div>
            <div style={{ fontSize: 11, color: "var(--fg-3)" }} className="mono">
              Width: <span style={{ color: "var(--fg-2)" }}>17.9%</span>
            </div>
          </div>
          <RangeBar min={142.50} max={168.00} current={158.24}/>
          <div className="clmm-row">
            <span className="k">Lower / Upper tick</span>
            <span className="v mono tnum">−25256 / −23860</span>
          </div>
          <div className="clmm-row">
            <span className="k">Time in range</span>
            <span className="v mono tnum">94.2% · 6d 4h</span>
          </div>
          <div className="clmm-row">
            <span className="k">Debounce window</span>
            <span className="v mono tnum">60s · 0.8% band</span>
          </div>
        </div>

        {/* Composition */}
        <div style={{ marginTop: 14 }} className="clmm-card">
          <div className="clmm-label" style={{ marginBottom: 12 }}>Current composition</div>
          <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", border: "1px solid var(--line-2)" }}>
            <div style={{ width: "58%", background: "var(--safe)" }}/>
            <div style={{ width: "42%", background: "var(--accent)" }}/>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <TokenGlyph sym="SOL" size={22} tint="var(--safe-ink)"/>
              <div>
                <div style={{ color: "var(--fg-2)" }}>SOL</div>
                <div className="mono tnum" style={{ fontSize: 13, color: "var(--fg-1)" }}>30.87</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ color: "var(--fg-2)", textAlign: "right" }}>USDC</div>
                <div className="mono tnum" style={{ fontSize: 13, color: "var(--fg-1)" }}>3,536.92</div>
              </div>
              <TokenGlyph sym="USDC" size={22} tint="var(--accent-ink)"/>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="clmm-btn clmm-btn--ghost" style={{ flex: 1 }}>
            <Icon.bell className="ic"/> Alert rules
          </button>
          <button className="clmm-btn clmm-btn--ghost" style={{ flex: 1 }}>
            <Icon.swap className="ic"/> Prepare exit
          </button>
        </div>
      </div>
      <TabBar active="positions"/>
    </div>
  );
}

Object.assign(window, { ScreenConnect, ScreenPositions, ScreenPositionSafe, priceSeries });
