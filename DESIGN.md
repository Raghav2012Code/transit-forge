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
  and keeps following it; the first explicit choice (the top bar button, or
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

A workbench. Each region has one job, and a control lives where its job is.

```
bar     the scenario, search and commands, theme and help
rail    what you are doing: the mode, then that mode's tools
stage   the map, edge to edge, with its own four corners
panel   what is selected, or where to look
dock    the clock, the service day, six readings, and Reports
```

- **Bar (44px)** — the brand, the scenario (a popover for saving and loading),
  one wide search-and-command field, and the two settings nobody reaches for
  often. It says what you are working on and lets you find anything.
- **Rail (68px, always labelled)** — the four modes, then the active mode's
  tools (Build's six), then Measure and Inspect at the foot because they work
  everywhere. An icon alone is a guess, so every item carries its name.
- **Stage** — the map has no frame. Its corners:
  - *top left*: the lens bar (five lenses, More, Layers) with the legend under
    it, attached to the lens that owns it, and the one setting a lens needs
  - *top right*: the objectives chip while a brief is active, the
    Scenario/Baseline switch and Compare once there are edits, and alerts
  - *bottom right*: the overview map, the view (3D, Plan, Street) and a column
    of square camera buttons
  - *bottom left*: events as they happen; *bottom centre*: a tool in use
- **Panel (340px)** — nothing selected: the lines, what needs attention, fares.
  Selected: the thing itself, in place of the floating card. A route's
  inspector carries its service plan, so changing a headway is two clicks.
  In Build and Disrupt the mode's form keeps the top and the selection follows
  it under a heavy ink rule; in Plan, where reading is the point, it leads.
- **Dock (60px)** — transport, the clock, the **service-day strip**, and six
  readings. Reports opens a wide sheet over the lower map for Network,
  Analysis, Growth and Compare, with panels flowing into columns.

**The memorable element is the service-day strip.** It draws the operating
day (04:00 to 24:00) the way a timetable is drawn: peak periods shaded (read
from the simulation's own definition), disruptions as bars, the day's load as
a trace, a needle for now. Pointing at the future offers "Run to 09:00"; the
past cannot be revisited because the day would have to be replayed. Everything
else is quiet so this can be the one thing that is not.

**Search is also the command line.** One field finds places and runs actions
(`dark`, `build`, `crowd`, `reports`). Anything the workspace can do is
reachable by typing, and its shortcut is shown beside it.

### Three shapes, one set of components

| Width | Shape |
| --- | --- |
| 1024 and up | rail, map, panel, dock |
| 700 to 1023 | the panel is a drawer over the map; it opens when something is selected |
| under 700 | the rail is a bar along the bottom, the panel a sheet above it, the dock keeps the clock and transport |

The files: `shell.css` (grid, bar, rail, dock, popovers), `map.css` (the
corners), `reports.css`, `panel.css`, `responsive.css`. `App.css` holds the
shared pieces.

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
- Segmented controls and the mode rail expose `aria-checked`; the reports sheet
  is a real `tablist`/`tab`/`tabpanel`; docks and popovers expose
  `aria-expanded`; the readings are a plain list because they change every tick
  and must not be announced.
- The command palette is a `combobox` over a `listbox` with an active
  descendant, and the day strip is a `slider` (arrows choose a later time,
  Enter runs to it). Popovers and sheets close on Escape before Escape would
  leave the mode.
- Landmarks are named: workspace, map, details or the mode panel, clock and
  readings, reports.
- Bullet text contrast is computed per line colour rather than assumed.
- Every interactive target is ≥ 24px tall; most are 28px. Layer chips are the
  target for their checkbox (the label is the hit area).
- Map labels are collision-culled in screen space: when two overlap, the higher
  priority (interchange, district, line, station) wins and the other waits.

## Known rough edges

- Map labels are canvas sprites. They are drawn in Barlow Semi Condensed and
  redrawn once the face has loaded, but they cannot inherit CSS, so a type
  change must be made in `SceneView.tsx` (`LABEL_FONT`) as well.
- The panel in Build, Disrupt and Plan is still one scroll of collapsible
  sections. They are short enough today; if they grow, give them the Reports
  sheet's tabs rather than a longer column.
- The day strip runs forward only. Going back would mean replaying the day from
  the start, which is a different feature.
