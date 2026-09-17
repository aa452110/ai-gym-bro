# AI Gym Bro — Agent Guide

## Scope

This file applies to the entire repository. It is the internal working guide for
agents and contributors. `README.md` is the shorter public project summary.

## Product mission

AI Gym Bro is a mobile-first, structured workout tracker for lifters who want to
spend less time managing a log and more time training.

The product is a workout tracker first and an AI assistant second. It combines
fast manual logging with contextual coaching over the same structured workout
state. Do not turn it into a generic fitness dashboard, an unbounded chatbot, or
a marketing page.

- Product principle: **Training first.**
- Primary user: a strength or hypertrophy trainee logging work in the gym.
- Primary job: see today's plan, record what actually happened quickly, and
  finish with a trustworthy training record.
- Secondary jobs: understand recommendations, adapt the current session, review
  history, manage a program, and preserve useful exercise context.
- Demo persona: Brian, an intermediate powerbuilding lifter. This is seeded demo
  content, not the limit of the intended audience.
- Live MVP: <https://ai-gym-bro.aa452110.chatgpt.site/>
- Displayed version source of truth: `lib/app-version.ts`.

## Product contract

These are non-negotiable unless the user explicitly changes the product
direction.

1. **Keep plan and performance separate.** `PlannedSet` describes intent;
   `PerformedSet` records reality. Logging, correcting, or deleting performed
   work must not silently rewrite the plan. Adding a planned set must not invent
   a performed set.
2. **Use structured, validated mutations.** Manual UI actions, coach actions,
   and WebMCP actions must converge on typed `WorkoutOperation` values that pass
   `validateWorkoutOperation` before `applyWorkoutOperation` changes state.
3. **The lifter has final authority.** Explicit user choices outrank generated
   recommendations. Once the user chooses a load, do not keep pushing a
   conflicting load.
4. **Today-only changes stay today-only.** A time cap, substitution, skipped
   exercise, or extra set in the active session must not mutate the base program
   unless the user separately approves a program change.
5. **Explain recommendations.** Keep fact, recommendation, rationale, and user
   decision distinct. Never present an estimate as recorded fact.
6. **Match confidence to action.** Clear, high-confidence commands may
   auto-apply with undo. Ambiguous or consequential interpretations should be
   shown for confirmation.
7. **Be honest about missing evidence.** If history is absent or too thin to
   support a trend, say so. Never fabricate training history, RPE, or intent.
8. **Handle discomfort safely.** Do not diagnose. Recommend stopping when pain
   is sharp, worsening, or changes movement; offer to save the user's report as
   an observation or choose a suitable substitution.
9. **Treat memory carefully.** Confirmed cues/preferences are different from
   unconfirmed observations or inferred behavior. Preserve that distinction in
   both data and copy.
10. **Keep in-gym interaction fast.** Optimize for touch, small screens, short
    copy, visible next actions, and minimal interruption during set logging.

## Voice and terminology

Use direct, supportive, evidence-based language. The tone can feel like a useful
gym partner, but it should not be loud, gimmicky, judgmental, or falsely
authoritative.

Preserve the domain vocabulary already used by the app:

- Surfaces: Today, Active Workout, History, Programs, Profile.
- Records: plan/planned set versus performed set/recorded work.
- Set types: Warm-up, Working, Top set, Backoff, Drop set, AMRAP, Failure,
  Other.
- Effort: RPE and RIR are optional signals, not mandatory fields.
- Recommendation explanation: Fact, Reasoning, Your decision.
- Memory: cue, observation, preference; confirmed versus observed.
- AI involvement: Track Only, Assist, Coach, Full Coach.

## Current user experience

| Surface | Current behavior |
| --- | --- |
| Opening | Shows a minimal agent-ready welcome with one Get started action. It is an entry gate only; there is no login or account flow. |
| Today | Shows the planned session, program context, exercise list, current recommendation, explanation, and start/resume actions. |
| Active Workout | Shows elapsed time, progress, exercise context, warm-ups, performed working sets, the next target, quick logging, optional RPE, notes, substitutions, skip/add-set actions, and finish flow. |
| Ask Gym Bro | Opens a context-aware sheet for Today, Active Workout, History, or Programs. It parses supported phrases deterministically and returns text plus structured operations/actions. |
| History | Searches and expands recorded sessions, groups performed sets, preserves warm-ups and notes, shows a bench trend, and supports structured history questions. |
| Programs | Shows the active Strength Builder program; edits day name, focus, duration, and exercises; creates days; and opens the exercise library. |
| Profile | Stores autonomy, warm-up/RPE preferences, units, cues and observed behavior, rest-timer/haptics switches, and demo reset. |
| Exercise library | Searches and filters structured exercise metadata and powers substitution ranking. |

The active workout is a focused full-screen mode. The other four surfaces use
internal tab state; they are not separate URL routes.

