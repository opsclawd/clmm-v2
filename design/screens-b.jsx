// CLMM Autopilot — Screens, part 2: Breach, Exit preview, Regime, History, Wallet

// ──────── POSITION DETAIL — BREACH ────────
function ScreenBreach() {
  const data = priceSeries(80, 155, 0.32, 1.6, 12);
  // force ending above range
  for (let i = 60; i < data.length; i++) data[i] = 168 + (i - 60) * 0.8 + Math.sin(i) * 0.6;
  return (
    <div className="clmm-screen">
      <TopBar title="SOL / USDC" sub="Breach · 4m 12s ago"
        left={<Icon.chevronLeft className="ic ic-20"/>}
        right={<Chip tone="breach">Above range</Chip>}
      />
      <div className="clmm-scroll" style={{ padding: "12px 20px 20px" }}>
        {/* Breach banner */}
        <div style={{
          padding: "14px 16px", borderRadius: 14,
          border: "1px solid var(--breach-br)",
          background: "var(--breach-bg)",
          display: "flex", gap: 12, alignItems: "flex-start",
        }}>
          <div style={{ marginTop: 2, color: "var(--breach-ink)" }}>
            <Icon.alert className="ic ic-20"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--breach-ink)", fontWeight: 600, fontSize: 14 }}>Range breach confirmed</div>
            <div style={{ color: "var(--fg-2)", fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>
              Price has held <span className="mono" style={{ color: "var(--fg-1)" }}>$178.42</span> above the upper bound for <span className="mono" style={{ color: "var(--fg-1)" }}>4m 12s</span>. Debounce satisfied. Exposure is now <span style={{ color: "var(--breach-ink)" }}>98% SOL</span>.
            </div>
          </div>
        </div>

        {/* Price card */}
        <div className="clmm-card clmm-card--raised" style={{ marginTop: 14, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div className="clmm-label">Current price</div>
              <div className="mono tnum" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4, color: "var(--breach-ink)" }}>
                $178.42
              </div>
              <div style={{ fontSize: 12, color: "var(--breach-ink)", marginTop: 2 }} className="tnum">+6.2% · last 30m</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="clmm-label">Est. value now</div>
              <div className="mono tnum" style={{ fontSize: 20, marginTop: 4 }}>$8,781.04</div>
              <div className="tnum" style={{ fontSize: 12, color: "var(--warn-ink)", marginTop: 2 }}>IL est. −$214</div>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <Sparkline data={data} breach showBand bandLo={142.5} bandHi={168}/>
          </div>
        </div>

        {/* Range with breach tick */}
        <div className="clmm-card" style={{ marginTop: 14 }}>
          <div className="clmm-label" style={{ marginBottom: 4 }}>Range</div>
          <RangeBar min={142.50} max={168.00} current={178.42} breached breachSide="above"/>
          <div className="clmm-row">
            <span className="k">Exposure now</span>
            <span className="v mono tnum">98% SOL · 2% USDC</span>
          </div>
          <div className="clmm-row">
            <span className="k">If price falls back</span>
            <span className="v mono tnum" style={{ color: "var(--warn-ink)" }}>Downside risk</span>
          </div>
        </div>

        {/* Recommendation */}
        <div className="clmm-card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <Icon.shield className="ic ic-20" style={{ color: "var(--safe-ink)" }}/>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Recommended action</div>
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-2)", lineHeight: 1.5 }}>
            Exit to <span style={{ color: "var(--fg-1)", fontWeight: 600 }}>USDC</span>. Remove liquidity, collect fees, then swap residual SOL. Estimated slippage <span className="mono" style={{ color: "var(--fg-1)" }}>0.11%</span>.
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="clmm-btn clmm-btn--ghost" style={{ flex: 1 }}>Snooze 15m</button>
            <button className="clmm-btn clmm-btn--danger" style={{ flex: 1.4 }}>
              Prepare exit <Icon.arrowRight className="ic"/>
            </button>
          </div>
        </div>
      </div>
      <TabBar active="positions"/>
    </div>
  );
}

