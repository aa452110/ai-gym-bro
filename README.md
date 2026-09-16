# AI Gym Bro

AI Gym Bro is a mobile-first workout tracker for lifters who want to spend less time managing their log and more time training. It keeps planned and performed work separate, makes manual set logging fast, and layers contextual coaching over the same structured workout state.

**Live app:** https://ai-gym-bro.aa452110.chatgpt.site/

## MVP highlights

- Today, Active Workout, History, Programs, and Profile views
- Structured warm-ups, working sets, top sets, backoffs, RPE/RIR, and notes
- Planned-versus-performed workout data
- Exercise substitutions driven by structured exercise metadata
- Natural-language logging for phrases such as `225 for 5` and `felt like an 8`
- Rule-based weight recommendations and top-set/backoff adaptation
- Structured history questions and contextual training memory
- User-selectable AI autonomy with manual decisions taking priority
- Device-local persistence and undo support

## Current AI implementation

The MVP does not call an external language-model API. `lib/ai-coach.ts` currently interprets supported phrases with deterministic intent parsing, reads structured workout history, and produces validated operations. `lib/workout-engine.ts` is the authority that validates and applies those operations.

A future server-side model integration should preserve that boundary:

```text
User message -> model proposes structured intent -> application validates intent -> workout state changes
```

Raw model output should never mutate workout data directly.

## Architecture

- `components/gym-app.tsx` — application shell and product UI
- `lib/gym-types.ts` — shared domain types
- `lib/gym-data.ts` — seeded training data and exercise knowledge
- `lib/workout-engine.ts` — validated workout operations and adaptation rules
- `lib/ai-coach.ts` — natural-language parsing and structured coaching responses
- `lib/use-gym-store.ts` — browser persistence and undo state
- `lib/use-gym-webmcp.ts` — optional WebMCP surface
- `scripts/verify-workout.mjs` — reference-workout verification

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

## Verify changes

```bash
npm run lint
node scripts/verify-workout.mjs
npm run build
```

## MVP boundaries

Workout data is currently stored in the browser, so each device has its own state. The app does not yet include accounts, a shared backend, or a live LLM connection.
