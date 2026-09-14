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

  const override = respondToCoach(state, "I'm doing 245", { screen: 'active', workoutExerciseId: 'today-bench' });
  assert.equal(override.operation?.type, 'SET_USER_WEIGHT');
  if (override.operation) state = applyWorkoutOperation(state, override.operation);
  assert.equal(state.today.exercises[0].userSelectedWeight, 245);

  const historyAnswer = respondToCoach(state, 'What did I bench last time?', { screen: 'history' });
  assert.match(historyAnswer.text, /235/);
  assert.match(historyAnswer.text, /Sep 10/);

  state = applyWorkoutOperation(state, {
    type: 'CHANGE_EXERCISE',
    workoutExerciseId: 'today-bench',
    replacementExerciseId: 'smith-bench',
    reason: 'Bench unavailable',
    source: 'manual',
  });
  assert.equal(state.today.exercises[0].originalExerciseId, 'bench-press');
  assert.equal(state.today.exercises[0].exerciseId, 'smith-bench');

  state = applyWorkoutOperation(state, { type: 'COMPLETE_WORKOUT', source: 'manual' });
  assert.equal(state.history[0].id, state.today.id);
  assert.equal(getWarmups(state.history[0].exercises[0]).length, 4);
  assert.equal(state.history[0].exercises[0].plannedSets.length, 4);

  console.log('Reference workout verified: plan/performance separation, warm-ups, adaptation, AI logging, override, substitution, history, and completion.');
} finally {
  await server.close();
}
