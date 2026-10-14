# Debt sweep — execution plan (handoff for a low-effort agent)

**Owner:** whoever runs this. **Style:** mechanical. Follow steps literally; do not
invent scope. If a step's acceptance check fails, stop at that step and report.

---

## 0. Ground truth (verified 2026-10-14)

| Fact | Value |
| --- | --- |
| Repo | `I:\projects\transit-forge` (origin `Raghav2012Code/transit-forge`) |
| Branch to start from | `main` at `9a4e627` ("Merge pull request #21") |
| Version | `1.6.0` (`src/version.ts`, `package.json`) |
| Tags pushed | `v1.5.1`, `v1.6.0` |
| Open PRs / issues | **none** (verified with `gh pr list`, `gh issue list`) |
| Node | 22.12+ |

**The three gates** (run after every commit; all must pass):

```powershell
npm run lint     # oxlint; must print NO "warning" lines (see M2)
npm run test     # vitest; must report "Tests  278 passed (278)" or more
npm run build    # tsc -b && vite build; must print "✓ built"
```

**Counting lint warnings** (use this, not eyeballing — earlier the tail of the
output hid most of them):

```powershell
npm run lint 2>&1 | Select-String -Pattern "warning" | Measure-Object | Select-Object -ExpandProperty Count
```

**Verified lint state at `9a4e627`:** `20` warnings — `17` in `src/App.tsx`,
`2` in `src/ui/product/DemoWelcome.tsx`, `1` in `src/ui/product/TutorialOverlay.tsx`.

**Important caveat about the baseline.** Copying the pre-foundation `App.tsx`
(commit `6e87ae2`) into the repo and linting it reports **0** warnings, even though
it contains patterns that warn today (e.g. a ref read inside `useMemo`). Small
probe files reproduce the rules deterministically, so the rules work; the
pre-foundation file is most likely being *skipped* by oxlint's React analysis
(a bailout), not genuinely clean. **Consequence: do not treat the current 20 as
"regressions to revert". The acceptance bar for M2 is simply zero warnings.**

---

## 1. Guardrails — never do these

1. **Never merge `wip/product-ux-foundation` or `feat/product-foundation`.** Both
   are deleted; if you find them, leave them. The wip branch forked at v1.2 and
   merging it would revert four releases.
2. **Never add `oxlint-disable` / `eslint-disable` comments** or edit
   `.oxlintrc.json` to silence a rule. Zero means zero.
3. **Never change simulation results.** If a change alters numbers, stop and
   explain why in the commit message (repo rule in `AGENTS.md`). `npm run test`
   includes a golden-day test; if it fails, you changed the simulation.
4. **One commit per milestone**, message prefixed `debt-sweep: `.
5. **Browser verification: keep ONE agent tab open.** Nine simultaneous tabs
   exhaust the browser's WebGL context pool and produce shader/context-lost
   noise that is *not* an app bug. Close tabs when done (`browser.close`).
6. **Do not bump the version or add a CHANGELOG entry** for this sweep unless a
   change is user-visible. If it is, note it under the existing `1.6.0` entry.

---

## 2. Milestone S0 — setup (no code)

```powershell
git checkout main
git pull --ff-only
git checkout -b fix/debt-sweep
```

File one issue per milestone M1–M5 on the tracker (see `docs/agents/issue-tracker.md`;
labels from `docs/agents/triage-labels.md`, all five exist on the repo):

