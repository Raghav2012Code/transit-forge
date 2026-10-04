# TransitForge design system

Durable record of the UI direction. Tokens live in `src/index.css`; shell and
component styles in `src/App.css`. When the two ever disagree, this file wins.

## Discovery

- **Artifact** — a real-time 3D city simulation sandbox: build a network, run a
  simulated day, break it, plan against objectives. Tool-density beats
  marketing-airiness; the player is a planner who reads numbers under pressure.
- **Who / why** — a curious non-expert (or a transport nerd) who wants to
  *believe* the numbers. Every figure must trace back to simulation state.
- **Words** — instrumented, tactile, coastal, authoritative, precise.
- **Essence** — *control room*. Instrumentation, not decoration.

## Aesthetic commitment

A coastal control-room console: deep ink-navy surfaces, hairline luminous edges,
one sharp signal-cyan accent, amber/red reserved for pressure. Elevation is
lightness plus a 1px inset top highlight — never a diffuse drop shadow on
in-panel elements (shadows are reserved for floating layers: HUD chips, toasts,
the selection card, popovers).

Explicitly avoided: indigo/violet gradients, glassmorphism, blob rounding
(max radius 6px), glow-for-glow's-sake, gradient text, animated layout
properties.

## Signature move

**The tick meter.** Progress and load are shown as discrete segments (12 blocks
that fill like a line-diagram), never a smooth bar. It appears in KPI tiles,
objective progress, and problem severity, so the whole app shares one read-out
language. Paired with the viewport's corner brackets and mono-caps section
labels, it is what makes the console recognisable.

## Typography

- UI: **Space Grotesk** (Google Fonts) — geometric with a technical quirk;
  used for headings, buttons, labels.
- Data: **IBM Plex Mono** — every number, unit, clock and section label.
  Fallbacks stay on the system stack so an offline load still reads correctly.
- Scale (ratio ≈ 1.2 off a 13px body): 10 / 11 / 12 / 13 / 15 / 18 / 22 / 30px.
- Section labels are mono, 10px, uppercase, `0.1em` tracked — instrument
  labelling, not website navigation.
- Numerals are always `font-variant-numeric: tabular-nums`; tables are
  right-aligned, labels left-aligned.

## Colour

Authored in OKLCH so lightness steps stay perceptually even.

| Role | Token | Value |
| --- | --- | --- |
| Backdrop | `--bg` | `oklch(14% 0.02 256)` |
| Rail surface | `--surface-0` | `oklch(17.5% 0.021 256)` |
| Card | `--surface-1` | `oklch(21% 0.023 256)` |
| Raised / hover | `--surface-2` | `oklch(25% 0.025 256)` |
| Sunken (inputs) | `--surface-sunken` | `oklch(12.5% 0.019 258)` |
| Hairline | `--hairline` | `oklch(30% 0.028 256)` |
| Text | `--text` | `oklch(93% 0.008 250)` |
| Muted | `--muted` | `oklch(67% 0.024 252)` |
| Faint (labels) | `--faint` | `oklch(54% 0.022 252)` |
| Signal (accent) | `--signal` | `oklch(80% 0.13 205)` |
| Good / warn / bad | `--good` `--warn` `--bad` | `oklch(78% 0.16 155)` / `oklch(82% 0.15 78)` / `oklch(68% 0.19 22)` |

Distribution ≈ 70% ink surfaces, 25% text/hairlines, 5% signal. The accent is
never used for decoration — only for the active control, the primary action, the
section tick, and live read-outs. Transport-mode colours (`--mode-metro`,
`--mode-rail`, `--mode-bus`, `--mode-road`) are pinned to the 3D scene's palette
so the legend always matches what is rendered.

## Spacing, radius, shadow

- Spacing base 4px: `--s-1` 2 → `--s-8` 28. Tight inside a group (4–8), airy
  between sections (12–20).
- Radius: only two values — `--r-sm` 3px (controls, rows) and `--r-md` 6px
  (cards, panels). No blob rounding.
- Shadow: defined edge by default (hairline + inset top highlight). One shadow
  token exists, `--shadow-float`, used only by floating layers.

## Layout

`HUD bar (56px) → stage → rail (356px)`.

- **HUD bar** — brand lockup with seed, four-mode segmented switch, transport
  controls, clock, panel toggle. Rail hides under 1180px via `[` / `]`.
- **Stage** — the 3D canvas fills it. Over it float: corner brackets, a
  top-left chip stack (mode, active incidents, worst congestion), toasts
  (top-right), the overlay legend (bottom-right), the mode hint (bottom-centre),
  the selection card (bottom-left), and the status strip pinned to the bottom
  edge with always-on telemetry.
- **Rail** — stacked collapsible docks. Sections that are long or situational
  (Charts, Timeline, Resilience, Critical links, Saved plans, Shortcuts) start
  closed; the working set (Overview, Brief, Objectives) starts open.

## Craft layer

- **Components** — every control ships default/hover/active/focus/disabled.
  Buttons are ranked by importance, not colour: primary (signal fill) for the
  one committing action per panel, neutral for the rest, danger only for
  destructive confirmations. Segmented groups are real `radiogroup`s with
  `aria-checked`, so state is never colour-only (raised surface + border).
- **Motion** — opacity/transform only, 90/140/220ms, `cubic-bezier(.2,.8,.25,1)`,
  and fully disabled under `prefers-reduced-motion`. Toasts slide in once;
  panels fade; nothing loops, nothing bounces, nothing animates a live number.
- **Iconography** — one hand-drawn set in `ui/shell/icons.tsx`: 16px grid, 1.5
  stroke, round caps, `currentColor`. No icon library.
- **Empty states** — every dock that can be empty says so in plain language
  ("No incidents. The network is nominal.").
- **Dark mode only** — designed, not inverted; the app is a night-time console.

## Accessibility

- Visible focus ring on every interactive element (2px signal, 1px offset).
- All numerals tabular; state signalled by shape/border as well as colour.
- Segmented controls expose `aria-checked`; docks expose `aria-expanded`;
  checkboxes carry labels; the status strip is `aria-live="off"` (it changes
  every tick — announcements would be noise).
- Every interactive target is ≥ 24px tall; most are 28px.

## Slop audit (this pass)

- No violet/indigo gradients; palette is ink + one cyan accent + amber/red.
- No glassmorphism: HUD chips and toasts use blur *with* a solid 78–93% fill so
  text contrast holds.
- No hero/3-cards/testimonials structure; the layout is a tool.
- Shadows: one token, floating layers only — no hairline+diffuse stacking on the
  same in-panel element.
- Motion: transform/opacity only, all under 220ms, reduced-motion respected.
- Icons: one custom set, no third-party defaults.
- Distinctive type: Space Grotesk + IBM Plex Mono, not Inter/system.
- Known rough edge (accepted): the rail is a single scroll; docks mitigate it
  but a future pass could tab the rail by task.