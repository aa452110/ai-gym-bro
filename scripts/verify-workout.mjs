import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { createInitialGymState } = await server.ssrLoadModule('/lib/gym-data.ts');
  const { applyWorkoutOperation, getLatestRecommendation, getWarmups, getWorkingSets } = await server.ssrLoadModule('/lib/workout-engine.ts');
  const { respondToCoach } = await server.ssrLoadModule('/lib/ai-coach.ts');
  const { searchExercises } = await server.ssrLoadModule('/lib/exercise-search.ts');

  const shoulderResults = searchExercises('dumbbell shoulder').map((exercise) => exercise.id);
  assert.deepEqual(
    new Set(shoulderResults),
    new Set(['dumbbell-shoulder-press', 'arnold-press', 'dumbbell-lateral-raise']),
    'multi-term search should use names, aliases, muscles, equipment, and movement metadata',
  );

  const clusterState = applyWorkoutOperation(createInitialGymState(), { type: 'START_WORKOUT', source: 'manual' });
  const cluster = respondToCoach(clusterState, 'I just did 405 for 3 as a cluster', { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(cluster.operation?.type, 'LOG_SET');
  assert.equal(cluster.operation?.set.type, 'other');
  assert.equal(cluster.operation?.set.note, 'Cluster set');

  let state = createInitialGymState();
  const plannedSnapshot = JSON.stringify(state.today.exercises[0].plannedSets);
  state = applyWorkoutOperation(state, { type: 'START_WORKOUT', source: 'manual' });

  for (const [weight, reps] of [[135, 8], [185, 5], [205, 3], [225, 1]]) {
    state = applyWorkoutOperation(state, {
      type: 'LOG_SET',
      workoutExerciseId: 'today-bench',
      source: 'manual',
      set: { type: 'warm_up', weight, reps, source: 'manual' },
    });
  }
  assert.equal(getWarmups(state.today.exercises[0]).length, 4);
  assert.equal(JSON.stringify(state.today.exercises[0].plannedSets), plannedSnapshot, 'performed warm-ups must not overwrite the plan');

  state = applyWorkoutOperation(state, {
    type: 'LOG_SET',
    workoutExerciseId: 'today-bench',
    source: 'manual',
    set: { type: 'top_set', weight: 250, reps: 3, rpe: 8, source: 'manual' },
  });
  let recommendation = getLatestRecommendation(state, state.today.exercises[0]);
  assert.equal(recommendation?.suggestedWeight, 225);
  assert.match(recommendation?.recommendation ?? '', /backoffs/i);

  state = applyWorkoutOperation(state, {
    type: 'LOG_SET',
    workoutExerciseId: 'today-bench',
    source: 'manual',
    set: { type: 'backoff', weight: 225, reps: 5, rpe: 7, source: 'manual' },
  });
  recommendation = getLatestRecommendation(state, state.today.exercises[0]);
  assert.equal(recommendation?.suggestedWeight, 225);
  assert.match(recommendation?.recommendation ?? '', /stay/i);

  const clearLog = respondToCoach(state, '225 for 5', { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(clearLog.autoApply, true);
  assert.equal(clearLog.operation?.type, 'LOG_SET');
  if (clearLog.operation) state = applyWorkoutOperation(state, clearLog.operation);
  assert.equal(getWorkingSets(state.today.exercises[0]).length, 3);

  const effortCorrection = respondToCoach(state, 'Last set was RPE 9', { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(effortCorrection.operation?.type, 'UPDATE_SET');
  if (effortCorrection.operation) state = applyWorkoutOperation(state, effortCorrection.operation);
  assert.equal(getWorkingSets(state.today.exercises[0]).at(-1)?.rpe, 9);
  assert.equal(getLatestRecommendation(state, state.today.exercises[0])?.suggestedWeight, 215);

  const repCorrection = respondToCoach(state, 'I only got 3', { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(repCorrection.operation?.type, 'UPDATE_SET');
  if (repCorrection.operation) state = applyWorkoutOperation(state, repCorrection.operation);
  assert.equal(getWorkingSets(state.today.exercises[0]).at(-1)?.reps, 3);
  assert.equal(JSON.stringify(state.today.exercises[0].plannedSets), plannedSnapshot, 'correcting performance must not rewrite the plan');

  const extraSet = respondToCoach(state, "Let's do another set", { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(extraSet.operation?.type, 'ADD_PLANNED_SET');
  if (extraSet.operation) state = applyWorkoutOperation(state, extraSet.operation);
  assert.equal(state.today.exercises[0].plannedSets.length, 5);
  assert.equal(getWorkingSets(state.today.exercises[0]).length, 3, 'adding to the plan must not fabricate a performed set');

  const override = respondToCoach(state, "I'm doing 245", { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(override.operation?.type, 'SET_USER_WEIGHT');
  if (override.operation) state = applyWorkoutOperation(state, override.operation);
  assert.equal(state.today.exercises[0].userSelectedWeight, 245);

  const historyAnswer = respondToCoach(state, 'What did I bench last time?', { screen: 'history' });
  assert.match(historyAnswer.text, /235/);
  assert.match(historyAnswer.text, /Sep 10/);

  const rememberedCue = respondToCoach(state, 'Remember keep the bar stacked over my wrists', { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(rememberedCue.operation?.type, 'SAVE_EXERCISE_MEMORY');
  if (rememberedCue.operation) state = applyWorkoutOperation(state, rememberedCue.operation);
  assert.equal(state.trainingMemories[0].exerciseId, 'bench-press');
  assert.equal(state.trainingMemories[0].confirmed, true);

  const aiSwap = respondToCoach(state, 'Change this exercise to RDLs', { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(aiSwap.operation?.type, 'CHANGE_EXERCISE');
  assert.equal(aiSwap.operation?.replacementExerciseId, 'romanian-deadlift');
  const manualSwapState = applyWorkoutOperation(state, {
    type: 'CHANGE_EXERCISE', workoutExerciseId: 'today-bench', replacementExerciseId: 'romanian-deadlift', reason: 'User-requested substitution', source: 'manual',
  });
  if (aiSwap.operation) state = applyWorkoutOperation(state, aiSwap.operation);
  assert.deepEqual(
    { exerciseId: state.today.exercises[0].exerciseId, originalExerciseId: state.today.exercises[0].originalExerciseId },
    { exerciseId: manualSwapState.today.exercises[0].exerciseId, originalExerciseId: manualSwapState.today.exercises[0].originalExerciseId },
    'manual UI and coach commands must edit the same workout state',
  );
  assert.equal(state.today.exercises[0].originalExerciseId, 'bench-press');
  assert.equal(state.today.exercises[0].exerciseId, 'romanian-deadlift');

  const finish = respondToCoach(state, "I'm done", { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(finish.operation?.type, 'COMPLETE_WORKOUT');
  if (finish.operation) state = applyWorkoutOperation(state, finish.operation);
  assert.equal(state.history[0].id, state.today.id);
  assert.equal(getWarmups(state.history[0].exercises[0]).length, 4);
  assert.equal(state.history[0].exercises[0].plannedSets.length, 5);

  console.log('Reference workout verified: shared validated state, plan/performance separation, corrections, optional effort, extra sets, search, memory, substitution, history, and completion.');
} finally {
  await server.close();
}