```powershell
gh issue create --title "Theme-aware scenario thumbnails" --label ready-for-agent --body "thumbnail.ts hardcodes a dark background (#0b1020); light theme shows dark tiles. Make networkThumbnail take a theme and thread it from App through StartScreen and ScenarioBrowser."
gh issue create --title "Return npm run lint to zero warnings" --label ready-for-agent --body "20 warnings at 9a4e627 (17 App.tsx, 2 DemoWelcome, 1 TutorialOverlay). No disable comments; fix structurally."
gh issue create --title "Demo briefs must not depend on generated facts" --label ready-for-agent --body "generateBriefs gates 'overcrowding' on simulated occupancy, so openDemo can set a briefId that does not exist: no objectives chip, silently. Synthesize a brief from the demo's own objectives/constraints."
gh issue create --title "Retire the v1 scenario store" --label ready-for-human --body "v1 ops-only scenarios (src/simulation/scenario/store.ts + ScenarioPanel) coexist with v2 savegames. Consolidate or document."
gh issue create --title "Measure DESIGN.md known rough edges" --label ready-for-agent --body "Panel tabs for Build/Disrupt/Plan if the panels have grown; LABEL_FONT duplication in SceneView.tsx."
```

Record the numbers you get; you will close each at its milestone:
`gh issue close <n> --comment "<what changed + commit sha>"`.

---

## 3. Milestone M1 — theme-aware thumbnails

**File:** `src/simulation/scenario/thumbnail.ts`

**Problem.** Line 65-66 hardcodes a dark plate:

```ts
return `<svg ... viewBox="0 0 ${W} ${H}" role="img">` +
  `<rect width="${W}" height="${H}" fill="#0b1020"/>${zoneCircles}${routeLines}${dots}</svg>`;
```

Zone circles use `stroke="#33436e"` (line 47), station dots `fill="#dbe4ff"`
(line 63). Those are the *dark* minimap values. Light equivalents already exist in
`src/index.css` `:root` (lines ~103-110): `--mm-zone: #97a1b3`,
`--mm-station: #1f2937`. Use a light plate of `#e9ebef` and the light zone/dot
values, so thumbnails agree with the map.

**Steps.**

1. Change the signature to require an explicit theme:

```ts
export type ThumbnailTheme = 'light' | 'dark';

const PLATE: Record<ThumbnailTheme, { bg: string; zone: string; dot: string }> = {
  dark: { bg: '#0b1020', zone: '#33436e', dot: '#dbe4ff' },
  light: { bg: '#e9ebef', zone: '#97a1b3', dot: '#1f2937' },
};

export function networkThumbnail(input: ThumbnailInput, theme: ThumbnailTheme): string {
```

2. Replace the three hardcoded colours with `PLATE[theme].bg` / `.zone` / `.dot`.
   Route colours (`r.color`) stay untouched — they are the line colours.
3. Thread `theme` through the two callers (the compiler will point at both):
   - `src/ui/product/StartScreen.tsx` — add `theme: Theme` to its props (import
     `Theme` from `../../rendering/palette.ts`), pass to `networkThumbnail`.
   - `src/ui/product/ScenarioBrowser.tsx` — add `theme: Theme` prop, pass into the
     local `Thumb` helper, which passes it to `networkThumbnail`.
   - `src/App.tsx` — pass the existing `theme` state into both components
     (`<StartScreen theme={theme} ... />`, `<ScenarioBrowser theme={theme} ... />`).
4. Tests — `src/simulation/thumbnail.test.ts` currently calls
   `networkThumbnail(input)` with no theme. Update all call sites to pass
   `'dark'` (keeps existing assertions about `<path` count, `r="1.8"` count and
   route colours valid), and **add one test**:
   - both themes are deterministic (same input → same string);
   - light output `!==` dark output;
   - light output contains `PLATE.light.bg`, dark contains `PLATE.dark.bg`.

**Acceptance.**

```powershell
npm run lint; npm run test; npm run build   # all clean
```

Then browser: open the simulator in **light** theme, open the scenario browser
(`O`), confirm the cards are pale, not dark tiles. Switch to dark (`T`), confirm
cards are dark with readable dots. Close the tab when done.

**Commit:** `debt-sweep: theme-aware scenario thumbnails`

---

## 4. Milestone M2 — `npm run lint` to zero

**Goal:** the count command in §0 prints `0`.

**Warning inventory at `9a4e627`** (line numbers drift as you edit — re-run the
linter; it is the source of truth):

