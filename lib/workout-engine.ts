import { createInitialGymState, getExercise } from './gym-data';
import type {
  GymState,
  PerformedSet,
  PlannedSet,
  Recommendation,
  SetType,
  ValidationResult,
  WorkoutExercise,
  WorkoutOperation,
} from './gym-types';

export const workingSetTypes: SetType[] = [
  'working',
  'top_set',
  'backoff',
  'drop_set',
  'amrap',
  'failure',
  'other',
];

export const setTypeLabels: Record<SetType, string> = {
  warm_up: 'Warm-up',
  working: 'Working',
  top_set: 'Top set',
  backoff: 'Backoff',
  drop_set: 'Drop set',
  amrap: 'AMRAP',
  failure: 'Failure',
  other: 'Other',
};

export function formatPlannedSet(set: PlannedSet) {
  const reps = set.targetReps
    ? `${set.targetReps}`
    : set.repRange
      ? `${set.repRange[0]}–${set.repRange[1]}`
      : 'open';
  return `${setTypeLabels[set.type]} × ${reps}`;
}

export function formatPerformedSet(set: PerformedSet, units = 'lb') {
  const effort = set.rpe ? ` @ ${set.rpe}` : set.rir !== undefined ? ` · ${set.rir} RIR` : '';
  return `${set.weight} ${units} × ${set.reps}${effort}`;
}

export function getWarmups(exercise: WorkoutExercise) {
  return exercise.performedSets.filter((set) => set.type === 'warm_up');
}

export function getWorkingSets(exercise: WorkoutExercise) {
  return exercise.performedSets.filter((set) => workingSetTypes.includes(set.type));
}

export function validateWorkoutOperation(state: GymState, operation: WorkoutOperation): ValidationResult {
  if (operation.type === 'RESET_DEMO' || operation.type === 'START_WORKOUT') return { ok: true };

  if (operation.type === 'ADAPT_FOR_TIME') {
    return operation.minutes >= 15 && operation.minutes <= 180
      ? { ok: true }
      : { ok: false, error: 'Choose a time between 15 and 180 minutes.' };
  }

  if (operation.type === 'COMPLETE_WORKOUT') {
    return state.today.status === 'active'
      ? { ok: true }
      : { ok: false, error: 'Start the workout before finishing it.' };
  }

  const exerciseId = 'workoutExerciseId' in operation ? operation.workoutExerciseId : undefined;
  const exercise = state.today.exercises.find((item) => item.id === exerciseId);
  if (!exercise) return { ok: false, error: 'That exercise is not part of today’s workout.' };

  if (operation.type === 'LOG_SET') {
    if (!Number.isFinite(operation.set.weight) || operation.set.weight < 0 || operation.set.weight > 2000) {
      return { ok: false, error: 'Enter a valid weight.' };
    }
    if (!Number.isInteger(operation.set.reps) || operation.set.reps < 1 || operation.set.reps > 100) {
      return { ok: false, error: 'Enter reps between 1 and 100.' };
    }
    if (operation.set.rpe !== undefined && (operation.set.rpe < 5 || operation.set.rpe > 10)) {
      return { ok: false, error: 'RPE must be between 5 and 10.' };
    }
    if (operation.set.rir !== undefined && (operation.set.rir < 0 || operation.set.rir > 10)) {
      return { ok: false, error: 'RIR must be between 0 and 10.' };
    }
  }

  if (operation.type === 'UPDATE_SET') {
    if (!exercise.performedSets.some((set) => set.id === operation.setId)) {
      return { ok: false, error: 'That set no longer exists.' };
    }
    if (operation.changes.weight !== undefined && (operation.changes.weight < 0 || operation.changes.weight > 2000)) {
      return { ok: false, error: 'Enter a valid weight.' };
    }
    if (operation.changes.reps !== undefined && (operation.changes.reps < 1 || operation.changes.reps > 100)) {
      return { ok: false, error: 'Enter reps between 1 and 100.' };
    }
  }

  if (operation.type === 'SET_USER_WEIGHT' && (operation.weight <= 0 || operation.weight > 2000)) {
    return { ok: false, error: 'Enter a valid weight.' };
  }

  if (operation.type === 'CHANGE_EXERCISE' && !getExercise(operation.replacementExerciseId)) {
    return { ok: false, error: 'Choose an exercise from the exercise library.' };
  }

  if (operation.type === 'ADD_NOTE' && !operation.note.trim()) {
    return { ok: false, error: 'Write a note before saving it.' };
  }

  return { ok: true };
}

