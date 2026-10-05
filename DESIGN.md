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

Signage-grade light chrome around a light map plate, the way a planning report
sets a survey figure into a page. Paper and ink carry the interface and the
map alike: the city is drawn on pale ground in muted district tones, so the
only saturated things on screen are lines and conditions. The plate is bordered
and inset so it reads as a figure, not a hole.

The vernacular is transit wayfinding: route bullets, line colours, tabular
timetable figures, plain institutional language.

Explicitly avoided: a map whose theme differs from the page's (the two must agree), a dark dashboard with one neon accent, glassmorphism on
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
| Map plate | `--plate` / `--plate-deep` | `oklch(93% 0.005 250)` / `oklch(90% 0.006 250)` |
| Floating on the map | `--plate-surface` / `--plate-edge` | `oklch(100% 0 0 / 0.95)` / `oklch(80% 0.008 250)` |
| Text / selected | `--ink` / `--ink-strong` | `oklch(21% 0.008 250)` / `oklch(14% 0.008 250)` |
| Secondary text | `--ink-soft` / `--ink-faint` | `oklch(40% 0.009 250)` / `oklch(49% 0.008 250)` |
| Rules | `--rule` | `oklch(86% 0.006 250)` |

Line colours — shared verbatim with the 3D scene (`transport/network.ts`) so a
bullet in the rail is the same colour as its line on the map. Mid-tone on
purpose: legible on the pale plate, dark enough to carry white bullet text on
paper.

`--line-blue #1b6fc4` · `--line-green #0e7a52` · `--line-red #c0392f` ·
`--line-amber #e0a21a` · `--line-violet #6d4bb8` · `--line-rose #c14b78`

Status colours mean a condition only: `--ok`, `--watch`, `--alert`. Amber as text
uses `--watch-ink`, a darker ink, because the fill amber fails contrast on paper.
Every text token is held to 4.5:1 on paper, raised and sunken surfaces.

**Charts follow the same rule.** A plain series is ink; a second series on the
same subject is told apart by dash and a caption, not by hue; a reading that is
good or bad takes `--ok` or `--alert`. Palettes borrowed from a charting kit are
the fastest way to break the rule (`ui/analytics/seriesColors.ts`).

## Themes

Light and dark are one design with two sets of values. Every token keeps its
name and its role; `:root[data-theme='dark']` in `src/index.css` moves the
values and nothing else. A component never branches on theme.

- **Selection is still solid ink.** In dark, ink is the light colour and
  `--on-ink` the dark one, so every ink-filled control inverts by itself.
- **Line colours do not change.** They are mid-tone on purpose and carry white
  bullet text on either ground.
- **Text holds 4.5:1 in both.** Dark values: ink 90%, strong 97%, soft 74%,
  faint 62% lightness, measured on paper, raised, sunken and the map plate.
  Status tones are lighter in dark (`--ok`, `--watch-ink`, `--alert`).
- **The choice is the person's.** The first visit follows the operating system
  and keeps following it; the first explicit choice (the masthead button, or
  `T`) wins from then on: it is saved for future visits, and where storage is
  blocked it still holds for the rest of this visit rather than being undone
  when the system theme changes. An inline script in `index.html` sets the
  theme before first paint, so a dark visitor never sees a white flash.
- **Things that cannot use a token** — the minimap's SVG, the legend ramps, the
  marker swatches — read CSS custom properties (`--mm-*`, `--ramp-*`,
  `--mark-*`) that are set per theme beside the colour tokens.

## The map

The 3D scene is painted from `src/rendering/palette.ts`, which holds one palette
per theme. The light values are the sRGB of the CSS tokens above, so the canvas
edge and the page agree; the dark values are the original dark plate. Switching
theme rebuilds the scene with the other palette and carries the camera pose
across, so the view does not jump and the selection stays.

- **Ground and fabric** — land, roads, water and buildings are pale and
  desaturated. Districts differ by tint (blue CBD, green university, warm
  industrial), never by saturation, so a line colour is always the loudest
  thing in view.
- **Stations** are ink-toned: dark slate, with interchanges darker still.
- **Overlay ramps run pale to deep.** Little is a pale tint and a lot is a deep
  one (navy, deep green), because a ramp that ends in white vanishes on pale
  ground. Condition ramps (green, amber, red) are unchanged. Legends in
  `ui/shell/Legend.tsx` mirror these exactly.
- **Emphasis darkens; it does not glow.** A busier route shifts toward ink and
  a deselected route fades toward the ground. Emissive boosts that read well on
  a dark scene wash a pale one out.
- **Markers** use the deepened amber and the line blue (`MARK`), which hold
  contrast on pale ground where the old yellow and light blue did not.
- **Labels** are white pills with ink text and a thin accent edge.

## Spacing, radius, elevation

- Spacing base 4px: `--s-1` 2 → `--s-8` 28.
- Radius: `--r-sm` 2px, `--r-md` 4px, and `--r-bullet` for capsules. Tight,
  because signage is tight.
- Elevation is for things that genuinely float (selection card, toasts, search,
  context menu). In-panel surfaces are separated by rules, never by shadow.

## Layout

`masthead (54px) → map plate + rail → status strip`

- **Masthead** — three regions: brand, mode switch centred, transport controls
  and map tools right. The tools (search, measure, inspect, side panel) sit in
  one group set apart by a rule, the way the clock is. Paper, with a single
  bottom rule.
- **Map plate** — the light figure. Floating on it: mode chips (top-left), the
  navigation cluster and minimap as one flex column (top-right, so they cannot
  overlap), the legend (bottom-right), the control hint and the status strip
  along the bottom. Everything that floats shares `--plate-surface` and a
  `--plate-edge` hairline, with no blur.
- **Selection card** — a sheet of paper on the plate (bottom-left), with a
  shadow because it genuinely floats. Its figures read like the rail and a
  route bullet sits on the ground it was designed for.
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
- **Both themes** — checked for contrast, focus and state in light and in dark.

## Accessibility

- Visible focus ring on every interactive element (2px ink, 1px offset).
- All numerals tabular; state signalled by shape and fill as well as colour.
- Segmented controls expose `aria-checked`, rail tabs are a real
  `tablist`/`tab`/`tabpanel`, docks expose `aria-expanded`, the status strip is
  `aria-live="off"` because it changes every tick.
- Bullet text contrast is computed per line colour rather than assumed.
- Every interactive target is ≥ 24px tall; most are 28px. Layer chips are the
  target for their checkbox (the label is the hit area).
- Map labels are collision-culled in screen space: when two overlap, the higher
  priority (interchange, district, line, station) wins and the other waits.

## Known rough edges

- Map labels are canvas sprites. They are drawn in Barlow Semi Condensed and
  redrawn once the face has loaded, but they cannot inherit CSS, so a type
  change must be made in `SceneView.tsx` (`LABEL_FONT`) as well.
- Build and disrupt rails are still single scrolls; only simulate mode is
  tabbed. They're short enough today, but the same treatment applies when they
  grow.