`src/App.tsx`:
- `react(immutability)` ×9 — "Cannot access variable while it is being
  initialized": `enterSimulate` (294), `resetAll` (625), `enterBuild` (631),
  `doRedo`/`doUndo` (895/896), `enterDisrupt`/`enterPlan` (922/927),
  `focusSelection`/`resetCamera` (936/938).
- `react(purity)` ×1 — `Date.now` (371, inside `captureSave`).
- `react(refs)` ×3 — 843 (`tutorialSeen.current` in the `tutorialSteps` useMemo),
  2336 (`baseSimRef.current = baseSim` write during render), 2965
  (`buildCommands()` called in JSX).
- `react(set-state-in-effect)` ×2 — 864 (keydown effect), 1646 (autosave effect).
- `react-hooks(exhaustive-deps)` ×2 — 863 (keydown effect has no dependency
  array and calls setState), 1645 (autosave effect is missing `captureSave`).

`src/ui/product/DemoWelcome.tsx` ×2 — `only-export-components` at 49 and 54.
`src/ui/product/TutorialOverlay.tsx` ×1 — `set-state-in-effect` at 28.

**Method (do not guess — iterate).**

Work one warning class at a time. After each edit run the count command. The
React rules here are non-obvious (see the caveat in §0), so the reliable loop is:
edit → count → if the target warning is gone and no new one appeared, continue;
if it persists or moved, read the **help text the linter prints** and follow it.

**Per-class techniques (in the order that is safest to attempt):**

1. **`only-export-components` in DemoWelcome.tsx (easiest, do first).**
   `DEMO_CITY_INTRO` (line 49) and `demoCitySuggestions` (line 54) are **dead
   exports** — nothing imports them (verified repo-wide). **Delete both.** Also
   drop the `export` from `interface WelcomeStats` (line 4) so the file exports
   only its component.

2. **`react(purity)` — `Date.now` in `captureSave`.**
   Make the function pure by taking the timestamp as a parameter:
   `function captureSave(name: string, id: string | null, now: number): SaveGame`
   and use `savedAt: now`. Update the call sites (they are all event handlers or
   effects, where `Date.now()` is legitimate) to pass `Date.now()`.

3. **`react(refs)` — `baseSimRef` (2336).**
   First check whether `baseSimRef` is used at all: `Select-String -Path src/*.tsx,src/**/*.tsx -Pattern "baseSimRef"`.
   If nothing but the write exists, **delete the ref** (dead code). If something
   reads it, move the write into an effect:
   `useEffect(() => { baseSimRef.current = baseSim; }, [baseSim]);`

4. **`react(refs)` — `buildCommands()` in JSX (2965).**
   Build the list in a memo instead of calling it inline:
   `const commands = useMemo(() => buildCommands(), [<deps>]);`
   where `<deps>` are only the values that change the list (`playing`, `theme`,
   `railOpen`, `measureTool`, `inspectMode`, `minimapOpen`, `ops.length`,
   `redo.length`, `selection`, `reportsOpen`, `splitView`). Then pass `commands`.
   If a ref-read inside `buildCommands`'s *synchronous* body still triggers the
   rule, move that read inside the command's `run` arrow (deferred), which is
   where it belongs anyway.

5. **`react(refs)` — `tutorialSeen` in the `tutorialSteps` memo (843).**
   Convert the seen-set from a ref to state so the memo reads state, not a ref:
   `const [tutorialSeen, setTutorialSeen] = useState<Set<string>>(() => new Set());`
   and in the existing effect replace `tutorialSeen.current.add(k)` with a
   functional update that only sets when something is new (avoid an infinite
   render loop — bail out with `prev` when nothing changed). Behaviour is
   identical: the set only ever grows, and completion persist logic is untouched.

