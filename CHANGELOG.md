# Changelog

Notable changes to Maceut, newest first. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The project is pre-release, so nothing is versioned yet — everything below sits under **Unreleased**.

> **Status of this milestone:** the whole frontend runs on **localStorage mocks**. `api/` contains no
> source yet, so no data leaves the browser, nothing persists across devices, and every limit is
> enforced client-side only. Each feature below is a working prototype, not a shipped capability.
> See "Known limitations" at the end.

---

## [Unreleased]

Landed on `main` 2026-09-18 as 15 squashed commits. PR numbers are given as
`landing PR ← review PR` where they differ; see "A note on PR numbering" below.

### Zones

**Zones table filters and sorting, schedules on zone detail, map zoom** — #32 ← #18

- Added: sortable column headers on `/zones` (zone, area, roads, capture, status, created) cycling
  default direction → reversed → unsorted, with the sort state and a Clear action in the table footer.
- Added: road-class filter alongside the existing status filter and search.
- Added: `Area` column; row actions collapsed into a three-dot menu (view, edit, pause/resume, delete).
- Added: capture windows for the zone on the detail page — hours, interval, days, frames/day and
  active state — plus a warning when the zone is paused while its windows read as active, since in
  that case they collect nothing.
- Changed: `Created` promoted from a subtitle to its own column; `Length` column removed.
- Fixed: zoom and pan were tied to the map's `interactive` flag, so every read-only preview was frozen
  at one zoom level. Now available on all maps, with the zoom control restyled for the dark basemap.
  Wheel zoom stays opt-in so scrolling the page past a map doesn't trap the scroll.

**Zone detail page with inline editing** — #31 ← #17

- Added: `/zones/[id]` — the app's first dynamic route. Shows the boundary and the zone's attributes,
  and edits name and road class in place. Pause/resume and delete included; boundary stays read-only.
- Added: BR-028, BR-029, BR-030 and spec F-24 covering zone detail and editing.
- Added: `RoadClassPicker`, extracted from the create wizard so both flows share one control rather
  than two copies that drift.
- Fixed: `updateZone` was a plain shallow merge, which editing would have exposed three ways —
  changing road class left `roadsCount`/`lengthKm` stale from creation; no BR-015 name-uniqueness
  check on update (and it has to exclude the zone itself); no BR-021 plan check, which made editing a
  way around the limit the create wizard enforces.
- Fixed: the list's "Edit" action pointed at `/schedule` carrying no zone id.

### Interface

**Branded dropdowns, page subtitles removed** — #30 ← #16

- Changed: all ten dropdowns rebuilt on Base UI's `Select` — a native `<select>` hands both the arrow
  and the option list to the browser, and the list cannot be styled at all.
- Changed: subtitles removed from Zones, Schedule and Studio; the schedule timezone moved to a label
  above the hour ruler, since a schedule board can't be read without knowing which clock it's on.
- Fixed: `Select`'s trigger hardcoded `w-full`, and `cn()` is a plain join rather than tailwind-merge.
  Tailwind emits keyword width utilities after numeric ones, so `w-full` beat every caller's width —
  every fixed-width dropdown in the app was silently rendering at 100%.
- Fixed: `Select.Value` rendered the raw value, so the Studio zone picker displayed a UUID. It only
  looked correct elsewhere because those values happen to be words.

**Auth pages: chrome removed, password reveal added** — #28 ← #14

- Added: `PasswordInput` with a reveal toggle that stays in the tab order.
- Changed: `/login` and `/register` drop the header entirely — login puts the wordmark on the
  photograph, register at the top of the form column. Login's photo column narrowed to 38% and runs
  full-bleed; both forms moved into cards.
- Removed: `SignupSteps`, once the indicator came off both of its callers.

### Internal (platform administration)

**Internal is its own app** — #29 ← #15

- Changed: accounts with the `internal` role no longer see Dashboard, Zones, Schedule, Studio or Team.
  `/internal` is their home after login, they skip onboarding, and both cross-links between the two
  apps are gone.
- Added: `/internal/profile`, rendering the shared `ProfileView` inside the staff shell with Usage and
  Billing hidden — an account with no Zones page has no workspace quota worth reporting.
- Fixed: six call sites independently decided where a signed-in user belongs, all hardcoding
  `/dashboard`. They now share `homePathFor()`.

**System configuration with write-only secrets** — #27 ← #13

- Added: `/internal/config`, mirroring the config surface from `api/.env.example`.
- Added: secrets are write-only by construction — rotation derives the mask and discards the
  plaintext, so the store only ever holds `{ isSet, last4, updatedAt, updatedBy }`. `JWT_SECRET`
  carries an explicit warning that rotating it signs out every user.
- Added: deploy-time infrastructure (server, database, RabbitMQ, CORS) renders read-only. A web UI
  can't hot-swap a database host, and a control that looks editable but isn't is worse than the truth.

**Staff shell, platform overview and user management** — #26 ← #12

- Added: `/internal` overview (accounts, internal users, zones, captures, storage, estimated MRR,
  plan mix, recent signups) and `/internal/users` (search, plan/role filters, inline plan and role
  changes, per-account usage drawer).
