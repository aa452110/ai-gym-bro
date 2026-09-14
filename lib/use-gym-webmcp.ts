'use client';

import { useEffect } from 'react';

import type { GymState, SetType, ValidationResult, WorkoutOperation } from './gym-types';

interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute(input: unknown): unknown;
}

interface ModelContext {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): void | Promise<void>;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContext;
  }
}

const validSetTypes: SetType[] = ['warm_up', 'working', 'top_set', 'backoff', 'drop_set', 'amrap', 'failure', 'other'];

export function useGymWebMcp(
  stateRef: { current: GymState },
  dispatchOperation: (operation: WorkoutOperation) => ValidationResult,
  showActiveWorkout: () => void,
) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: WebMcpTool) => {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
      } catch {
        // Unsupported or partial implementations should not interrupt the workout UI.
      }
    };

    register({
      name: 'gym_read_today',
      title: 'Read today’s workout',
      description: 'Read the planned workout, performed sets, and current exercise without changing anything.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const workout = stateRef.current.today;
        return {
          id: workout.id,
          title: `${workout.title} — ${workout.focus}`,
          status: workout.status,
          currentExerciseId: workout.exercises[workout.currentExerciseIndex]?.exerciseId,
          exercises: workout.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            status: exercise.status,
            plannedSetCount: exercise.plannedSets.length,
            performedSets: exercise.performedSets.map((set) => ({
              type: set.type,
              weight: set.weight,
              reps: set.reps,
              rpe: set.rpe,
              rir: set.rir,
            })),
          })),
        };
      },
    });

    register({
      name: 'gym_start_today_workout',
      title: 'Start today’s workout',
      description: 'Start today’s planned workout and show the active workout screen.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        const result = dispatchOperation({ type: 'START_WORKOUT', source: 'webmcp' });
        if (!result.ok) throw new Error(result.error);
        showActiveWorkout();
        return { status: 'active', workoutId: stateRef.current.today.id };
      },
    });

    register({
      name: 'gym_log_set',
      title: 'Log a workout set',
      description: 'Validate and log one performed set against an exercise in today’s workout.',
      inputSchema: {
        type: 'object',
        properties: {
          workoutExerciseId: { type: 'string', description: 'Workout exercise row ID; defaults to the current exercise.' },
          weight: { type: 'number', minimum: 0, maximum: 2000 },
          reps: { type: 'integer', minimum: 1, maximum: 100 },
          rpe: { type: 'number', minimum: 5, maximum: 10 },
          rir: { type: 'number', minimum: 0, maximum: 10 },
          setType: { type: 'string', enum: validSetTypes },
        },
        required: ['weight', 'reps', 'setType'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object') throw new Error('Set details are required.');
        const values = input as Record<string, unknown>;
        if (typeof values.weight !== 'number' || typeof values.reps !== 'number' || !Number.isInteger(values.reps)) {
          throw new Error('Weight must be a number and reps must be a whole number.');
        }
        if (typeof values.setType !== 'string' || !validSetTypes.includes(values.setType as SetType)) {
          throw new Error('Choose a supported set type.');
        }
        const fallback = stateRef.current.today.exercises[stateRef.current.today.currentExerciseIndex];
        const workoutExerciseId = typeof values.workoutExerciseId === 'string' ? values.workoutExerciseId : fallback?.id;
        if (!workoutExerciseId) throw new Error('No current exercise is available.');
        const operation: WorkoutOperation = {
          type: 'LOG_SET',
          workoutExerciseId,
          source: 'webmcp',
          set: {
            type: values.setType as SetType,
            weight: values.weight,
            reps: values.reps,
            rpe: typeof values.rpe === 'number' ? values.rpe : undefined,
            rir: typeof values.rir === 'number' ? values.rir : undefined,
            source: 'webmcp',
          },
        };
        const result = dispatchOperation(operation);
        if (!result.ok) throw new Error(result.error);
        return {
          status: 'logged',
          workoutExerciseId,
          set: { weight: values.weight, reps: values.reps, type: values.setType, rpe: values.rpe, rir: values.rir },
        };
      },
    });

    return () => lifecycle.abort();
  }, [dispatchOperation, showActiveWorkout, stateRef]);
}
