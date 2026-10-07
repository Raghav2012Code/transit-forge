# Showcase release

## Goal

Turn TransitForge into a portfolio piece a stranger can open from a link, understand
in under a minute, and trust on inspection. The audience is a recruiter or engineer
judging a full-stack generalist: UI craft, 3D rendering, and simulation engineering
each have to show, and none of them may look unfinished.

No new simulation features and no change to the map's scale. The scale pass, city
life (piece 2) and shareable plan links stay out (see Out of scope).

## Done means

A reviewer who has never seen the project, on a clean browser profile:

1. Opens a public URL and sees the map running within a few seconds, with no console errors.
2. Reaches a built line with trains moving in under 60 seconds, guided only by the first-run tour.
3. Finds the same experience in light and dark and at 390 px wide, with no horizontal scroll.
4. Reads the README top to bottom and learns what it is, why it is interesting, how it is built, and where the decisions are recorded, without opening the code.
5. Sees a green CI badge, and `npm run lint`, `npm run test` and `npm run build` are clean.

Each of these is checked by hand or by the smoke test before the work is called done.

## Milestones

One commit each, in this order. A milestone lands only when lint, test and build are
clean (`AGENTS.md`). Work lands on the fork's `main` through a pull request.

### 1. Land the open branch and make the README true

- Open a pull request from `feature/sim-correctness` to the fork's `main` and merge it. The open PR to the parent (`feature/city-redesign` work) is separate and not touched here.
- The README status section stops at v1.2 and its "Known limitations" no longer match the code (vehicles now stop at stations; ADR 0002). Correct both against the code. Version is read from `src/version.ts`; the README does not hard-code a test count.

Accepted when: `main` contains the correctness work and no README sentence contradicts the code.

### 2. CI and a live deployment

- `.github/workflows/ci.yml`: on push and pull request, Node 22, `npm ci`, `npm run lint`, `npm run test`, `npm run build`.
- Deploy to Vercel as a static Vite site from the fork's `main`, base path `/`, no server code. Preview deployments on pull requests come with the integration.
- A status badge and the live link go at the top of the README (written in milestone 5; the badge URL is known after this milestone).

Accepted when: a push to `main` builds in CI and the live URL serves that commit, loaded cold with an empty cache.

Risk: the repo's Vercel project needs the owner's account. The Vercel connector in this environment needs authentication; if it is not available, the owner connects the repo in the Vercel dashboard (a two-minute step) and the rest is unchanged.

### 3. First-run experience and failure handling

Today the only onboarding is a "First run" checklist inside the Plan panel, collapsed by default (`PlanningPanel.tsx`), so a new visitor never sees it.

- **Tour.** A first-visit guided tour of about five steps, each tied to the real action it teaches (see the map, build a line, run the day, read a result, open the command palette). It reuses the existing tutorial step tracking in `App.tsx` rather than adding a second progress system. Skippable at any step, closable with `Esc`, and never shown again once finished or skipped (a versioned `localStorage` key, wrapped in try/catch like the existing one). Reopened from the `?` sheet and from a "Take the tour" command in `buildCommands`; shortcuts follow the `onKey` and `shortcuts.ts` rule in `AGENTS.md`.
- **Interface rules.** Tokens only, theme-blind, selection is ink, no new colour meaning (`DESIGN.md`). Motion respects `prefers-reduced-motion`. The tour is a real dialog: focus moves in, is trapped, and returns on close.
- **Error boundary.** A top-level boundary around the app. On a render error it shows a plain message, the error text, a reload button, and a "Reset saved data" button that clears this app's `localStorage` keys, since corrupt saved state is the likeliest cause of a crash on a returning visit.
- **No WebGL.** If the renderer cannot start, the same fallback says so in words instead of a blank canvas. A recruiter on a locked-down machine must not see an empty page.

Accepted when: with an empty profile the tour appears, completes, and stays gone after a reload; forcing a render error shows the fallback; disabling WebGL shows the message; corrupt saved data can be reset from the fallback.

### 4. Quality pass and a smoke test

- **Responsive and themes.** Walk every mode (simulate, build, disrupt, plan) and every sheet in both themes at 1440 px, 768 px and 390 px. Fix overflow, clipped controls and unreadable states found.
- **Accessibility.** Keyboard reach and visible focus for every control; accessible names on icon buttons; contrast in both themes against the tokens; dialog semantics on sheets and the tour. Checked with an automated scan plus manual keyboard passes.
- **Performance.** Record the cold-load size and time-to-first-frame on the deployed build, and a frame-time sample during a running day. Write the numbers in the README only if measured; fix only what is clearly bad.
- **Smoke test.** One Playwright test, run as `npm run e2e` and as its own CI job so a browser flake never blocks `npm run test`. It loads the built app (software WebGL in headless Chromium), asserts the canvas renders, no console errors, play advances the clock, `T` switches theme, and at 390 px the page does not scroll horizontally. New dev dependencies: `@playwright/test` and `@axe-core/playwright`, for this purpose only.

Accepted when: the smoke test passes locally and in CI, the axe scan reports no serious or critical issues, and a manual keyboard-only run reaches every mode.

Risk: headless WebGL can be flaky. If software rendering proves unstable in CI, keep the test local and documented rather than letting it become a red badge.

### 5. README, assets, licence and write-up

- **README.** A new top: one-line pitch, live link, badge, a hero GIF of a day running, then side-by-side light and dark screenshots. Then: what it does, the three-layer architecture as a diagram (Mermaid, rendered by GitHub), how determinism is kept (seed 1337, no `Math.random()` in `src/simulation/`), a short "decisions worth reading" list linking the ADRs and `DESIGN.md`, run and test instructions, and credits.
- **History.** The long version-by-version status text moves to `CHANGELOG.md`, so the README stays a front page.
- **Assets.** Captured from the deployed build with Playwright, committed under `docs/media/`, kept small (compressed GIF, WebP or optimised PNG). A repo social preview image.
- **Licence.** Needs an owner decision (see Open decisions). No licence file is added until it is settled.
- **Write-up.** A short engineering note in `docs/` on the tick-as-time-budget decision, the display-schedule decision, and the layering rule, linked from the README. Built from the two ADRs, not new claims.

Accepted when: the README renders correctly on GitHub in light and dark, every link and image resolves, and the hero GIF shows what the live site actually does.

## Open decisions (owner)

- **Licence and authorship.** 17 of the project's commits are by another author, and `upstream` (`Raghav2012Code/transit-forge`) is the parent. A licence is theirs to grant for their work. Options: ask them to agree to MIT with both names, or leave the repo unlicensed and say so ("all rights reserved") until they answer. Do not publish a licence file on assumption.
- **Host.** Vercel by default. GitHub Pages works but needs a base path and a deploy workflow.
- **Custom domain.** Optional; a `*.vercel.app` URL is acceptable for the first release.

## Out of scope, named

- `src/App.tsx` is over 2,600 lines. A reader opening it will notice. Splitting it is a real improvement for the engineering story but is a refactor with regression risk; it is the first candidate for the next milestone, not part of this one.
- Scale pass and city life (piece 2): changes every simulation baseline.
- Shareable plan links, daily briefs, replay export: approach 2 from the brainstorm, after this release.
- Moving the simulation into a Web Worker.

## Tests

- Existing vitest suites stay green; this work adds no simulation logic.
- A unit test for the tour's state (shown once, dismissed persists, reopen works) and for the error boundary's reset action, in the style of `commands.test.ts`.
- The Playwright smoke test above.
- Browser check in both themes and at 390 px for every UI milestone.