## Current demo content

- Twenty exercises with structured names, aliases, movement patterns, muscles,
  equipment, difficulty, suitability scores, substitution links, and optional
  media.
- Generated exercise artwork for bench press, back squat, and Romanian deadlift;
  other exercises use a graceful fallback visual.
- A three-day, week-four Strength Builder program: Push, Lower, and Pull.
- A fixed Push/Strength workout dated September 13, 2026.
- Four seeded completed workouts, a bench recommendation, and two confirmed
  technique cues.

Treat dates, history, profile details, and recommendations as demo fixtures until
the product gains real user data and dynamic scheduling.

## Architecture and data flow

The app has one route, `/`, which mounts the client-side `GymApp`.

```text
Manual UI  ─┐
Coach      ─┼─> WorkoutOperation -> validate -> apply -> GymState -> localStorage
WebMCP     ─┘
```

- `GymState` owns today's workout, history, program, preferences,
  recommendations, interpretations, and training memories.
- `WorkoutOperation` records its source as `manual`, `ai`, or `webmcp`.
- `lib/workout-engine.ts` is the authority for validating and applying workout
  changes.
- `lib/use-gym-store.ts` owns hydration, persistence, commits, and one-level
  undo.
- Program and preference helpers currently clone and commit state directly; do
  not confuse those helpers with validated workout operations.
- React state controls transient UI such as the active screen, open sheets,
  dialogs, form fields, and tab selection.

When adding a workout mutation, update all relevant layers:

1. Add or extend the type in `lib/gym-types.ts`.
2. Add validation and deterministic application in `lib/workout-engine.ts`.
3. Route UI, coach, and/or WebMCP entry points through the shared dispatcher.
4. Add assertions to `scripts/verify-workout.mjs`.
5. Verify that planned and performed data remain independent.

## AI and coaching boundary

The current MVP does **not** call a live language model. `lib/ai-coach.ts` is a
deterministic intent parser over structured state. It can currently handle:

- natural-language set logging and set-type inference;
- last-set rep, RPE, and RIR corrections;
- repeated sets, drop sets, and extra planned sets;
- user-selected load overrides;
- direct and equipment-driven substitutions;
- today-only time-cap adaptation;
- saved cues and qualitative observations;
- discomfort-oriented safety responses;
- workout completion; and
- last-session, rep-best, and simple trend questions.

Any future server-side model integration must preserve this boundary:

```text
User message -> model proposes structured intent -> app validates -> state changes
```

Never let raw model output mutate workout or program state directly. Validate
IDs, values, status transitions, scope, and user authority in application code.

## Workout engine behavior

- Valid weights are `0..2000`; reps are whole numbers `1..100`; RPE is `5..10`;
  RIR is `0..10`; time caps are `15..180` minutes.
- Main-lift working sets infer the first set as a top set and later sets as
  backoffs unless an explicit type is supplied. Accessories default to working
  sets.
- Completion saves the full workout, including both its plan and performed work,
  into History.
- Substitution preserves `originalExerciseId` and a reason.
- Explicit user load selection marks active recommendations as overridden.
- Current load adaptation is bench-specific. Top-set RPE informs the bench
  backoff, and backoff RPE may hold or reduce the next load.
- Current time adaptation is hard-coded around the seeded four-exercise Push
  session.

Do not generalize those last two rules in product copy until their engine logic
is generalized too.

## Search and substitutions

Exercise search indexes names, short names, aliases, category, movement pattern,
muscles, and equipment. Substitutions rank candidates using explicit similarity
links, movement pattern, overlapping muscles, and main-lift/accessory status,
while filtering confirmed dislikes and unavailable equipment.

Preserve the original movement intent when possible. If the user deliberately
changes intent, make that choice explicit rather than disguising it as an
equivalent substitution.

## Persistence and schema changes

- State is device-local in browser `localStorage` under
  `ai-gym-bro-state-v4`.
- `GymState.version` is currently `4`.
- A targeted migration exists from v3 to v4; unsupported versions fall back to
  seeded state.
- Undo retains one previous in-memory snapshot.
- Saved coach interpretations are capped at 50.
- There is no cross-device sync, account, cloud backup, or durable server store.

When persisted state changes, update the type, seed version, storage key,
migration logic, and verifier coverage together. Never silently reinterpret old
data as a new schema.

## WebMCP surface

`lib/use-gym-webmcp.ts` optionally registers:

- `gym_read_today`
- `gym_start_today_workout`
- `gym_log_set`

Mutating tools must use the same validated dispatcher as the UI. The integration
must remain optional and fail harmlessly when `document.modelContext` is absent
or only partially implemented. WebMCP is a browser capability surface, not an
application backend.

## Known MVP gaps

Do not describe these as completed features:

- AI autonomy levels are stored and displayed but do not yet gate coach
  behavior.
