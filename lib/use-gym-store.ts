'use client';

/* oxlint-disable react/react-compiler -- Hydration intentionally replaces the deterministic seed with persisted device state after mount. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { createInitialGymState } from './gym-data';
import type {
  GymState,
  Interpretation,
  ProgramDay,
  UserPreferences,
  ValidationResult,
  WorkoutOperation,
} from './gym-types';
import { applyWorkoutOperation, validateWorkoutOperation } from './workout-engine';

const STORAGE_KEY = 'ai-gym-bro-state-v3';

export function useGymStore() {
  const [state, setState] = useState<GymState>(() => createInitialGymState());
  const [canUndo, setCanUndo] = useState(false);
  const stateRef = useRef(state);
  const previousRef = useRef<GymState | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as GymState;
        if (parsed.version === createInitialGymState().version) {
          stateRef.current = parsed;
          setState(parsed);
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (!hydratedRef.current) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const commit = useCallback((next: GymState, remember = true) => {
    if (remember) {
      previousRef.current = stateRef.current;
      setCanUndo(true);
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const dispatchOperation = useCallback((operation: WorkoutOperation): ValidationResult => {
    const validation = validateWorkoutOperation(stateRef.current, operation);
    if (!validation.ok) return validation;
    try {
      commit(applyWorkoutOperation(stateRef.current, operation));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'That change could not be saved.' };
    }
  }, [commit]);

  const undo = useCallback(() => {
    if (!previousRef.current) return false;
    const previous = previousRef.current;
    previousRef.current = null;
    setCanUndo(false);
    commit(previous, false);
    return true;
  }, [commit]);

  const updatePreferences = useCallback((changes: Partial<UserPreferences>) => {
    const next = structuredClone(stateRef.current) as GymState;
    next.preferences = { ...next.preferences, ...changes };
    commit(next);
  }, [commit]);

  const updateProgramDay = useCallback((dayId: string, changes: Partial<Pick<ProgramDay, 'name' | 'focus' | 'estimatedMinutes'>>) => {
    const next = structuredClone(stateRef.current) as GymState;
    next.program.days = next.program.days.map((day) => day.id === dayId ? { ...day, ...changes } : day);
    commit(next);
  }, [commit]);

  const addProgramExercise = useCallback((dayId: string, exerciseId: string) => {
    const next = structuredClone(stateRef.current) as GymState;
    next.program.days = next.program.days.map((day) => {
      if (day.id !== dayId || day.exercises.some((exercise) => exercise.exerciseId === exerciseId)) return day;
      return {
        ...day,
        exercises: [
          ...day.exercises,
          {
            id: `program-exercise-${Date.now()}`,
            exerciseId,
            label: '3 × 8–12',
            detail: '3 × 8–12',
            optional: true,
          },
        ],
      };
    });
    commit(next);
  }, [commit]);

  const removeProgramExercise = useCallback((dayId: string, programExerciseId: string) => {
    const next = structuredClone(stateRef.current) as GymState;
    next.program.days = next.program.days.map((day) =>
      day.id === dayId
        ? { ...day, exercises: day.exercises.filter((exercise) => exercise.id !== programExerciseId) }
        : day,
    );
    commit(next);
  }, [commit]);

  const addProgramDay = useCallback((name: string, focus: string, estimatedMinutes: number) => {
    const next = structuredClone(stateRef.current) as GymState;
    next.program.days.push({
      id: `program-day-${Date.now()}`,
      name: name.trim() || 'New day',
      focus: focus.trim() || 'Training',
      estimatedMinutes,
      exercises: [],
    });
    commit(next);
  }, [commit]);

  const saveInterpretation = useCallback((interpretation: Interpretation) => {
    const next = structuredClone(stateRef.current) as GymState;
    next.interpretations.unshift(interpretation);
    next.interpretations = next.interpretations.slice(0, 50);
    commit(next, false);
  }, [commit]);

  return {
    state,
    stateRef,
    dispatchOperation,
    undo,
    canUndo,
    updatePreferences,
    updateProgramDay,
    addProgramExercise,
    removeProgramExercise,
    addProgramDay,
    saveInterpretation,
  };
}