// ──────── EXIT PREVIEW / SIGN ────────
function ScreenExit() {
  return (
    <div className="clmm-screen">
      <TopBar title="Review exit" sub="Sign to execute"
        left={<Icon.x className="ic ic-20"/>}
        right={<span className="clmm-chip mono" style={{ fontSize: 11 }}>Draft · v1</span>}
      />
      <div className="clmm-scroll" style={{ padding: "16px 20px 20px" }}>
        <div className="clmm-card clmm-card--raised">
          <div className="clmm-label">You will receive</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
            <div className="mono tnum" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em" }}>8,781.04</div>
            <div style={{ fontSize: 16, color: "var(--fg-2)" }}>USDC</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 2 }} className="tnum">≈ $8,781.04 · min received 8,771.37</div>
        </div>

        {/* Steps */}
        <div className="clmm-card" style={{ marginTop: 14 }}>
          <div className="clmm-label" style={{ marginBottom: 14 }}>Transaction steps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { n: 1, t: "Remove liquidity", d: "Close LP position · burn NFT", v: "48.12 SOL + 120.40 USDC" },
              { n: 2, t: "Collect fees",     d: "Accrued Orca fees",           v: "0.92 SOL + 14.18 USDC" },
              { n: 3, t: "Swap residual",    d: "Jupiter · route SOL → USDC",  v: "49.04 SOL → 8,646.46 USDC" },
              { n: 4, t: "Record receipt",   d: "Sign + archive auditable log",v: "Local + IPFS pin" },
            ].map((s) => (
              <div key={s.n} className="clmm-step">
                <div className="clmm-step__bullet mono">{s.n}</div>
                <div className="clmm-step__body">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{s.t}</div>
                    <div className="mono tnum" style={{ fontSize: 12, color: "var(--fg-2)", textAlign: "right" }}>{s.v}</div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fees breakdown */}
        <div className="clmm-card" style={{ marginTop: 14 }}>
          <div className="clmm-row"><span className="k">Priority fee</span><span className="v mono tnum">0.00021 SOL</span></div>
          <div className="clmm-row"><span className="k">Network fee</span><span className="v mono tnum">0.00005 SOL</span></div>
          <div className="clmm-row"><span className="k">Swap route</span><span className="v mono tnum">Jupiter · 2 hops</span></div>
          <div className="clmm-row"><span className="k">Max slippage</span><span className="v mono tnum">0.11% · 0.50% cap</span></div>
          <div className="clmm-row"><span className="k">Expires</span><span className="v mono tnum">in 58s</span></div>
        </div>

        <div className="clmm-banner" style={{ margin: "14px 0 0" }}>
          <Icon.lock className="ic" style={{ marginTop: 2, color: "var(--fg-2)" }}/>
          <div>You sign once. Nothing executes until you confirm in your wallet. A receipt is saved locally the moment the tx lands.</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="clmm-btn clmm-btn--ghost" style={{ flex: 1 }}>Cancel</button>
          <button className="clmm-btn clmm-btn--safe" style={{ flex: 1.6 }}>
            <Icon.lock className="ic"/> Sign &amp; exit
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────── REGIME ENGINE ────────
function RegimeRing({ label, value, tone = "safe" }) {
  const toneColor = tone === "warn" ? "var(--warn-ink)" : tone === "breach" ? "var(--breach-ink)" : "var(--safe-ink)";
  const pct = Math.min(100, Math.max(0, value));
  const R = 22, C = 2 * Math.PI * R;
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4"/>
        <circle cx="32" cy="32" r={R} fill="none" stroke={toneColor} strokeWidth="4"
          strokeDasharray={`${(pct/100)*C} ${C}`} strokeLinecap="round"
          transform="rotate(-90 32 32)"/>
      </svg>
      <div className="mono tnum" style={{ fontSize: 12, marginTop: -4, color: toneColor, fontWeight: 600 }}>{pct}</div>
      <div style={{ fontSize: 10, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScreenRegime() {
  const data = priceSeries(100, 148, 0.18, 2.2, 3);
  return (
    <div className="clmm-screen">
      <TopBar title="SOL regime" sub="Decision support · not auto-trading"
        right={<span className="clmm-chip mono" style={{ fontSize: 11 }}>updated 12m</span>}
      />
      <div className="clmm-scroll" style={{ padding: "14px 20px 20px" }}>
        {/* Headline */}
        <div className="clmm-card clmm-card--raised" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Chip tone="warn">Trending · choppy</Chip>
            <span className="mono tnum" style={{ fontSize: 11, color: "var(--fg-3)" }}>conf 0.72</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 14, lineHeight: 1.35 }}>
            Price is trending up but approaching prior <span style={{ color: "var(--warn-ink)" }}>resistance at $178.90</span>.
          </div>
          <div style={{ fontSize: 13, color: "var(--fg-2)", marginTop: 8, lineHeight: 1.5 }}>
            Realized volatility is elevated. If you hold a tight range, expect breach risk in the next 4–8 hours.
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 18, justifyContent: "space-around" }}>
            <RegimeRing label="Trend"  value={72} tone="warn"/>
            <RegimeRing label="Vol"    value={58} tone="warn"/>
            <RegimeRing label="Liquidity" value={84} tone="safe"/>
            <RegimeRing label="Regime" value={65} tone="warn"/>
          </div>
        </div>

        {/* Chart w/ S/R lines */}
        <div className="clmm-card" style={{ marginTop: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="clmm-label">SOL · 7d</div>
            <div style={{ display: "flex", gap: 4 }}>
              {["1h","4h","1d","7d","30d"].map((l, i) => (
                <div key={l} style={{
                  fontSize: 11, padding: "4px 8px", borderRadius: 6,
                  background: i === 3 ? "var(--bg-3)" : "transparent",
                  color: i === 3 ? "var(--fg-1)" : "var(--fg-3)",
                  fontFamily: "var(--font-mono)",
                }}>{l}</div>
              ))}
            </div>
          </div>
          <div style={{ position: "relative", marginTop: 8 }}>
            <Sparkline data={data} height={110}/>
            {/* S/R lines overlay */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {[
                { p: 20, label: "R $178.90", tone: "breach" },
                { p: 36, label: "R $168.00", tone: "warn" },
                { p: 62, label: "S $148.20", tone: "safe" },
                { p: 80, label: "S $142.50", tone: "safe" },
              ].map((l) => (
                <div key={l.label} style={{ position: "absolute", left: 0, right: 0, top: `${l.p}%`, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${
                    l.tone === "breach" ? "var(--breach-br)" :
                    l.tone === "warn" ? "var(--warn-br)" : "var(--safe-br)"
                  }`}}/>
                  <div className="mono" style={{
                    fontSize: 10, padding: "2px 6px", borderRadius: 4,
                    background: "var(--bg-0)",
                    color: l.tone === "breach" ? "var(--breach-ink)" : l.tone === "warn" ? "var(--warn-ink)" : "var(--safe-ink)",
                    border: "1px solid var(--line-2)",
                  }}>{l.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* S/R list */}
        <div className="clmm-card" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="clmm-label">Support &amp; Resistance</div>
            <div style={{ fontSize: 11, color: "var(--fg-3)" }}>AI · MCO · 2h ago</div>
          </div>
          {[
            { t: "R", p: "$178.90", note: "Primary · tested 4× in 14d", tone: "breach" },
            { t: "R", p: "$168.00", note: "Range upper · your position",   tone: "warn" },
            { t: "S", p: "$148.20", note: "Primary · 30d pivot",           tone: "safe" },
            { t: "S", p: "$142.50", note: "Range lower · your position",   tone: "safe" },
          ].map((r, i) => (
            <div key={i} className="clmm-row" style={{ padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="clmm-chip" style={{
                  height: 22, padding: "0 8px", fontSize: 10,
                  color: r.tone === "breach" ? "var(--breach-ink)" : r.tone === "warn" ? "var(--warn-ink)" : "var(--safe-ink)",
                  borderColor: r.tone === "breach" ? "var(--breach-br)" : r.tone === "warn" ? "var(--warn-br)" : "var(--safe-br)",
                }}>{r.t === "R" ? "Resist" : "Support"}</span>
                <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600 }}>{r.p}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--fg-3)", textAlign: "right", maxWidth: 150 }}>{r.note}</div>
            </div>
          ))}
        </div>

        <div className="clmm-banner" style={{ margin: "14px 0 0" }}>
          <Icon.info className="ic" style={{ marginTop: 2, color: "var(--fg-3)" }}/>
          <div>Regime read is decision support. CLMM Autopilot only acts when you sign — it will not trade for you.</div>
        </div>
      </div>
      <TabBar active="regime"/>
    </div>
  );
}

// ──────── HISTORY / RECEIPT ────────
function ScreenHistory() {
  const items = [
    { t: "Exit completed", pair: "SOL/USDC", when: "2h ago", v: "+$8,781.04 USDC", hash: "5Tq…9rXm", tone: "safe" },
    { t: "Breach detected", pair: "SOL/USDC", when: "2h 4m ago", v: "Above $168.00", hash: "—", tone: "breach" },
    { t: "Fees collected", pair: "JTO/USDC", when: "1d ago", v: "+$4.82", hash: "3Fa…qZk1", tone: "safe" },
    { t: "Range adjusted",  pair: "JUP/SOL",  when: "3d ago", v: "−5% → +5%", hash: "9Bv…pL20", tone: "neutral" },
    { t: "Breach (wick, debounced)", pair: "SOL/USDC", when: "5d ago", v: "held 22s", hash: "—", tone: "warn" },
  ];
  return (
    <div className="clmm-screen">
      <TopBar title="History" sub="32 events · last 30 days"
        right={<Icon.search className="ic ic-20"/>}
      />
      <div className="clmm-scroll" style={{ padding: "14px 20px 20px" }}>
        {/* Featured receipt */}
        <div className="clmm-card clmm-card--raised">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Icon.shieldCheck className="ic ic-20" style={{ color: "var(--safe-ink)" }}/>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Latest receipt · Exit complete</div>
          </div>
          <div className="clmm-row"><span className="k">Pair</span><span className="v">SOL / USDC</span></div>
          <div className="clmm-row"><span className="k">Received</span><span className="v mono tnum" style={{ color: "var(--safe-ink)" }}>+8,781.04 USDC</span></div>
          <div className="clmm-row"><span className="k">Slippage</span><span className="v mono tnum">0.08%</span></div>
          <div className="clmm-row"><span className="k">Tx hash</span>
            <span className="v mono" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              5Tq9…x9rXm <Icon.copy className="ic" style={{ color: "var(--fg-3)" }}/>
            </span>
          </div>
          <div className="clmm-row"><span className="k">Archived</span><span className="v mono">IPFS · local</span></div>
        </div>

        <div className="clmm-section-h" style={{ padding: 0, margin: "22px 0 10px" }}>
          <div className="title">Timeline</div>
          <div className="meta">newest first</div>
        </div>

        <div className="clmm-card" style={{ padding: "4px 16px" }}>
          {items.map((it, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 0",
              borderTop: i === 0 ? 0 : "1px solid var(--line-1)",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: it.tone === "safe" ? "var(--safe-ink)"
                  : it.tone === "breach" ? "var(--breach-ink)"
                  : it.tone === "warn" ? "var(--warn-ink)" : "var(--fg-3)",
                boxShadow: it.tone === "breach" ? "0 0 10px var(--breach-ink)" : "none",
              }}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.t}</div>
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }}>{it.pair} · {it.when}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="mono tnum" style={{ fontSize: 12 }}>{it.v}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--fg-3)", marginTop: 2 }}>{it.hash}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <TabBar active="alerts"/>
    </div>
  );
}

// ──────── WALLET & SETTINGS ────────
function ScreenWallet() {
  return (
    <div className="clmm-screen">
      <TopBar title="Wallet" sub="Browser wallet · Devnet off"
        right={<Icon.gear className="ic ic-20"/>}
      />
      <div className="clmm-scroll" style={{ padding: "14px 20px 20px" }}>
        <div className="clmm-card clmm-card--raised">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: "conic-gradient(from 120deg, #1a2230, #2a3b50, #1a2230)",
              border: "1px solid var(--line-2)",
            }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "var(--fg-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Connected</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                3FoZ…PYip
                <Icon.copy className="ic" style={{ color: "var(--fg-3)" }}/>
              </div>
            </div>
            <Chip tone="safe">Live</Chip>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="clmm-btn clmm-btn--ghost" style={{ flex: 1, height: 40, fontSize: 13 }}>Reconnect</button>
            <button className="clmm-btn clmm-btn--ghost" style={{ flex: 1, height: 40, fontSize: 13 }}>Switch</button>
          </div>
        </div>

        <div className="clmm-section-h" style={{ padding: 0, margin: "22px 0 10px" }}>
          <div className="title">Protection settings</div>
        </div>

        <div className="clmm-card" style={{ padding: "4px 16px" }}>
          {[
            ["Breach debounce", "60s · 0.8% band", true],
            ["Auto-prepare exit", "On breach confirm", true],
            ["Exit target asset", "USDC", false],
            ["Max slippage", "0.50%", false],
            ["Priority fee cap", "0.0005 SOL", false],
          ].map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 0", borderTop: i === 0 ? 0 : "1px solid var(--line-1)",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{r[0]}</div>
                <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 2 }} className="mono">{r[1]}</div>
              </div>
              {r[2] ? (
                <div style={{
                  width: 36, height: 22, borderRadius: 999,
                  background: "color-mix(in oklab, var(--safe) 55%, transparent)",
                  position: "relative",
                }}>
                  <div style={{
                    position: "absolute", right: 2, top: 2, width: 18, height: 18,
                    borderRadius: "50%", background: "var(--fg-1)",
                  }}/>
                </div>
              ) : (
                <Icon.chevronRight className="ic" style={{ color: "var(--fg-3)" }}/>
              )}
            </div>
          ))}
        </div>

        <div className="clmm-section-h" style={{ padding: 0, margin: "22px 0 10px" }}>
          <div className="title">Session</div>
        </div>
        <button className="clmm-btn clmm-btn--ghost clmm-btn--block" style={{
          color: "var(--breach-ink)", borderColor: "var(--breach-br)", background: "var(--breach-bg)",
        }}>Disconnect</button>

        <div style={{ fontSize: 10, color: "var(--fg-4)", textAlign: "center", marginTop: 24, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          CLMM Autopilot · v0.4.2 · Devnet ready
        </div>
      </div>
      <TabBar active="wallet"/>
    </div>
  );
}

Object.assign(window, { ScreenBreach, ScreenExit, ScreenRegime, ScreenHistory, ScreenWallet, RegimeRing });