- Rest-timer and haptics settings are persisted UI scaffolding; no automatic
  timer or vibration behavior is wired.
- Switching lb/kg changes labels and input increments but does not convert stored
  weights.
- Program edits do not rebuild the already-seeded Today workout.
- “Ask AI to modify the program” opens the coach, but there is no structured AI
  operation for changing the base program.
- Today and history are fixed demo fixtures; completing Today does not schedule
  the next workout.
- Recommendation adaptation and the trend chart are primarily bench-specific.
- Undo is one level and is not persisted.
- There is no backend, authentication, API route, live LLM, analytics, payment,
  cloud database, or cross-device sync.
- Behavioral coverage is one reference workflow, not a full unit/integration
  test suite.

## Technology and hosting

- React 19, TypeScript in strict mode, and a Next App Router-compatible file
  structure compiled by Vinext and Vite.
- Tailwind CSS 4, local shadcn-style Base UI primitives, and Lucide icons.
- OpenAI Sites plus the Cloudflare Vite plugin; the hosted server target is a
  Cloudflare Worker.
- `.openai/hosting.json` identifies the existing Site. D1 and R2 are currently
  unconfigured.
- No app secret or external API key is required for the current MVP.

Preserve the existing npm lockfile, build pipeline, and hosting configuration.
Do not add storage, authentication, network services, or deployment changes
unless the requested feature requires them. Do not publish or redeploy unless the
user asks for deployment.

## Visual system and interaction rules

- Preserve the intentional dark charcoal gym UI, lime `#c7f65b` accent, Geist
  typography, compact cards, and restrained motion.
- The design is mobile-first with a fixed bottom navigation. At `900px` it uses
  a desktop rail; the main content frame is at most `780px` wide.
- Reuse existing primitives from `components/ui` for matching controls. Do not
  modify vendored primitives merely to style one screen; compose at the call
  site.
- Preserve accessible labels, keyboard behavior, readable contrast, touch-sized
  controls, empty states, error feedback, and undo where applicable.
- Exercise visuals must include useful alt text and degrade to the existing
  fallback.
- Keep important workout actions in the first useful viewport. Avoid marketing
  copy or decorative content that delays logging.

## Source map

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Root route; mounts `GymApp`. |
| `app/layout.tsx` | Metadata, fonts, and root document. |
| `app/globals.css` | Theme tokens, product styling, and responsive behavior. |
| `components/gym-app.tsx` | App shell, screens, dialogs, and product orchestration. |
| `components/exercise-visual.tsx` | Exercise media with fallback rendering. |
| `components/ui/*` | Reusable local UI primitives. |
| `lib/gym-types.ts` | Domain model and operation contracts. |
| `lib/gym-data.ts` | Exercise knowledge, seeded program, Today, history, preferences, and memory. |
| `lib/workout-engine.ts` | Validation, state transitions, formatting, and rule-based recommendations. |
| `lib/ai-coach.ts` | Deterministic language parsing and structured coach responses. |
| `lib/exercise-search.ts` | Exercise search and substitution ranking. |
| `lib/use-gym-store.ts` | React store, local persistence, migration, and undo. |
| `lib/use-gym-webmcp.ts` | Optional browser tool registration. |
| `lib/app-version.ts` | User-visible app version. |
| `scripts/verify-workout.mjs` | Reference behavioral verification. |
| `.openai/hosting.json` | Existing OpenAI Sites project and resource bindings. |
| `vite.config.ts` | Vinext, Sites, Cloudflare, Tailwind, and local runtime configuration. |

## Local development

Requirements: Node.js `>=22.13.0` and npm.

```bash
npm install
npm run dev
```

Use `npm ci` for a reproducible clean install. After a production build,
`npm start` runs the generated Worker locally through Wrangler.

There is no `npm test` script. The required validation sequence for source
changes is:

```bash
npm run lint
node scripts/verify-workout.mjs
npm run build
```

The Vinext build may emit a non-fatal warning that `/` could not be statically
classified. Treat new errors separately from that known warning.

Oxfmt is configured for single quotes and an 80-column target, but the existing
repository is not fully format-clean. Do not run `npm run format` blindly because
it rewrites unrelated files. Format touched code deliberately and inspect the
diff.

## Change checklist

Before handing off a change:

1. Confirm the change supports the product mission and keeps the lifter in
   control.
2. Preserve plan/performance separation and today/program scope.
3. Route workout changes through typed validation and deterministic application.
4. Add or update reference-verifier assertions for behavior changes.
5. If persisted state changed, add an explicit migration.
6. Bump `APP_VERSION` for every user-facing update.
7. Preserve mobile and desktop behavior plus accessibility semantics.
8. Run lint, the reference verifier, and the production build.
9. Review the final diff for unrelated formatting or generated output.

Do not manually edit `.next`, `.vinext`, `dist`, `.wrangler`, `outputs`, or
`work`; they are generated and ignored.
