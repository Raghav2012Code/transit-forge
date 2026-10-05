# TransitForge design system

Durable record of the UI direction. Tokens live in `src/index.css`; shell and
component styles in `src/App.css`. When the two ever disagree, this file wins.

## Discovery

- **Artifact** — a real-time 3D city simulation sandbox: build a network, run a
  simulated day, break it, plan against objectives. Tool-density beats
  marketing-airiness; the player is a planner who reads numbers under pressure.
- **Who / why** — a curious non-expert (or a transport nerd) who wants to
  *believe* the numbers. Every figure must trace back to simulation state.
- **Words** — institutional, legible, surveyed, plainspoken.
- **Essence** — *transit authority*. The tools a real agency's planning
  department would use, not a dashboard about transit.

## Aesthetic commitment

Signage-grade light chrome wrapped around a recessed dark map plate, the way a
planning report sets a figure into a page. Paper and ink carry the interface;
the map is the only dark region, bordered and inset so it reads as a deliberate
plate rather than a hole.

The vernacular is transit wayfinding: route bullets, line colours, tabular
timetable figures, plain institutional language.

Explicitly avoided: a dark dashboard with one neon accent, glassmorphism on
chrome, gradient decoration, all-caps tracked eyebrow labels, meta strings
joined with middle dots, monospace used as a texture for data, arrow glyphs
stapled to buttons.

## The governing rule

**Colour only ever means a line or a condition. Selection is ink.**

A blue chip is the blue line. An amber value is a reading that needs watching.
Nothing is coloured to say "this control is active" — the selected state is a
solid ink fill, every time. This is what keeps a dense instrument panel from
turning into a wall of competing accents, and it is the rule to check any new
component against.

## Signature move

**The route bullet.** Every reference to a line anywhere in the interface — a
table row, a bottleneck list, a selection card — is the same capsule you would
read off a platform sign: the line's code set in its own colour. Bullet text
flips from white to ink on light lines, the way a yellow line's bullet is set
in black on a real sign (`ui/shell/RouteBullet.tsx` picks it by luminance).

## Typography

One family, two widths — a signage system, not a font pairing.

- **Barlow** — interface, labels, headings. A grotesque descended from
  California highway signage, so the lineage matches the subject.
- **Barlow Semi Condensed** — every figure, table column, and the status strip.
  Condensed numerals are what timetables are actually set in, and they let dense
  tables hold more without shrinking.
- Scale off a 13px body: 11 / 12 / 13 / 15 / 18 / 24 / 30px.
- Numerals are always `font-variant-numeric: tabular-nums`; figures are
  right-aligned, labels left-aligned.
- Headings are sentence case. No tracked-out all-caps eyebrows anywhere.

## Colour

| Role | Token | Value |
| --- | --- | --- |
| Chrome | `--paper` | `oklch(95.2% 0.004 250)` |
| Raised | `--paper-raised` | `#fff` |
| Sunken | `--paper-sunken` | `oklch(92.4% 0.005 250)` |
| Map plate | `--plate` / `--plate-deep` | `oklch(18% 0.012 250)` / `oklch(14.5% 0.012 250)` |
| Text / selected | `--ink` / `--ink-strong` | `oklch(21% 0.008 250)` / `oklch(14% 0.008 250)` |
| Secondary text | `--ink-soft` / `--ink-faint` | `oklch(44% 0.009 250)` / `oklch(58% 0.008 250)` |
| Rules | `--rule` | `oklch(86% 0.006 250)` |

Line colours — shared verbatim with the 3D scene (`transport/network.ts`) so a
bullet in the rail is the same colour as its line on the map. Mid-tone on
purpose: legible on the dark plate, dark enough to carry white bullet text on
paper.

`--line-blue #1b6fc4` · `--line-green #0e7a52` · `--line-red #c0392f` ·
`--line-amber #e0a21a` · `--line-violet #6d4bb8` · `--line-rose #c14b78`

Status colours mean a condition only: `--ok`, `--watch`, `--alert`.

## Spacing, radius, elevation

- Spacing base 4px: `--s-1` 2 → `--s-8` 28.
- Radius: `--r-sm` 2px, `--r-md` 4px, and `--r-bullet` for capsules. Tight,
  because signage is tight.
- Elevation is for things that genuinely float (selection card, toasts, search,
  context menu). In-panel surfaces are separated by rules, never by shadow.

## Layout

`masthead (54px) → map plate + rail → status strip`

- **Masthead** — three regions: brand, mode switch centred, transport controls
  and map tools right. Paper, with a single bottom rule.
- **Map plate** — the dark figure. Floating on it: mode chips (top-left), the
  navigation cluster and minimap as one aligned column (top-right), the legend
  (bottom-right), the selection card (bottom-left), the control hint and the
  status strip along the bottom. Everything on the plate is dark, because the
  plate is.
- **Rail** — a document column, not a stack of cards. Sections are separated by
  rules and space. In simulate mode it is tabbed by task (Map, Network, Service,
  Analysis, Growth) so reading the network never means scrolling past the fare
  table to reach the growth forecast. Switching mode or task returns the rail to
  the top.

## Craft layer

- **Components** — every control ships default/hover/active/focus/disabled.
  Buttons are ranked by what they do: ink fill for the one committing action per
  panel, quiet outline for the rest, and the alert colour only for destructive
  confirmations. Segmented groups are real `radiogroup`s with `aria-checked`, so
  state is never colour-only.
- **Motion** — opacity/transform only, 90/140/220ms, `cubic-bezier(.2,.8,.25,1)`,
  disabled under `prefers-reduced-motion`. Toasts slide in once; panels fade;
  nothing loops and nothing animates a live number.
- **Iconography** — one hand-drawn set in `ui/shell/icons.tsx`: 16px grid, 1.5
  stroke, round caps, `currentColor`. No icon library.
- **Copy** — plain sentences. Hints read "Drag to orbit, right-drag to pan," not
  dot-joined fragments. Empty states say what is true and what to do next.
- **Light only** — designed for a lit room; the map carries the darkness.

## Accessibility

- Visible focus ring on every interactive element (2px ink, 1px offset).
- All numerals tabular; state signalled by shape and fill as well as colour.
- Segmented controls expose `aria-checked`, rail tabs are a real
  `tablist`/`tab`/`tabpanel`, docks expose `aria-expanded`, the status strip is
  `aria-live="off"` because it changes every tick.
- Bullet text contrast is computed per line colour rather than assumed.
- Every interactive target is ≥ 24px tall; most are 28px.

## Known rough edges

- The map labels drawn into the 3D scene are canvas sprites, so they don't
  inherit the type system — they're the one surface still set in the system
  sans rather than Barlow.
- Build and disrupt rails are still single scrolls; only simulate mode is
  tabbed. They're short enough today, but the same treatment applies when they
  grow.