6. **`react(immutability)` ×9 — "read while being initialized".**
   These are about *ordering within the component body*. The readers are the
   early product block (`startTutorial` 293, `enterDemoCity` 620, `demoAction`
   630) and two render-phase objects (`commandRuns` ~915-940, the keydown effect
   ~862). All of them call functions declared **later** (`enterSimulate` 1929,
   `resetAll` 1603, `enterBuild` 1914, `enterDisrupt` 1923, `enterPlan` 1599,
   `focusSelection` 2017, `resetCamera` 1975, `doUndo` 2321, `doRedo` 2327).
   **Fix by moving the readers below the declarations they use:**
   - move the whole product block (roughly `src/App.tsx:280`–`660`: `tutorial`,
     `onboarding`, `settings`, `saves`, `captureSave`…`openDemo`, `thumbs`,
     `selectDetails`, `continueSave`, `newScenario`, `enterDemoCity`,
     `demoAction`) to **after `structuralOf` / `onAdvanceYears`** (~line 2500).
     Reorder *only*; move no logic, rename nothing.
   - move `commandRuns` (the object literal) to immediately **before** the render
     return (after `buildCommands` and the handlers it calls).
   - the keydown effect (`doUndo`/`doRedo` at 895/896) must also move below
     `doUndo`/`doRedo` (2321/2327), or those two helpers must move above the
     effect. Choose the smaller diff; either is fine.
   This is a pure relocation: `git diff` should show moved lines, no changed
   lines. Verify with `npm run build` (TypeScript catches any ordering that is
   actually illegal) and with the browser smoke in step 8 below.

7. **`set-state-in-effect` + `exhaustive-deps` — keydown effect (863/864).**
   The effect intentionally re-registers every render to capture fresh closures,
   which the linter reads as "no dependency array + setState". The clean,
   behaviour-preserving fix is the **latest-ref pattern**: keep the handler in a
   ref updated each render, and register the listener **once** with `[]`:
   ```ts
   const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
   keyHandler.current = (e) => { /* the existing body, unchanged */ }; // moved to an effect if the linter insists
   useEffect(() => {
     const onKey = (e: KeyboardEvent) => keyHandler.current(e);
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
   }, []);
   ```
   If assigning `keyHandler.current` during render itself trips `react(refs)`,
   move that assignment into a dependency-less `useEffect`.

8. **`set-state-in-effect` + `exhaustive-deps` — autosave effect (1645/1646).**
   Add `captureSave` to the dependency array and wrap `captureSave` in
   `useCallback` over its real inputs (`ops`, `zoneState`, `yearsApplied`,
   `growthHistory`, `briefId`, `difficulty`, `planHorizon`, `overlay`,
   `demandLayer`, `travelDest`, `coverageThreshold`). Either that, or inline the
   save construction into the effect body so there is no external function to
   depend on. **The autosave must still fire on the same set of changes** — this
   is resume state, do not break it.

9. **`set-state-in-effect` — TutorialOverlay.tsx:28.**
   The early `setRect(null)` fires synchronously when there is no target. Fix by
   not entering the effect at all in that case: gate the effect on
   `state.active && step?.target`, and handle the "no target" case in render
   (the card already centres itself when `rect` is null — pass `null` rather than
   setting it). If the remaining `setRect` inside `place()` still trips the rule,
   guard it with a value comparison (`setRect(prev => same(prev, next) ? prev : next)`)
   so the linter sees a conditional update.

**Iteration rule.** After each fix, re-run the count. Expected path: 20 → 0.
If you reach a warning you cannot remove without changing behaviour, **stop**,
write a minimal reproduction in a scratch file, confirm it, delete the scratch
file, and report — do not silence it.

**Acceptance.**

```powershell
npm run lint 2>&1 | Select-String -Pattern "warning" | Measure-Object   # Count = 0
npm run test    # 278+ passed
npm run build   # ✓ built
```

Browser smoke (one tab): open `/simulate/`, click through **start screen → demo
→ save → browser → settings → palette → tutorial**, exactly as in “Verification
matrix” §9. Reordering is the risk here; this smoke catches a mis-wired handler.

**Commit:** `debt-sweep: return lint to zero (structural, no suppressions)`

---

## 5. Milestone M3 — demo briefs independent of generated facts