- Added: 24 seeded demo tenants, chipped "demo" — their usage figures are fabricated, and only the
  signed-in account reports live numbers.

**Platform role on the user record** — #25 ← #11

- Added: `role: 'user' | 'internal'` on the user model, deliberately separate from the workspace-scoped
  `MemberRole`, plus guards for changing your own role and demoting the last internal account.
- Added: internal access is granted by `NEXT_PUBLIC_INTERNAL_EMAILS`, replacing an earlier heuristic
  that promoted whichever account registered first — unpredictable, with nothing in the UI to say so.
  Config wins over the table: a listed account can't be demoted from the UI.

### Sign-up

**Two-step sign-up and photographic login panel** — #24 ← #10

- Changed: sign-up is two real steps — details, then plan, then dashboard. It previously asked for a
  plan twice and showed a "First zone" step that did nothing.
- Added: the login panel photograph (Ed 259, Unsplash License), vendored into `public/` rather than
  hotlinked so there's no runtime third-party dependency.

### Application screens (mockup turns 3 and 4)

**Team and profile & usage** — #23 ← #9

- Added: `/team` with role changes, invite dialog and the capability matrix; `/profile` with usage
  meters, plan attributes and a working plan switch.

**Studio** — #22 ← #8

- Added: `/studio` — frame player with scrubber and playback rate, grid view, and the animation
  builder (fps, overlay, title, position, format) submitting a render job.

**Schedule board** — #21 ← #7

- Added: `/schedule` — per-zone window bars on an hour ruler, frames/day budget against the plan's
  daily capture limit, and add/edit window dialogs with day toggles and interval gating.

**Dashboard, zones list and create wizard** — #20 ← #5, and #6

- Added: `/dashboard` — quota tiles, zone list, capture strip, recent renders, collection health.
- Added: `/zones` table with filters and delete confirmation, the zone-limit paywall, and the
  three-step create wizard at `/zones/new` (boundary, road class with live traffic preview and plan
  lock, review).
- Removed: the dialog-based zone stepper it replaced.

**App shell and mock data layer** — inside #19, originally #4

- Added: top nav replacing the sidebar, notification feed and profile menu, shared `Table`,
  `ConfirmDialog` and `Dropdown` primitives.
- Added: mock APIs for schedules, studio frames/renders, team and notifications; the zone model gains
  status, area, road count, length and cadence, seeded per plan.

**Landing, login, sign up and onboarding** — #19 ← #2

- Added: `/` landing page, `/login`, `/register` and `/onboarding`.
- Changed: `/` became the landing page and the dashboard moved to `/dashboard`; the `(dashboard)`
  route group became `(app)`.

### Foundation

**Frontend fixes, Docker dev container, tiered plan limits** — #1

- Added: the web frontend served via a Docker dev container.
- Changed: plan limits became tiered — max active schedules 10/20/50 and daily captures 10/50/100
  across Free/Standard/Premium (BR-005, BR-006). They were previously flat across all tiers, which
  left road class as the only paid differentiator.
- Fixed: `max-w-sm`/`max-w-md` compiled to 12px/8px because the custom spacing scale reuses Tailwind's
  reserved size keys, collapsing every centred card and dialog.
- Fixed: `crypto.randomUUID()` is secure-context only, so register, create-zone and manual capture all
  threw over plain HTTP.
- Fixed: the dark-mode map filter applied per tile, so Leaflet's `mix-blend-mode` produced visible
  tile seams.

---

## Known limitations

- **No backend.** `api/` has no source. Every screen runs on localStorage mocks, so data is per-browser,
  never shared, and lost when site data is cleared.
- **`/internal` gating is not authorization.** The role lives in localStorage and anyone can edit it.
  Real enforcement has to live in backend middleware, and every `/internal` endpoint must re-check
  server-side.
- **Aggregate figures are seeded.** The internal overview's numbers include demo tenants whose usage is
  fabricated and never changes.
- **Studio and Team have no specification.** They exist because the mockups included them;
  `product.md` still lists team/role management as out of scope for the MVP.
- **Config editing has no architecture decision behind it.** Values are read from `.env` at container
  start; editing them in a UI implies either DB-backed overrides or a read-only mirror. That needs an
  ADR in `tech.md` before backend work starts.
- **Manual capture is unreachable.** `ManualCaptureButton` has no callers since Studio dropped it;
  F-04 places it on the zone card and zone detail page.
- **Interactive flows are unverified in a browser.** Everything was checked with `tsc`, `eslint` and
  route-level smoke tests; clicking through each flow is still a manual pass.

## A note on PR numbering

The work was reviewed as a stack of PRs (#1–#18) and landed as #19–#32. Squash-merging a stacked chain
rewrites history, so once the first PR was squashed the branches above it no longer shared ancestry
with `main` and conflicted on files touched by more than one PR. Each PR was rebuilt as a single commit
on `main` carrying that branch's exact tree — content verified identical by tree hash — and merged
through a new PR, with the original closed and pointing at it. Review discussion lives on the original.

Two PRs have no landing PR of their own: **#4** (app shell) and **#6** (zones list and wizard) were
merged into their base branches rather than `main`, so their content landed inside #19 and #20.
