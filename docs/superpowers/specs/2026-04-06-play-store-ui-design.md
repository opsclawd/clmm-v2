# Play Store UI Design — Calm Command Direction

**Goal:** Elevate the CLMM V2 app UI to a polished, trustworthy, Play Store-ready presentation while preserving the product’s narrow scope: non-custodial, directional LP exit assistance for Solana Orca CLMM positions.

**Scope:** UI and visual system only. No product expansion, no new business logic, no workflow changes. The redesign must preserve the existing app structure and the current domain invariants.

**Recommended Direction:** `Calm Command`

---

## 1. Current State

The app is functional, but its current presentation is still closer to an internal tool than a store-ready consumer product.

### Observed UI issues

- Surfaces are too flat and visually repetitive.
- The current black/green palette feels generic and overused.
- Important states such as breach, freshness, signing, and terminal execution are not staged clearly.
- Screen hierarchy is weak: primary facts and secondary details often share the same visual weight.
- The app lacks a distinct visual identity that would read well in Play Store screenshots.

### What should stay intact

- The app should remain focused on exit assistance, not generic portfolio or trading features.
- Directional exit logic must remain visible and understandable.
- Non-custodial behavior must remain obvious and credible.
- Existing screen structure in `packages/ui` should remain the base for redesign.

---

## 2. Design Direction

`Calm Command` is the recommended visual direction.

### Principles

- Trust first: the app should feel safe, controlled, and deliberate.
- Clarity over decoration: every screen should answer one primary question.
- Premium, not flashy: use restraint instead of gimmicks.
- Directional emphasis: the app should make breach direction and exit posture easy to read at a glance.

### Visual language

- Backgrounds: deep slate rather than pure black.
- Surfaces: layered cards with subtle contrast differences.
- Primary action: emerald green.
- Caution: amber.
- Critical errors: restrained red.
- Typography: stronger hierarchy for title, state, and supporting details.
- Corners and spacing: rounded, but disciplined and consistent across screens.
- Motion: minimal, used only to reinforce state changes and reduce perceived friction.

---

## 3. Product-Level Goals

The redesign should make the app look and feel:

- credible enough for Play Store screenshots
- calm under pressure
- easy to scan on a small phone display
- explicit about whether action is needed
- narrow and purposeful, not like a general DeFi dashboard

Success is not measured by adding features. Success is measured by making the existing flow look intentional, premium, and easy to trust.

---

## 4. Screen Strategy

The redesign should prioritize the screens most likely to appear in screenshots and the screens most important to conversion.

### 4.1 Positions

Treat this as a dashboard, not just a list.

Expected changes:

- Add a stronger top-level summary area.
- Make wallet and readiness state visually obvious.
- Order position cards by urgency or action relevance.
- Elevate breach/risk states using clear semantic badges.
- Reduce visual clutter inside each card.

### 4.2 Position Detail

This is the main decision screen.

Expected changes:

- Increase visual prominence of the range state and breach state.
- Put range bounds and current price into a clearer hierarchy.
- Make the directional policy callout easier to understand.
- Show the preview action as the single dominant CTA when available.

### 4.3 Exit Preview

This is the most important trust screen.

Expected changes:

- Make the directional policy card the centerpiece.
- Present execution steps as a clear ordered sequence.
- Surface freshness and quote validity in a compact state band.
- Use warning states only when action is blocked or risky.
- Keep the sign-and-execute CTA visually distinct from secondary actions.

### 4.4 Signing and Execution

This flow should feel calm, explicit, and honest.

Expected changes:

- Show a clear waiting-for-signature state.
- Use progress and lifecycle cues to reduce uncertainty.
- Distinguish pending, submitted, confirmed, failed, and partial states clearly.
- Avoid implying finality before reconciliation is complete.

### 4.5 History, Wallet, and Alerts

These are utility screens and should be quieter than the main action surfaces.

Expected changes:

- Reduce emphasis compared with preview and detail flows.
- Improve scanability of timelines and lists.
- Use consistent labels and state chips.
- Preserve off-chain history messaging without sounding technical or defensive.

---

## 5. Design System Changes

The current tokens are sufficient to support the product, but they need refinement for presentation quality.

### Token updates

- Expand semantic colors for safety, caution, breach, pending, and terminal states.
- Introduce layered surface tokens instead of a single flat surface color.
- Tighten spacing rules so the layout feels more intentional.
- Standardize corner radii across cards and buttons.
- Define clearer type scale usage for page title, section label, body copy, and helper text.

### Component behaviors

- Primary cards should feel elevated relative to the background.
- Secondary cards should recede slightly.
- CTAs should be large, legible, and visually distinct.
- Status chips should be compact and semantically colored.
- Empty, loading, and error states should feel designed rather than incidental.

---

## 6. Play Store Screenshot Plan

The store listing should show a coherent sequence of the product, not random app states.

Recommended screenshot set:

1. Positions overview
2. Position detail
3. Exit preview
4. Signing / waiting for signature
5. History

Screenshot qualities:

- consistent theme and spacing
- high contrast, but not harsh
- readable at thumbnail size
- centered on the product promise rather than generic app chrome

---

## 7. Motion and Polish

Motion should be subtle and functional.

Recommended motion patterns:

- card entrance transitions
- CTA press feedback
- step-by-step reveal in preview
- short waiting state animation during signing
- clear success confirmation after execution

Motion should never distract from directional clarity or imply completed execution too early.

---

## 8. Implementation Sequence

The UI work should proceed in this order:

1. Redesign design tokens and semantic styling primitives.
2. Refresh the core screen shells in `packages/ui`.
3. Improve hierarchy on Positions, Position Detail, and Exit Preview.
4. Polish Signing, History, Wallet, and Alerts.
5. Add empty, loading, error, and stale states.
6. Prepare the Play Store screenshot set.
7. Do a final consistency pass across mobile and web.

This sequence keeps the work centered on the highest-value surfaces first.

---

## 9. Constraints

- Do not introduce generic DeFi dashboard behavior.
- Do not change the directional exit invariant.
- Do not move business logic into UI components.
- Do not redesign the app shell around a new information architecture.
- Do not introduce features unrelated to store presentation or clarity.

---

## 10. Acceptance Criteria

The redesign is acceptable when:

- the app feels visibly more premium and intentional
- the key flow reads clearly on a phone screen
- the store screenshots feel consistent and credible
- breach direction and exit posture are immediately understandable
- the app still feels narrow, non-custodial, and purpose-built

## 11. Recommendation

Proceed with the `Calm Command` direction.

It is the best fit for the product because it balances:

- credibility
- clarity
- premium presentation
- directional emphasis
- Play Store readiness