**Problem.** `openDemo` (`src/App.tsx`) does `setBriefId(d.briefId)`. Briefs are
produced by `generateBriefs(facts, difficulty, opCost)`
(`src/simulation/planning/briefs.ts:86`), which only emits `overcrowding` when a
corridor is already at ≥60% occupancy (line 94). On a fresh sim it is absent, so
the demo's `briefId` matches nothing: no objectives chip, no evaluation, and the
failure is silent.

**Steps.**

1. In `openDemo`, after the demo's ops/growth are applied, resolve the brief:
   look it up in the generated list; **if it is not there, synthesize a
   `PlanningBrief` from the demo's own data** (`DEMOS[n].objectives`,
   `DEMOS[n].constraints`, `DEMOS[n].briefId`, title `DEMOS[n].title`, and
   `paragraphs: [DEMOS[n].description]`). The demo already carries everything a
   brief needs, so this adds no new source of truth.
2. Route the existing brief state through a setter that accepts a full brief
   object, not just an id, so the synthesized one can be stored.
3. Check the two consumers handle it: the objectives chip and `onSubmitPlan`
   (which reads `activeBrief.objectives` / `.constraints`). Both take the brief
   object, so a synthesized brief should flow through unchanged — verify by
   reading the code, then by test.

**Acceptance.** For **each** of the five demos: open it, confirm the objectives
chip appears, and submit once in Plan mode. A test that asserts every demo's
`briefId` resolves to a usable brief (generate or synthesize) is the durable
check — add it to `src/simulation/tests/demos.test.ts`.

**Commit:** `debt-sweep: demos synthesize their brief when facts do not generate one`

---

## 6. Milestone M4 — retire the v1 scenario store

**Blast radius (verified, exhaustive).**

- `src/simulation/scenario/store.ts` — the v1 store (envelope `transitforge.scenarios.v1`)
- `src/ui/build/ScenarioPanel.tsx` — its UI
- `src/simulation/tests/scenario.test.ts` — its tests
- `src/App.tsx` — imports at lines 73 and 94, the `saved` state (line 259), and the
  `ScenarioPanel` mount (lines ~2774-2797)
- `src/simulation/scenario/persistence.ts` — its doc comment references v1; update wording only

**Decision gate — do this spike before any edits.** Compare the two surfaces:

| | v1 (ScenarioPanel) | v2 (ScenarioBrowser) |
| --- | --- | --- |
| Payload | `ops` only | ops + tick + zones + incidents + brief + view prefs |
| Format | `transitforge.scenarios.v1` | `transitforge.saves.v2` + `.tfscenario.json` |
| Where | TopBar popover | `O` / browser modal |

If the v2 browser covers everything a user can do in the v1 panel, retire v1. If
it does not (e.g. v1 offers something the browser lacks), **stop and report**
rather than removing a capability.

**Steps (if retiring).**

1. Delete `src/ui/build/ScenarioPanel.tsx`, `src/simulation/scenario/store.ts`, and
   the v1 portion of `src/simulation/tests/scenario.test.ts` (keep any test that
   exercises code you are *not* deleting).
2. In `src/App.tsx`: remove the `saved` state, the v1 imports, and the
   `ScenarioPanel` JSX. Replace the TopBar popover content with the two actions it
   should offer — **Save** (calls `quickSave`) and **Open scenario browser**
   (calls `openBrowser`) — both already exist.
3. Data already in users' browsers: the v1 key is simply left unread (same
   discipline as the rejected pre-scale files in 1.5.1 — never load a payload you
   cannot validate). Do **not** write a migration that guesses.
4. Update the doc comment in `persistence.ts` that mentions v1 to say v1 is no
   longer read.

**Acceptance.** `lint`/`test`/`build` clean; browser: the TopBar scenario popover
still saves and still opens the browser; `O` still works; `Ctrl+S` still works.
Add/adjust a test asserting the v1 store module is gone (there is nothing to
assert about; the real check is that the suite still passes with the file
deleted).

**Commit:** `debt-sweep: retire the v1 scenario store in favour of savegames`

---

## 7. Milestone M5 — DESIGN.md known rough edges (measure first, likely no-op)

