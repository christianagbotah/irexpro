# iRexPro UI/UX Design System — Mandatory Standard

> **This document is the permanent, mandatory UI/UX standard for all iRexPro interfaces.**
>
> Every new or modified page, component, dashboard, form, modal, table, chart, report,
> onboarding flow, admin screen, and mobile interface MUST conform to this document.
>
> **Do not implement pages that are merely functional.** Every interface must receive
> complete professional UI/UX treatment as part of its implementation.
>
> **Last updated:** Sprint 29 + UX feature branch
> **Status:** MANDATORY — enforced by design review

---

## Table of Contents

1. [Product Design Principles](#1-product-design-principles)
2. [Fintech Visual Direction](#2-fintech-visual-direction)
3. [Typography Hierarchy](#3-typography-hierarchy)
4. [Color Semantics](#4-color-semantics)
5. [Spacing System](#5-spacing-system)
6. [Border-Radius System](#6-border-radius-system)
7. [Shadow and Elevation System](#7-shadow-and-elevation-system)
8. [Page Layout Standards](#8-page-layout-standards)
9. [Card and Panel Standards](#9-card-and-panel-standards)
10. [Form and Input Standards](#10-form-and-input-standards)
11. [Button Hierarchy](#11-button-hierarchy)
12. [Data-Table Standards](#12-data-table-standards)
13. [Dashboard and Metric-Card Standards](#13-dashboard-and-metric-card-standards)
14. [Chart and Financial-Data Visualization Standards](#14-chart-and-financial-data-visualization-standards)
15. [Modal and Confirmation-Dialog Standards](#15-modal-and-confirmation-dialog-standards)
16. [Toast and Alert Standards](#16-toast-and-alert-standards)
17. [Tooltip and Popover Standards](#17-tooltip-and-popover-standards)
18. [Badge and Status-Indicator Standards](#18-badge-and-status-indicator-standards)
19. [Empty, Loading, Error, Offline, and Degraded States](#19-empty-loading-error-offline-and-degraded-states)
20. [Responsive Behavior](#20-responsive-behavior)
21. [Mobile Interaction Standards](#21-mobile-interaction-standards)
22. [Accessibility Requirements](#22-accessibility-requirements)
23. [Reduced-Motion Behavior](#23-reduced-motion-behavior)
24. [Financial-Risk Communication Rules](#24-financial-risk-communication-rules)
25. [Trading-Safety Wording Rules](#25-trading-safety-wording-rules)
26. [Reusable Component Expectations](#26-reusable-component-expectations)
27. [Design-Review Checklist](#27-design-review-checklist)
28. [Definition of Done for Frontend Work](#28-definition-of-done-for-frontend-work)

---

## 1. Product Design Principles

1. **Trust through clarity.** Every screen must communicate that this is a serious
   financial platform. Users are entrusting their trading capital to automated systems —
   the interface must reinforce confidence, not undermine it with amateur visuals.

2. **Safety is visible.** Risk gates, kill switches, broker-health checks, and trading-mode
   restrictions must be visually prominent. The user should always understand what is
   protected and what is not.

3. **Information hierarchy first.** The most important information (account status, risk
   limits, broker connection, trading readiness) must be visually dominant. Secondary
   information (timestamps, audit logs, settings) must be clearly subordinate.

4. **Consistency over creativity.** Every page must feel like part of one product. Reuse
   established components, tokens, and patterns. Do not invent new visual styles for
   individual pages.

5. **Restraint over decoration.** Subtle shadows, restrained transitions, and clean
   typography are preferred over gradients, glassmorphism, and animation. The platform
   must not feel like a casino or a demo template.

6. **Mobile is not an afterthought.** Every screen must be intentionally designed for
   360px viewports — not merely a compressed desktop layout.

7. **Accessibility is not optional.** Keyboard navigation, screen-reader support, contrast,
   and touch targets are required from the first commit, not deferred to a separate task.

---

## 2. Fintech Visual Direction

### Dark theme (primary)
iRexPro uses a dark theme with deep slate backgrounds and a teal brand accent.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0a0e1a` | Page background |
| `--bg-elevated` | `#111827` | Sidebar, header |
| `--bg-card` | `#151c2c` | Cards, panels |
| `--bg-input` | `#1a2236` | Input fields |
| `--brand` | `#0d9488` | Primary brand (teal) |
| `--brand-dark` | `#0f766e` | Hover/active states |
| `--brand-light` | `#14b8a6` | Accents, links |
| `--text` | `#e8edf5` | Primary text |
| `--text-secondary` | `#9ba8c4` | Secondary text |
| `--text-muted` | `#6b7693` | Muted/helper text |

### What to avoid
- **No indigo or blue** as primary colors (project rule — teal is the brand)
- **No neon** casino-style visuals
- **No excessive gradients** — use `--brand-gradient` sparingly for primary buttons only
- **No excessive glassmorphism** — solid surfaces with subtle tints are preferred
- **No aggressive profit-focused messaging** — trading involves risk

---

## 3. Typography Hierarchy

| Element | Size | Weight | Usage |
|---------|------|--------|-------|
| Page title (h1) | `1.75rem` (28px) | 700 | Dashboard, onboarding step titles |
| Section title (h2) | `1.3rem` (21px) | 600 | Card titles, section headers |
| Card title | `1.1rem` (18px) | 600 | Individual card headers |
| Body | `1rem` (16px) | 400 | Default text |
| Small | `0.85rem` (14px) | 400 | Helper text, badges, labels |
| Mono | `0.9em` | 400 | Account IDs, UUIDs, amounts |

**Font family:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
**Mono:** `'JetBrains Mono', 'Fira Code', monospace`

Rules:
- Use `letter-spacing: -0.02em` on large headings for a premium feel
- Use `tabular-nums` on financial figures for alignment
- Never use font sizes below `0.8rem` (13px) for readable text
- Labels must be visible — do not use placeholders as a substitute for labels

---

## 4. Color Semantics

| Semantic | Token | Usage |
|----------|-------|-------|
| Success | `--success: #10b981` | Connected, saved, active |
| Error | `--error: #ef4444` | Failed, invalid, disconnected |
| Warning | `--warning: #f59e0b` | Stale, pending, needs attention |
| Info | brand-light `#14b8a6` | Informational, brand accent |

Rules:
- Color is never the only indicator of status — always include an icon or text label
- Error states use `--error` border + `--error-bg` background tint
- Warning states use `--warning` border + `--warning-bg` background tint
- Success states use `--success` border + `--success-bg` background tint
- Destructive actions use `--error` gradient on the confirm button

---

## 5. Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | `0.25rem` (4px) | Tight gaps, icon spacing |
| `--space-2` | `0.5rem` (8px) | Small gaps, badge padding |
| `--space-3` | `0.75rem` (12px) | Input padding, list item gaps |
| `--space-4` | `1rem` (16px) | Card padding (mobile), form field gaps |
| `--space-6` | `1.5rem` (24px) | Card padding (desktop), section gaps |
| `--space-8` | `2rem` (32px) | Page section gaps |
| `--space-12` | `3rem` (48px) | Page-level vertical rhythm |

Rules:
- Card padding: `--space-6` on desktop, `--space-4` on mobile
- Form field gaps: `--space-4` between fields, `--space-6` between sections
- Page padding: `--space-8` on desktop, `--space-4` on mobile

---

## 6. Border-Radius System

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `6px` | Badges, small controls |
| `--radius-md` | `10px` | Inputs, buttons, tooltips |
| `--radius-lg` | `14px` | Cards, panels |
| `--radius-xl` | `20px` | Modals, large panels |
| `--radius-full` | `9999px` | Pills, avatars |

Rules:
- All elements of the same type must use the same radius
- Do not mix radii within a single component
- Inputs and buttons use `--radius-md`; cards use `--radius-lg`

---

## 7. Shadow and Elevation System

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` | Flat elements, badges |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.3)` | Dropdowns, tooltips |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.4)` | Popovers, sticky elements |
| `--shadow-xl` | `0 12px 40px rgba(0,0,0,0.5)` | Modals, top-level overlays |
| `--shadow-card` | `0 2px 8px rgba(0,0,0,0.2), inset 0 0 1px rgba(255,255,255,0.05)` | Default card |
| `--shadow-card-hover` | `0 8px 24px rgba(0,0,0,0.3), inset 0 0 1px rgba(255,255,255,0.08)` | Hoverable card |
| `--shadow-glow` | `0 0 20px rgba(13, 148, 136, 0.15)` | Brand accent glow |

Rules:
- Cards use `--shadow-card` by default, `--shadow-card-hover` on hover
- Modals use `--shadow-xl`
- Dropdowns use `--shadow-md` or `--shadow-lg`
- Shadows must be subtle — this is not a neumorphism design

---

## 8. Page Layout Standards

### Authenticated pages
- Use `DashboardShell` component (sidebar + header + content area)
- Content area: `--space-8` padding on desktop, `--space-4` on mobile
- Page title (h1) at top, followed by optional supporting description
- Content organized in cards or grid sections

### Onboarding pages
- Step badge (e.g. "Step 1 of 3") + page title + description
- Single-column form (max-width 640px) centered or left-aligned
- Form sections grouped with dividers
- Primary action button at the bottom

### Auth pages (login, register, forgot/reset password)
- Split-screen layout (brand panel left, form right)
- No sidebar, no navigation
- Form centered in the right panel

---

## 9. Card and Panel Standards

### Standard card
```css
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-card);
}
```

### Card with title
- `.card__title` (h2): `1.1rem`, weight 600, margin-bottom `--space-3`
- `.card__subtitle`: `0.95rem`, color `--text-secondary`, margin-bottom `--space-4`

### Hoverable card
- Add `data-hoverable` or `.is-interactive` attribute
- Hover applies `--shadow-card-hover` and subtle border color change
- Transition: `--transition-normal` (250ms)

### Form sections within cards
- `.form-section`: groups related fields
- `.form-section__divider`: subtle `1px solid var(--border-soft)` between sections
- `.form-section__title`: `0.95rem`, weight 600, color `--text-secondary`

---

## 10. Form and Input Standards

### Labels
- Always use a visible `<label>` — never rely on placeholders alone
- Label: `0.85rem`, weight 500, color `--text-secondary`, margin-bottom `--space-2`
- Required indicator: `*` in `--error` color

### Inputs
```css
.input {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  color: var(--text);
  font-size: 0.95rem;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.input:focus {
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}
.input--error {
  border-color: var(--error);
  box-shadow: var(--focus-ring-error);
}
```

### Helper text
- `.helper-text`: `0.8rem`, color `--text-muted`, margin-top `--space-1`
- Use for format hints (e.g. "2-letter ISO code"), not for long explanations

### Error messages
- Field-level: below the input, `0.8rem`, color `--error`
- Linked via `aria-describedby` to the input

### Select controls
- Styled with custom chevron (background SVG)
- Same padding/border/radius as `.input`
- For complex selections (timezone, country), use a custom combobox component

### Checkboxes
- Minimum 18×18px touch target
- `accentColor: var(--brand)` or custom styled
- Label to the right, vertically centered

---

## 11. Button Hierarchy

| Variant | Usage | Style |
|---------|-------|-------|
| `.btn--primary` | Main action (Save, Start, Create) | `--brand-gradient`, white text, glow on hover |
| `.btn--secondary` | Alternative action (Cancel, Back) | `--bg-input` background, `--border` border, `--text` color |
| `.btn--ghost` | Tertiary action (Skip, Dismiss) | Transparent background, `--text-secondary` color |
| `.btn--danger` | Destructive action (Delete, Disconnect) | `--error` gradient, white text |
| `.btn--warning` | Caution action | `--warning` gradient, dark text |

### Button states
- **Hover**: brightness(1.1) + `--shadow-glow` (primary), border-color change (secondary)
- **Active**: `scale(0.98)` — subtle press feedback
- **Disabled**: `opacity: 0.6`, `cursor: not-allowed`, `pointer-events: none`
- **Loading**: spinner + action-specific text ("Saving…", "Testing…", "Connecting…")
- **Focus**: `--focus-ring` (3px teal ring)

### Button sizes
| Size | Padding | Font | Usage |
|------|---------|------|-------|
| `btn--sm` | `--space-2 --space-4` | `0.8rem` | Inline actions, table actions |
| `btn--md` (default) | `--space-3 --space-6` | `0.9rem` | Form actions |
| `btn--lg` | `--space-4 --space-8` | `1rem` | Primary page action |
| `btn--block` | width: 100% | — | Full-width (mobile) |

Rules:
- Only ONE primary button per section
- Destructive buttons must use `btn--danger`
- Loading state must disable the button and prevent duplicate submission
- Action-specific text is required (not just "Loading…")

---

## 12. Data-Table Standards

- Premium card container with `--shadow-card`
- Header row: `--bg-elevated` background, `0.8rem` weight 600, `--text-secondary` color
- Body rows: alternating subtle tint (`rgba(255,255,255,0.02)`)
- Row hover: `rgba(255,255,255,0.04)` background
- Cell padding: `--space-3 --space-4`
- Border: `1px solid var(--border)` between rows
- Financial figures: `tabular-nums`, right-aligned
- Status columns: use `<Badge>` component
- Empty state: centered icon + message in the table body
- Loading state: skeleton rows (not spinners)
- Responsive: horizontal scroll with `overflow-x: auto` (last resort — prefer card layout on mobile)

---

## 13. Dashboard and Metric-Card Standards

### Metric cards
- `.stat-grid`: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))`, gap `--space-4`
- `.stat-card`: premium card with `--shadow-card`
- `.stat-card__icon`: 48×48px container, rounded, subtle brand tint background
- `.stat-card__label`: `0.8rem`, uppercase, `--text-muted`, letter-spacing `0.05em`
- `.stat-card__value`: `1.75rem`, weight 700, `tabular-nums`
- Optional delta indicator: green up arrow / red down arrow

### Dashboard layout
- Page header with user name and welcome message
- Primary metric row (3-4 cards)
- Secondary content row (onboarding checklist, recent activity)
- Trading-session controls prominently placed but not aggressive
- All cards must handle empty/loading/error states

---

## 14. Chart and Financial-Data Visualization Standards

- Use a charting library that supports dark themes (Recharts, ECharts, or similar)
- Background: transparent or `--bg-card`
- Grid lines: `rgba(255,255,255,0.05)`
- Axis labels: `0.8rem`, `--text-muted`
- Brand color for primary series: `--brand-light`
- Semantic colors: `--success` for profit, `--error` for loss
- Tooltip: premium panel with `--shadow-lg`, `--bg-elevated`, `--radius-md`
- Loading state: skeleton chart (gray rectangular placeholder)
- Empty state: "No data available" with icon
- Responsive: chart container must have a min-height and resize on viewport change
- Never display misleading y-axis scales (always start from 0 for bar charts)

---

## 15. Modal and Confirmation-Dialog Standards

### Structure
- Overlay: `position: fixed`, `inset: 0`, `background: rgba(0,0,0,0.6)`, `backdrop-filter: blur(4px)`
- Panel: centered, `max-width: 480px`, `--bg-card`, `--radius-xl`, `--shadow-xl`
- Title (h2): `1.3rem`, weight 600
- Description (p): `0.95rem`, `--text-secondary`
- Action area: Cancel (left, secondary) + Confirm (right, danger/warning/primary)

### Behavior
- Focus moves to Cancel button on open (first safe action)
- Focus trap: Tab/Shift+Tab cycle within modal
- Escape closes (calls onCancel)
- Overlay click closes (calls onCancel)
- Body scroll locked while open
- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title id

### Destructive actions
- Must make the affected resource clear (e.g. "Delete broker connection 'Paper Trading Broker'?")
- Confirm button uses `btn--danger` with warning icon
- Loading state on confirm button while operation runs
- No browser `alert()` or `confirm()`

---

## 16. Toast and Alert Standards

### Toasts (transient feedback)
- Success: 4s, `aria-live="polite"`, green accent, checkmark icon
- Error: 8s, `role="alert"`, red accent, x-circle icon
- Warning: 6s, `aria-live="polite"`, amber accent, alert-triangle icon
- Info: 5s, `aria-live="polite"`, brand accent, info-circle icon
- Position: top-right on desktop, top on mobile (safe margins)
- Close button on each toast
- Must not cover navigation, buttons, or important financial information
- Never expose raw backend errors, SQL, stack traces, or credentials

### Inline alerts (persistent information)
- Use for: multi-field validation errors, readiness summaries, page-level failures
- 3px left accent bar (`::before` pseudo-element)
- Background tint (semantic color at 10% opacity)
- Border: 1px solid semantic color at 30% opacity
- Must scroll into view when triggered by a user action
- `role="alert"` for errors, no special role for info

### When to use which
- **Toast**: CRUD success/failure, test results, connection status changes
- **Inline alert**: validation errors that persist, readiness status, important warnings

---

## 17. Tooltip and Popover Standards

### InfoTooltip component
- Trigger: info-circle icon (16×16px, `currentColor`)
- Opens on: hover AND keyboard focus AND tap/click (not hover-only)
- Closes on: Escape, blur, click-outside
- Panel: `--bg-elevated`, `--border`, `--radius-md`, `--shadow-lg`, `max-width: 320px`
- `role="tooltip"`, `aria-describedby` on trigger
- Content: `0.85rem`, `line-height: 1.5`, `--text` color
- Must not clip inside cards or overflow containers
- Flips above/below based on viewport position
- On mobile: use a touch-friendly popover (not hover)

---

## 18. Badge and Status-Indicator Standards

### Badge component
- Pill shape (`--radius-full`)
- Padding: `--space-1 --space-3`
- Font: `0.75rem`, weight 600, uppercase, letter-spacing `0.03em`
- Variants: success (green), error (red), warning (amber), info (brand)

### Status indicators
| Status | Badge | Icon | Color |
|--------|-------|------|-------|
| Active/Connected | success | ✅ | `--success` |
| Disconnected | error | ❌ | `--error` |
| Pending/Testing | warning | ⏳ | `--warning` |
| Suspended | warning | ⚠️ | `--warning` |
| Closed/Failed | error | 🔴 | `--error` |
| None | info | — | `--text-muted` |

Rules:
- Color is never the only indicator — always include text
- Status must be readable at a glance

---

## 19. Empty, Loading, Error, Offline, and Degraded States

Every data-driven component must handle these states:

| State | Visual | Content |
|-------|--------|---------|
| **Initial loading** | Skeleton placeholder (gray blocks) | No text needed |
| **Background refresh** | Subtle spinner or no visual change | No toast (silent) |
| **Empty data** | Centered icon + title + description + CTA | "No broker connections yet. Create your first connection below." |
| **Populated data** | Normal layout | — |
| **Search with results** | Filtered list | Result count |
| **Search with no results** | Empty state with search context | "No timezones found for '{query}'" |
| **Validation failure** | Field-level error + inline alert | Actionable message |
| **API failure** | Error toast + inline alert if persistent | Safe mapped message (via `mapApiError`) |
| **Network failure** | Error toast | "Unable to reach the server. Please check your connection." |
| **Offline** | Banner at top of page | "You appear to be offline. Some data may be stale." |
| **Degraded broker** | Warning badge + inline alert | "Broker health check is outdated. Test your connection." |
| **Success** | Success toast | "Profile updated successfully." |
| **Warning** | Warning toast or inline alert | Actionable warning message |
| **Disabled** | Grayed out element + tooltip | Explanation of why |
| **Read-only** | No border, muted text | — |
| **Permission denied** | Inline alert (error variant) | "You don't have permission to perform this action." |
| **Confirmation pending** | ConfirmDialog modal | Clear consequences |
| **Action in progress** | Button loading state | Action-specific text |
| **Completed action** | Success toast | Action-specific message |

**Do not leave these states as unstyled text or raw backend responses.**

---

## 20. Responsive Behavior

### Breakpoints
| Width | Behavior |
|-------|----------|
| 360px | Single column, full-width buttons, 15px root font, stacked forms, safe toast width |
| 390px | Same as 360px |
| 768px | 2-column grids where appropriate, sidebar visible |
| 1024px | Multi-column layouts, toasts top-right |
| 1440px | Full layout, generous spacing |

### Rules
- No horizontal scrolling at any breakpoint
- Mobile layouts must be intentionally designed, not compressed desktop
- Touch targets minimum 44×44px
- Tooltips flip below on mobile if they would overflow the top
- Modals fit small screens (max-width: calc(100vw - 32px))
- Toasts don't cover navigation on mobile
- Long text wraps with `overflow-wrap: anywhere`

---

## 21. Mobile Interaction Standards

- **No hover-only interactions.** Every hover state must have a tap/click equivalent.
- **Touch targets ≥ 44px.** Buttons, links, checkboxes, radio options.
- **Bottom sheets** for complex selections on mobile (preferred over dropdowns).
- **Swipe to dismiss** for toasts (optional enhancement).
- **Sticky action bars** for forms with long content (save button visible at bottom).
- **No desktop-only drag interactions** without a mobile alternative.
- **Pull-to-refresh** for dashboards (optional enhancement).

---

## 22. Accessibility Requirements

| Requirement | Implementation |
|-------------|----------------|
| Visible keyboard focus | `:focus-visible` with `--focus-ring` (3px teal ring) |
| Semantic headings | h1 → h2 → h3 hierarchy, no skipped levels |
| Proper labels | `<label>` for all inputs, `aria-label` for icon buttons |
| ARIA attributes | `role`, `aria-expanded`, `aria-checked`, `aria-modal`, `aria-live`, `aria-describedby` |
| Screen-reader errors | `role="alert"` for error toasts, `aria-describedby` linking errors to inputs |
| Accessible tooltips | Open on focus + click, close on Escape, `role="tooltip"` |
| Accessible dialogs | Focus trap, Escape close, `aria-modal="true"`, focus restoration |
| Sufficient contrast | WCAG AA minimum (4.5:1 for body text, 3:1 for large text) |
| Touch-friendly targets | Minimum 44×44px |
| Focus trapping | Tab/Shift+Tab cycle within modals |
| Focus restoration | Focus returns to triggering element after dialog closes |
| Color-independent status | Icons + text + color (never color alone) |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` — zero animations |

**Accessibility must not be postponed as a separate task.**

---

## 23. Reduced-Motion Behavior

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- Disable card hover lift (shadow change only, no transform)
- Disable button scale on active
- Calm spinner (slower rotation or static indicator)
- Disable toast slide-in (fade only)
- Disable modal pop animation (fade only)

---

## 24. Financial-Risk Communication Rules

1. **Never present trading as risk-free.** Every screen that mentions trading must
   acknowledge that losses are possible.

2. **Never imply guaranteed profit.** No "earn money while you sleep" messaging.
   No green upward arrows without context.

3. **Never use casino-style visuals.** No neon, no flashing, no slot-machine animations,
   no confetti, no "jackpot" styling.

4. **Clearly distinguish AI signals from execution.** The user must understand that:
   - AI produces a strategy signal
   - The signal passes through the mandatory risk gate
   - Execution controls validate the action
   - Broker-health and permissions are checked
   - The execution service submits approved instructions through the broker adapter
   - **The AI engine does not directly place broker orders**

5. **Use warning and danger styles responsibly.** Warnings should inform, not alarm.
   Danger styling is for destructive actions, not for general risk information.

6. **Do not make live trading visually easier to activate than paper trading.**
   Paper mode should be the default and visually prominent. Live/full-auto mode
   requires explicit acknowledgment and separate broker enablement.

7. **Present destructive actions with confirmation.** Delete, disconnect, cancel
   subscription — all require a ConfirmDialog with clear consequences.

8. **Risk acknowledgement is mandatory.** The checkbox must be visually distinct
   (warning panel) and cannot be bypassed.

---

## 25. Trading-Safety Wording Rules

### Approved wording
- "Full auto — approved automation executes after all safety checks"
- "Trading actions may be submitted automatically only after the strategy signal
  passes the mandatory risk gate, execution controls, broker-health checks, user
  permissions, and live-trading authorization."
- "The AI engine does not directly place broker orders."
- "Trading involves risk of loss. Past performance does not guarantee future results."
- "Profits are not guaranteed."

### Prohibited wording
- ❌ "Full auto — AI executes automatically" (implies direct AI execution)
- ❌ "Guaranteed returns" or "risk-free trading"
- ❌ "Earn money while you sleep"
- ❌ "The AI will trade for you" (implies direct AI execution)
- ❌ "Automatic wealth" or "passive income guaranteed"

### Safety chain (must be preserved in all documentation and UI)
```
AI signal → mandatory risk gate → execution controls → broker-health and permission checks → execution service → broker adapter
```

---

## 26. Reusable Component Expectations

Before adding page-specific styling, determine whether the feature should improve or
introduce a reusable component.

### Existing reusable components
| Component | Location | Usage |
|-----------|----------|-------|
| `Button` | `components/ui/index.tsx` | All actions |
| `Card` | `components/ui/index.tsx` | Content containers |
| `Input` | `components/ui/index.tsx` | Form fields |
| `Alert` | `components/ui/index.tsx` | Inline messages |
| `Badge` | `components/ui/index.tsx` | Status indicators |
| `EmptyState` | `components/ui/index.tsx` | Empty data states |
| `LoadingSpinner` | `components/ui/index.tsx` | Loading indicators |
| `AuthLayout` | `components/ui/index.tsx` | Auth page layout |
| `DashboardShell` | `components/ui/index.tsx` | Authenticated page layout |
| `TimezoneSelect` | `components/forms/TimezoneSelect.tsx` | Timezone selection |
| `InfoTooltip` | `components/ui/InfoTooltip.tsx` | Explanatory tooltips |
| `ConfirmDialog` | `components/notifications/ConfirmDialog.tsx` | Confirmation modals |
| `NotificationProvider` | `components/notifications/NotificationProvider.tsx` | Toast notifications |
| `useNotification` | `hooks/useNotification.ts` | Notification hook |
| `mapApiError` | `lib/error-mapping.ts` | API error → safe message |

### Rules
- Do not duplicate components or visual patterns across pages
- If a pattern appears on 2+ pages, extract it into a reusable component
- All reusable components must be documented in this section
- New components must follow the design tokens defined in this document

---

## 27. Design-Review Checklist

Before declaring a frontend task complete, verify:

- [ ] Page title (h1) and supporting description are present
- [ ] Form fields have visible labels (not just placeholders)
- [ ] Helper text is present where needed
- [ ] All buttons have action-specific loading text
- [ ] Primary action is visually distinct (only one primary per section)
- [ ] Destructive actions use ConfirmDialog
- [ ] Success/failure uses toast notifications
- [ ] Validation errors use inline alerts + field-level messages
- [ ] Empty state has icon + message + CTA
- [ ] Loading state uses skeleton or spinner
- [ ] Error state shows safe mapped message (no raw backend errors)
- [ ] Status badges use correct semantic colors + text
- [ ] Tooltips open on hover + focus + click
- [ ] All interactive elements have focus rings
- [ ] No horizontal scroll at 360px
- [ ] Mobile layout is intentionally designed
- [ ] ARIA attributes are correct
- [ ] Reduced-motion is respected
- [ ] No casino-style visuals or prohibited wording
- [ ] Safety wording is correct (AI → risk gate → execution → broker)
- [ ] No credentials, tokens, or secrets are exposed
- [ ] No browser `alert()` or `confirm()`

---

## 28. Definition of Done for Frontend Work

No frontend page or component should be reported as complete unless:

1. **Business logic works** — API calls, state management, error handling function correctly
2. **The interface is professionally designed** — follows this design system document
3. **Shared components are reused** — no duplicated patterns
4. **All applicable states are handled** — loading, empty, error, success, warning, disabled
5. **Responsive behavior is verified** — 360px, 390px, 768px, 1024px, 1440px
6. **Accessibility is verified** — keyboard, screen reader, contrast, ARIA
7. **Safety wording is correct** — no prohibited language, safety chain preserved
8. **Raw errors and secrets are never exposed** — mapApiError used, no SQL/stack/credentials
9. **Tests and production builds pass** — `pnpm test`, `pnpm build`, `tsc --noEmit`
10. **The final report includes UI/UX verification** — design-review checklist completed

---

## Mandatory Implementation Workflow

For every subsequent frontend task:

1. **Review this document** before starting any UI work
2. **Inspect existing shared components** before creating new ones
3. **Reuse established design tokens and primitives** — do not invent new styles
4. **Design all relevant states** before declaring the page complete
5. **Verify desktop, tablet, and mobile layouts** at 360/390/768/1024/1440px
6. **Verify keyboard and screen-reader behavior**
7. **Test all states**: loading, empty, success, warning, error, disabled, offline, degraded
8. **Ensure the page looks cohesive** with previously completed iRexPro screens
9. **Run tests, type checks, and production builds**
10. **Report UI/UX verification** in the final feature report using the design-review checklist

---

*This document is the single source of truth for iRexPro UI/UX standards. All AI agents,
engineers, and contributors must follow it. Violations are design defects that must be
corrected before merge.*