const makeSetId = () => `set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const makeRecommendationId = () => `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

function backoffRecommendation(state: GymState, exercise: WorkoutExercise, newSet: PerformedSet): Recommendation | null {
  if (exercise.exerciseId !== 'bench-press' && exercise.originalExerciseId !== 'bench-press') return null;

  if (newSet.type === 'top_set') {
    const effort = newSet.rpe;
    const weight = effort !== undefined && effort > 8.5 ? 215 : 225;
    const qualifier = effort === undefined
      ? 'Without an effort rating, this keeps the drop conservative.'
      : effort <= 8.5
        ? `An RPE ${effort} says the top set landed where it should.`
        : `An RPE ${effort} was heavier than planned, so a slightly larger drop makes sense.`;
    return {
      id: makeRecommendationId(),
      workoutId: state.today.id,
      exerciseId: exercise.exerciseId,
      kind: 'backoff',
      fact: `You completed ${newSet.weight} × ${newSet.reps}${effort ? ` @ ${effort}` : ''}.`,
      recommendation: `Use ${weight} × 5 for the backoffs.`,
      rationale: `${qualifier} The target remains three productive sets of five.`,
      suggestedWeight: weight,
      suggestedReps: 5,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  if (newSet.type === 'backoff' && newSet.rpe !== undefined) {
    const weight = newSet.rpe >= 9 ? Math.max(0, newSet.weight - 10) : newSet.weight;
    return {
      id: makeRecommendationId(),
      workoutId: state.today.id,
      exerciseId: exercise.exerciseId,
      kind: 'backoff',
      fact: `Your first backoff was ${newSet.weight} × ${newSet.reps} @ ${newSet.rpe}.`,
      recommendation: newSet.rpe >= 9
        ? `Drop to ${weight} for the remaining sets.`
        : `Stay at ${weight} for the next set.`,
      rationale: newSet.rpe >= 9
        ? 'That set was near the top of the useful effort range. A small drop protects rep quality.'
        : 'That effort is on target, so there is no reason to change the load.',
      suggestedWeight: weight,
      suggestedReps: 5,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
  }

  return null;
}

function markExerciseProgress(exercise: WorkoutExercise) {
  if (exercise.status === 'skipped') return;
  const completedWorking = getWorkingSets(exercise).length;
  const target = exercise.sessionTargetSets ?? exercise.plannedSets.filter((set) => !set.optional || true).length;
  exercise.status = completedWorking >= target ? 'complete' : completedWorking > 0 ? 'active' : 'pending';
}

export function applyWorkoutOperation(state: GymState, operation: WorkoutOperation): GymState {
  const validation = validateWorkoutOperation(state, operation);
  if (!validation.ok) throw new Error(validation.error);
  if (operation.type === 'RESET_DEMO') return createInitialGymState();

  const next = structuredClone(state) as GymState;

  if (operation.type === 'START_WORKOUT') {
    next.today.status = 'active';
    next.today.startedAt ??= new Date().toISOString();
    next.today.exercises[0].status = 'active';
    return next;
  }

  if (operation.type === 'COMPLETE_WORKOUT') {
    next.today.status = 'completed';
    next.today.completedAt = new Date().toISOString();
    next.today.exercises.forEach((exercise) => {
      if (exercise.status === 'active' || (exercise.status === 'pending' && exercise.performedSets.length)) {
        exercise.status = 'complete';
      }
    });
    const saved = structuredClone(next.today) as WorkoutExercise extends never ? never : typeof next.today;
    next.history = [saved, ...next.history.filter((workout) => workout.id !== saved.id)];
    return next;
  }

  if (operation.type === 'ADAPT_FOR_TIME') {
    next.today.timeCapMinutes = operation.minutes;
    if (operation.minutes <= 30) {
      next.today.exercises[0].sessionTargetSets = 4;
      next.today.exercises[0].adaptationNote = 'Keep the top set and all three backoffs.';
      next.today.exercises[1].sessionTargetSets = 2;
      next.today.exercises[1].adaptationNote = 'Two focused sets today.';
      next.today.exercises[2].status = 'skipped';
      next.today.exercises[2].adaptationNote = 'Skipped for today’s time cap; the program stays unchanged.';
      next.today.exercises[3].sessionTargetSets = 2;
      next.today.exercises[3].adaptationNote = 'Two quick sets to finish.';
    } else if (operation.minutes <= 45) {
      next.today.exercises[0].sessionTargetSets = 4;
      next.today.exercises[1].sessionTargetSets = 3;
      next.today.exercises[2].status = 'skipped';
      next.today.exercises[3].sessionTargetSets = 2;
    }
    return next;
  }

  const index = 'workoutExerciseId' in operation
    ? next.today.exercises.findIndex((exercise) => exercise.id === operation.workoutExerciseId)
    : -1;
  const exercise = next.today.exercises[index];

  if (operation.type === 'SELECT_EXERCISE') {
    next.today.currentExerciseIndex = index;
    if (exercise.status === 'pending') exercise.status = 'active';
    return next;
  }

  if (operation.type === 'LOG_SET') {
    next.today.status = 'active';
    next.today.startedAt ??= new Date().toISOString();
    const newSet: PerformedSet = {
      ...operation.set,
      source: operation.source,
      id: makeSetId(),
      createdAt: new Date().toISOString(),
    };
    exercise.performedSets.push(newSet);
    markExerciseProgress(exercise);
    const recommendation = backoffRecommendation(next, exercise, newSet);
    if (recommendation) {
      next.recommendations = next.recommendations.map((item) =>
        item.exerciseId === exercise.exerciseId && item.status === 'active'
          ? { ...item, status: 'accepted' as const }
          : item,
      );
      next.recommendations.push(recommendation);
    }
    return next;
  }

  if (operation.type === 'UPDATE_SET') {
    exercise.performedSets = exercise.performedSets.map((set) =>
      set.id === operation.setId ? { ...set, ...operation.changes } : set,
    );
    markExerciseProgress(exercise);
    return next;
  }

  if (operation.type === 'REMOVE_SET') {
    exercise.performedSets = exercise.performedSets.filter((set) => set.id !== operation.setId);
    markExerciseProgress(exercise);
    return next;
  }

  if (operation.type === 'CHANGE_EXERCISE') {
    exercise.originalExerciseId ??= exercise.exerciseId;
    exercise.exerciseId = operation.replacementExerciseId;
    exercise.substitutionReason = operation.reason;
    exercise.userSelectedWeight = undefined;
    return next;
  }

  if (operation.type === 'SKIP_EXERCISE') {
    exercise.status = 'skipped';
    const nextAvailable = next.today.exercises.findIndex((item, itemIndex) => itemIndex > index && item.status !== 'skipped');
    if (nextAvailable >= 0) next.today.currentExerciseIndex = nextAvailable;
    return next;
  }

  if (operation.type === 'ADD_NOTE') {
    exercise.notes.push(operation.note.trim());
    return next;
  }

  if (operation.type === 'SET_USER_WEIGHT') {
    exercise.userSelectedWeight = operation.weight;
    next.recommendations = next.recommendations.map((item) =>
      item.exerciseId === exercise.exerciseId && item.status === 'active'
        ? {
            ...item,
            status: 'overridden' as const,
            userDecision: `You chose ${operation.weight} lb.`,
          }
        : item,
    );
    return next;
  }

  return next;
}

export function getLatestRecommendation(state: GymState, exercise: WorkoutExercise) {
  return [...state.recommendations]
    .reverse()
    .find((recommendation) =>
      recommendation.exerciseId === exercise.exerciseId && recommendation.status === 'active',
    );
}

export function getExerciseHistory(state: GymState, exerciseId: string) {
  return state.history
    .map((workout) => ({
      workout,
      exercise: workout.exercises.find((item) => item.exerciseId === exerciseId || item.originalExerciseId === exerciseId),
    }))
    .filter((entry): entry is { workout: GymState['history'][number]; exercise: WorkoutExercise } => Boolean(entry.exercise));
}