**Rule: measure, then decide. Do not implement speculatively.**

1. **Panel tabs.** `DESIGN.md` ("Known rough edges") says Build/Disrupt/Plan are
   one long scroll and should get Reports-sheet tabs *if they grow*. Measure the
   rendered height of each mode's panel at 1440×900 in the browser (open each
   mode, read the panel's scroll height). If each fits without scrolling, no code
   change — close the issue as measured-and-fine. If one genuinely scrolls,
   implement tabs for that one mode only, following the Reports sheet's existing
   `tablist`/`tabpanel` pattern.
2. **`LABEL_FONT` duplication.** `DESIGN.md` notes map labels are canvas sprites
   drawn in `SceneView.tsx` (`LABEL_FONT`) that cannot inherit CSS. Read the font
   stack from the CSS custom property (`--font-data`) at runtime with the current
   literal as fallback, so a type change happens in one place. Keep a test pinning
   the fallback string. If reading the property proves unreliable across the sprite
   redraw path, leave it and close the issue as documented-limitation.

**Commit:** `debt-sweep: <what you actually changed>` — or no commit if both
measure to "no change".

---

## 8. Non-issue (do not "fix")

The repeated `THREE.WebGLProgram: Shader Error` / `CONTEXT_LOST_WEBGL` noise in
browser sessions comes from too many simultaneous WebGL contexts across open
tabs, not from app code. Mitigation is process: one verification tab
(`browser.close` when done). No commit.

---

## 9. Verification matrix (run before the PR)

| Check | Command / action |
| --- | --- |
| Lint zero | `npm run lint 2>&1 \| Select-String "warning" \| Measure-Object` → `0` |
| Tests | `npm run test` → all pass, count ≥ 278 |
| Build | `npm run build` → `✓ built` |
| Determinism | the golden-day test in the suite passes (it does if tests pass) |
| Start screen | `/simulate/` shows the start screen; **Continue** resumes the newest save |
| Demo | start **Long-Term Growth**; growth completes (progress overlay), welcome card shows, objectives chip appears, suggestions work |
| Save round-trip | run the day, `Ctrl+S` (name it), reopen it from the browser → clock returns to the saved tick |
| Browser | `O` opens; Featured/My/Recent tabs; thumbnails correct in **both themes** |
| Settings | change density/motion/contrast → root `data-*` attributes change; **Reset all local data** reloads clean |
| Palette | `Ctrl+K` opens; running a command works (e.g. "Open settings") |
| Tour | `/` → "tutorial" → coach marks; clicking the highlighted control auto-advances |
| Phone | resize to 390px; start screen and browser stack to one column, nothing clipped |
| Themes | the whole smoke in light **and** dark (`T`) |

---

## 10. PR, merge, cleanup

```powershell
git push -u origin fix/debt-sweep
gh pr create --title "Debt sweep: thumbnails, lint zero, demo briefs, v1 store" --body "<fill: one line per milestone, gate results, browser checks>"
# after review/CI:
gh pr merge <n> --merge
gh pr view <n> --json url --jq .url   # then link it to the session with openchamber session.link
git checkout main; git pull --ff-only
git branch -d fix/debt-sweep; git push origin --delete fix/debt-sweep
```

Tag only if a change is user-visible (thumbnails arguably are): `git tag v1.6.1 && git push origin v1.6.1`, with a matching `CHANGELOG.md` entry. Otherwise no tag.

---

## 11. Stop conditions (report instead of forcing)

Stop and report if any of these happen:

1. A lint warning cannot be removed without a behavioural change (M2, steps 6–9).
2. `npm run test` fails after a refactor — especially the golden day.
3. The M4 decision gate shows the v2 browser does **not** cover the v1 panel.
4. Reordering in M2 produces a TypeScript error that is not just ordering (that
   means the code genuinely used a value before it existed — a real bug: report it).
5. Browser verification shows any of the matrix rows failing.

Report format: milestone, what you changed, the exact command, the exact output,
what you expected, what you chose not to do.
