import { getExercise } from './gym-data';
import { findExerciseFromText, rankSubstitutions } from './exercise-search';
import type {
  AiAction,
  AiResponse,
  GymState,
  Interpretation,
  PerformedSet,
  SetType,
  WorkoutExercise,
  WorkoutOperation,
} from './gym-types';
import { formatPerformedSet, getExerciseHistory, getWorkingSets } from './workout-engine';

export interface CoachContext {
  screen: 'today' | 'active' | 'history' | 'programs';
  workoutExerciseId?: string;
}

const newInterpretation = (rawInput: string, confidence: number, summary: string): Interpretation => ({
  id: `interpretation-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  rawInput,
  confidence,
  summary,
  status: confidence >= 0.9 ? 'confirmed' : 'pending',
  createdAt: new Date().toISOString(),
});

const currentExercise = (state: GymState, context: CoachContext) =>
  state.today.exercises.find((exercise) => exercise.id === context.workoutExerciseId)
  ?? state.today.exercises[state.today.currentExerciseIndex];

const inferSetType = (input: string, exercise: WorkoutExercise): SetType => {
  if (/cluster/i.test(input)) return 'other';
  if (/warm[ -]?up/i.test(input)) return 'warm_up';
  if (/top(?: set)?/i.test(input)) return 'top_set';
  if (/back[ -]?off/i.test(input)) return 'backoff';
  if (/drop(?: set)?/i.test(input)) return 'drop_set';
  if (/amrap/i.test(input)) return 'amrap';
  if (/fail(?:ure|ed)?/i.test(input)) return 'failure';

  const knowledge = getExercise(exercise.exerciseId);
  if (!knowledge.isMainLift) return 'working';
  const working = getWorkingSets(exercise);
  return working.some((set) => set.type === 'top_set') ? 'backoff' : 'top_set';
};

const makeLogOperation = (
  exercise: WorkoutExercise,
  input: string,
  weight: number,
  reps: number,
  rpe?: number,
  rir?: number,
  note?: string,
): WorkoutOperation => ({
  type: 'LOG_SET',
  workoutExerciseId: exercise.id,
  source: 'ai',
  set: {
    type: inferSetType(input, exercise),
    weight,
    reps,
    rpe,
    rir,
    note,
    source: 'ai',
  },
});

const lastSet = (exercise: WorkoutExercise) => exercise.performedSets.at(-1);

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
}

function answerHistoryQuestion(state: GymState, input: string): AiResponse | null {
  const query = input.toLowerCase();
  const exerciseId = findExerciseFromText(input)?.id;

  if ((query.includes('shoulder') || query.includes('shoulders')) && (query.includes('lately') || query.includes('doing'))) {
    const inclineHistory = getExerciseHistory(state, 'incline-dumbbell-press');
    const note = inclineHistory
      .flatMap(({ exercise }) => exercise.performedSets)
      .find((set) => set.note?.toLowerCase().includes('shoulder'))?.note;
    return {
      category: 'history',
      text: note
        ? `Lately you’ve used incline dumbbell press for shoulders and upper chest. Last time was 75 × 10, 9, 8. You also noted: “${note}”`
        : 'I can see your recent pressing work, but I don’t have a specific shoulder note yet.',
    };
  }

  if (!exerciseId) return null;
  const entries = getExerciseHistory(state, exerciseId);
  if (!entries.length) {
    return { category: 'history', text: `I don’t have any ${getExercise(exerciseId).shortName} history yet.` };
  }

  if (query.includes('best') && /for\s+\d+/.test(query)) {
    const reps = Number(query.match(/for\s+(\d+)/)?.[1]);
    const candidates = entries.flatMap(({ workout, exercise }) =>
      exercise.performedSets
        .filter((set) => set.type !== 'warm_up' && set.reps === reps)
        .map((set) => ({ workout, set })),
    );
    if (!candidates.length) {
      return { category: 'history', text: `I don’t have a recorded ${reps}-rep ${getExercise(exerciseId).shortName} set yet.` };
    }
    const best = candidates.sort((a, b) => b.set.weight - a.set.weight)[0];
    return {
      category: 'history',
      text: `Your best recorded ${getExercise(exerciseId).shortName} for ${reps} is ${formatPerformedSet(best.set, state.preferences.units)} on ${dateLabel(best.workout.date)}.`,
    };
  }

  if (query.includes('progress') || query.includes('trending') || query.includes('changed')) {
    const topSets = entries
      .map(({ workout, exercise }) => ({
        workout,
        set: exercise.performedSets.find((set) => set.type === 'top_set')
          ?? exercise.performedSets.find((set) => set.type !== 'warm_up'),
      }))
      .filter((entry): entry is { workout: GymState['history'][number]; set: PerformedSet } => Boolean(entry.set))
      .reverse();
    if (topSets.length < 2) {
      return { category: 'history', text: 'I need at least two comparable sessions before I can call that a trend.' };
    }
    const sequence = topSets.slice(-3).map(({ workout, set }) => `${dateLabel(workout.date)}: ${set.weight} × ${set.reps}`).join(' → ');
    return {
      category: 'history',
      text: `${sequence}. The load is moving up while the rep target has stayed comparable. That’s a positive trend, not a guarantee—today’s performance is the next useful data point.`,
    };
  }

  if (query.includes('when') || query.includes('last time') || query.includes('last ')) {
    const { workout, exercise } = entries[0];
    const working = exercise.performedSets.filter((set) => set.type !== 'warm_up');
    if (!working.length) {
      return { category: 'history', text: `You last had ${getExercise(exerciseId).shortName} planned on ${dateLabel(workout.date)}, but I don’t have a performed working set.` };
    }
    const main = working[0];
    const backoffs = working.filter((set) => set.type === 'backoff');
    const suffix = backoffs.length
      ? `, then ${backoffs[0].weight} × ${backoffs[0].reps} × ${backoffs.length}`
      : '';
    return {
      category: 'history',
      text: `Last ${getExercise(exerciseId).shortName}: ${dateLabel(workout.date)} — ${formatPerformedSet(main, state.preferences.units)}${suffix}.`,
    };
  }

  return null;
}

function substitutionResponse(state: GymState, exercise: WorkoutExercise, input: string): AiResponse {
  const knowledge = getExercise(exercise.exerciseId);
  const available = rankSubstitutions(exercise.exerciseId, state.preferences).slice(0, 4);
  return {
    category: 'substitution',
    text: `${knowledge.shortName} unavailable—no problem. These keep the same basic intent. I’d use ${available[0]?.name ?? 'a similar movement'} first.`,
    interpretation: newInterpretation(input, 0.98, `Equipment issue for ${knowledge.name}`),
    actions: available.map((candidate) => ({
      label: candidate.shortName,
      kind: 'substitution',
      replacementExerciseId: candidate.id,
      operation: {
        type: 'CHANGE_EXERCISE',
        workoutExerciseId: exercise.id,
        replacementExerciseId: candidate.id,
        reason: 'Equipment unavailable',
        source: 'ai',
      },
    })),
  };
}

export function respondToCoach(state: GymState, input: string, context: CoachContext): AiResponse {
  const clean = input.trim();
  const query = clean.toLowerCase();
  const exercise = currentExercise(state, context);
  const knowledge = getExercise(exercise.exerciseId);

  const historical = answerHistoryQuestion(state, clean);
  if (historical) return historical;

  if (/^i(?:'|’)m done\.?$|^finish (?:the )?workout\.?$|^end (?:the )?workout\.?$/i.test(clean)) {
    if (state.today.status !== 'active') {
      return { category: 'general', text: 'Start the workout first, then I can finish and save it for you.' };
    }
    const operation: WorkoutOperation = { type: 'COMPLETE_WORKOUT', source: 'ai' };
    return {
      category: 'log',
      text: 'Workout finished and saved to History.',
      interpretation: newInterpretation(clean, 0.99, 'Complete and save the workout'),
      operation,
      autoApply: true,
    };
  }

  const directSwap = clean.match(/(?:change|switch|swap|replace)(?:\s+this)?(?:\s+exercise)?\s+(?:to|for)\s+(.+)/i);
  if (directSwap) {
    const replacement = findExerciseFromText(directSwap[1]);
    if (replacement && replacement.id !== exercise.exerciseId) {
      const operation: WorkoutOperation = {
        type: 'CHANGE_EXERCISE',
        workoutExerciseId: exercise.id,
        replacementExerciseId: replacement.id,
        reason: 'User-requested substitution',
        source: 'ai',
      };
      return {
        category: 'substitution',
        text: `Changed ${knowledge.shortName} to ${replacement.name}. The original plan is still preserved in the session record.`,
        interpretation: newInterpretation(clean, 0.99, `Replace ${knowledge.name} with ${replacement.name}`),
        operation,
        autoApply: true,
      };
    }
  }

  if (/(?:do|train|hit) shoulders instead|shoulders instead/i.test(query)) {
    const options = rankSubstitutions(exercise.exerciseId, state.preferences, 'shoulder').slice(0, 4);
    return {
      category: 'substitution',
      text: 'That changes the movement intent, so I won’t guess which shoulder exercise you mean. Pick one and I’ll update this exercise only.',
      interpretation: newInterpretation(clean, 0.78, 'Replace the current exercise with shoulder work'),
      actions: options.map((candidate) => ({
        label: candidate.shortName,
        kind: 'substitution',
        replacementExerciseId: candidate.id,
        operation: {
          type: 'CHANGE_EXERCISE',
          workoutExerciseId: exercise.id,
          replacementExerciseId: candidate.id,
          reason: 'User changed today’s movement intent',
          source: 'ai',
        },
      })),
    };
  }

  if (/pain|sharp|pinch|hurt|tweak|numb|tingl/i.test(clean)) {
    const observation: WorkoutOperation = {
      type: 'SAVE_EXERCISE_MEMORY',
      workoutExerciseId: exercise.id,
      kind: 'observation',
      text: clean,
      confirmed: false,
      source: 'ai',
    };
    return {
      category: 'safety',
      text: `Yeah, I wouldn’t force ${knowledge.shortName} today. Stop if it is sharp, worsening, or changes your movement. I can save what you reported as an observation—not a diagnosis—or swap this movement.`,
      actions: [
        { label: 'Save observation', kind: 'operation', operation: observation },
        ...rankSubstitutions(exercise.exerciseId, state.preferences).slice(0, 3).map((candidate): AiAction => ({
        label: candidate.shortName,
        kind: 'substitution',
        replacementExerciseId: candidate.id,
        operation: {
          type: 'CHANGE_EXERCISE',
          workoutExerciseId: exercise.id,
          replacementExerciseId: candidate.id,
          reason: 'Movement discomfort',
          source: 'ai',
        },
      })),
      ],
    };
  }

  if (/my core is weak|weak core/i.test(clean)) {
    return {
      category: 'general',
      text: 'That may be your read, but one hard set is not enough evidence for me to treat it as a lasting weakness. I can save the specific thing you noticed—like losing your brace—as an observation if you want.',
    };
  }

  if (/taken|unavailable|no (?:bench|rack|cable|machine)|busy/.test(query)) {
    return substitutionResponse(state, exercise, clean);
  }

  const time = query.match(/(?:only\s+have|got|in)\s+(\d{2,3})\s*(?:minutes|min)/);
  if (time) {
    const minutes = Number(time[1]);
    const operation: WorkoutOperation = { type: 'ADAPT_FOR_TIME', minutes, source: 'ai' };
    return {
      category: 'recommendation',
      text: minutes <= 30
        ? `For ${minutes} minutes: keep the full bench work, do two focused incline sets, skip cable fly, and finish with two quick triceps sets. Your actual program stays unchanged.`
        : `I’d keep the main work intact and trim only the lowest-priority accessory volume to fit ${minutes} minutes.`,
      interpretation: newInterpretation(clean, 0.97, `Adapt today’s workout to ${minutes} minutes`),
      actions: [{ label: `Apply ${minutes}-min plan`, kind: 'operation', operation }],
    };
  }

  const chosenWeight = query.match(/(?:i(?:'|’)m|i am)\s+(?:doing|using|going with)\s+(\d+(?:\.\d+)?)/i);
  if (chosenWeight) {
    const weight = Number(chosenWeight[1]);
    const operation: WorkoutOperation = {
      type: 'SET_USER_WEIGHT',
      workoutExerciseId: exercise.id,
      weight,
      source: 'ai',
    };
    return {
      category: 'log',
      text: `Got it—${weight} ${state.preferences.units}. That’s your call for today.`,
      interpretation: newInterpretation(clean, 0.99, `User chose ${weight} ${state.preferences.units}`),
      operation,
      autoApply: true,
    };
  }

  const lastSetRpe = query.match(/(?:last (?:rep|set)|that)(?:\s+was|\s+felt)?\s*(?:an?\s*)?(?:rpe\s*)?([5-9](?:\.5)?|10)(?:\s*rpe)?/i);
  if (lastSetRpe) {
    const previous = lastSet(exercise);
    if (!previous) return { category: 'general', text: 'There isn’t a performed set to attach that RPE to yet.' };
    const rpe = Number(lastSetRpe[1]);
    const operation: WorkoutOperation = {
      type: 'UPDATE_SET',
      workoutExerciseId: exercise.id,
      setId: previous.id,
      changes: { rpe },
      source: 'ai',
    };
    return {
      category: 'log',
      text: `Updated the last set to RPE ${rpe}. I’ll use that when deciding what comes next.`,
      interpretation: newInterpretation(clean, 0.98, `Set last set RPE to ${rpe}`),
      operation,
      autoApply: true,
      actions: [{ label: 'Edit last set', kind: 'edit_last' }],
    };
  }

  const correctedReps = query.match(/(?:i )?only got\s+(\d+)(?:\s*reps?)?/i);
  if (correctedReps) {
    const previous = lastSet(exercise);
    if (!previous) return { category: 'general', text: 'There isn’t a performed set to correct yet.' };
    const reps = Number(correctedReps[1]);
    const operation: WorkoutOperation = {
      type: 'UPDATE_SET',
      workoutExerciseId: exercise.id,
      setId: previous.id,
      changes: { reps },
      source: 'ai',
    };
    return {
      category: 'log',
      text: `Corrected the last set to ${previous.weight} × ${reps}. The planned target is unchanged.`,
      interpretation: newInterpretation(clean, 0.98, `Correct last set to ${reps} reps`),
      operation,
      autoApply: true,
      actions: [{ label: 'Edit last set', kind: 'edit_last' }],
    };
  }

  if (/another set|one more set|let(?:'|’)s do another/i.test(query)) {
    const previous = lastSet(exercise);
    const planned = exercise.plannedSets.at(-1);
    const operation: WorkoutOperation = {
      type: 'ADD_PLANNED_SET',
      workoutExerciseId: exercise.id,
      set: {
        type: previous?.type ?? planned?.type ?? 'working',
        targetReps: previous?.reps ?? planned?.targetReps ?? planned?.repRange?.[0] ?? 8,
        suggestedWeight: previous?.weight ?? planned?.suggestedWeight,
        note: 'Added during the workout',
      },
      source: 'ai',
    };
    return {
      category: 'log',
      text: `Added one more ${setTypeLabelsForCopy(operation.set.type)} set to today’s plan. Nothing has been logged yet.`,
      interpretation: newInterpretation(clean, 0.97, 'Add one planned set'),
      operation,
      autoApply: true,
    };
  }

  const remember = clean.match(/remember(?: that)?\s+(.+)/i);
  if (remember) {
    const operation: WorkoutOperation = {
      type: 'SAVE_EXERCISE_MEMORY',
      workoutExerciseId: exercise.id,
      kind: 'cue',
      text: remember[1].trim(),
      confirmed: true,
      source: 'ai',
    };
    return {
      category: 'log',
      text: `Saved as a confirmed ${knowledge.shortName} cue. I’ll surface it when this lift is current.`,
      interpretation: newInterpretation(clean, 0.95, `Remember a cue for ${knowledge.name}`),
      operation,
      autoApply: true,
    };
  }

  if (/probably had (?:one|1) more|one more in (?:me|the tank)/i.test(clean)) {
    const previous = lastSet(exercise);
    if (!previous) return { category: 'general', text: 'Tell me which set that effort note belongs to.' };
    const operation: WorkoutOperation = {
      type: 'UPDATE_SET',
      workoutExerciseId: exercise.id,
      setId: previous.id,
      changes: { rir: 1 },
      source: 'ai',
    };
    return {
      category: 'log',
      text: `Saved as about 1 RIR on ${previous.weight} × ${previous.reps}.`,
      interpretation: newInterpretation(clean, 0.96, 'Estimated 1 rep in reserve on the last set'),
      operation,
      autoApply: true,
      actions: [{ label: 'Edit last set', kind: 'edit_last' }],
    };
  }

  if (/way harder than last (?:week|time)|much harder than last (?:week|time)/i.test(clean)) {
    const previous = lastSet(exercise);
    if (!previous) return { category: 'general', text: 'I can save that once there’s a set to attach it to.' };
    const operation: WorkoutOperation = {
      type: 'UPDATE_SET',
      workoutExerciseId: exercise.id,
      setId: previous.id,
      changes: { qualitativeContext: 'Felt much harder than the previous comparable session.' },
      source: 'ai',
    };
    return {
      category: 'log',
      text: 'Saved that on the last set. I’ll treat it as context, not a made-up RPE.',
      interpretation: newInterpretation(clean, 0.94, 'Qualitative effort note on the last set'),
      operation,
      autoApply: true,
      actions: [{ label: 'Edit last set', kind: 'edit_last' }],
    };
  }

  if (/^same(?: thing| again)?[.!]?$/i.test(clean)) {
    const previous = lastSet(exercise);
    if (!previous) return { category: 'general', text: 'There isn’t a previous set here to repeat yet.' };
    const operation = makeLogOperation(exercise, clean, previous.weight, previous.reps, undefined, undefined, 'Repeated previous set via AI');
    return {
      category: 'log',
      text: `Logged. Next: ${previous.weight} × ${previous.reps}.`,
      interpretation: newInterpretation(clean, 0.98, `Repeat ${previous.weight} × ${previous.reps}`),
      operation,
      autoApply: true,
      actions: [{ label: 'Edit last set', kind: 'edit_last' }],
    };
  }

  const drop = query.match(/drop(?:ped)?\s+(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?)?(?:,|\s)+(?:and\s+)?got\s+(\d+)/i);
  if (drop) {
    const previous = lastSet(exercise);
    if (!previous) return { category: 'general', text: 'What load did you drop from?' };
    const weight = previous.weight - Number(drop[1]);
    const reps = Number(drop[2]);
    const operation = makeLogOperation(exercise, `${clean} drop set`, weight, reps);
    return {
      category: 'log',
      text: `I read that as ${weight} × ${reps}, a ${drop[1]}-lb drop from ${previous.weight}.`,
      interpretation: newInterpretation(clean, 0.82, `${weight} × ${reps}, drop set`),
      actions: [
        { label: `Log ${weight} × ${reps}`, kind: 'operation', operation },
        { label: 'Edit instead', kind: 'edit_last' },
      ],
    };
  }

  const setMatch = query.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(?:lb|lbs|pounds?)?\s*(?:x|×|for)\s*(\d+)(?:\s*(?:reps?)?)?/i);
  if (setMatch) {
    const weight = Number(setMatch[1]);
    const reps = Number(setMatch[2]);
    const rpeMatch = query.match(/(?:rpe\s*|felt like (?:an?\s*)?|@\s*)([5-9](?:\.5)?|10)/i);
    const rpe = rpeMatch ? Number(rpeMatch[1]) : undefined;
    const rirMatch = query.match(/(\d+)\s*(?:rir|reps? in reserve)/i);
    const rir = rirMatch ? Number(rirMatch[1]) : undefined;
    const note = /cluster/i.test(clean) ? 'Cluster set' : undefined;
    const operation = makeLogOperation(exercise, clean, weight, reps, rpe, rir, note);
    const summary = `${weight} × ${reps}${rpe ? ` @ ${rpe}` : rir !== undefined ? ` · ${rir} RIR` : ''}`;
    return {
      category: 'log',
      text: `Logged. ${getExercise(exercise.exerciseId).isMainLift ? `Next: ${weight} × ${reps}.` : ''}`.trim(),
      interpretation: newInterpretation(clean, 0.99, summary),
      operation,
      autoApply: true,
      actions: [{ label: 'Edit last set', kind: 'edit_last' }],
    };
  }

  if (/why|how did you get|reason/.test(query)) {
    const rec = [...state.recommendations].reverse().find((item) => item.exerciseId === exercise.exerciseId);
    return {
      category: 'recommendation',
      text: rec ? `${rec.fact} ${rec.rationale}` : 'I don’t have enough comparable data to give you a useful explanation yet.',
    };
  }

  if (/what should i (?:do|use)|recommend|suggest|weight/.test(query)) {
    if (exercise.userSelectedWeight) {
      return { category: 'recommendation', text: `You chose ${exercise.userSelectedWeight} ${state.preferences.units}, so that’s the target. I won’t keep pushing a different number.` };
    }
    const rec = [...state.recommendations].reverse().find((item) => item.exerciseId === exercise.exerciseId && item.status === 'active');
    return {
      category: 'recommendation',
      text: rec ? `${rec.recommendation} ${rec.fact}` : 'I’d follow today’s planned target. I don’t have new evidence that justifies changing it.',
    };
  }

  if (context.screen === 'history') {
    return { category: 'history', text: 'Ask me about a specific lift, rep best, or date and I’ll answer from your recorded sets.' };
  }

  const examples = context.screen === 'active'
    ? 'Try “225 for 5,” “same thing,” “bench is taken,” or “I only have 30 minutes.”'
    : 'I can check history, suggest a load, swap an exercise, or shorten today’s session.';
  return { category: 'general', text: examples };
}

export const coachPrompts: Record<CoachContext['screen'], string[]> = {
  today: ['Why 250 × 3?', 'I only have 30 minutes', 'What did I bench last time?'],
  active: ['225 for 5', 'Last set was RPE 9', 'Bench is taken'],
  history: ['What did I bench last time?', 'Best bench for 5?', 'How has my bench progressed?'],
  programs: ['Shorten Push to 45 minutes', 'Why top sets?', 'Swap cable fly'],
};

function setTypeLabelsForCopy(type: SetType) {
  return type.replace('_', ' ');
}
