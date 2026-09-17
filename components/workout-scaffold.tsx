'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { APP_VERSION } from '@/lib/app-version';

type WorkoutCategory = {
  id: string;
  name: string;
  exercises: string[];
};

type SelectedWorkout = {
  categoryId: string;
  category: string;
  exercise: string;
  key: string;
};

type SetDraft = {
  id: number;
  weight: string;
  reps: string;
};

const workoutCategories: WorkoutCategory[] = [
  {
    id: 'chest-triceps',
    name: 'Chest & Triceps',
    exercises: [
      'Barbell Bench',
      'Incline Dumbbell Bench',
      'Incline Barbell Bench',
      'Incline Smith Machine Bench',
      'Incline Chest Press',
      'Dumbbell Chest Flies',
      'Pec Deck',
      'Tricep Pushdown',
      'Skull Crushers',
    ],
  },
  {
    id: 'legs',
    name: 'Legs',
    exercises: [
      'Barbell Back Squat',
      'Leg Press',
      'Bulgarian Split Squat',
      'Goblet Squat',
      'Leg Extension',
      'Hamstring Curls',
      'Seated Calf Raise',
    ],
  },
  {
    id: 'shoulders-biceps',
    name: 'Shoulders & Biceps',
    exercises: [
      'Dumbbell Shoulder Press',
      'Military Press',
      'Machine Shoulder Press',
      'Lateral Raises',
      'Face Pulls',
      'Delt Flies',
      'EZ-Bar Bicep Curls',
      'Seated Bicep Curls',
      'Hammer Curls',
      'Single-Arm Preacher Curls',
    ],
  },
  {
    id: 'back',
    name: 'Back',
    exercises: [
      'Pull-Ups',
      'Lat Pulldowns',
      'Seated Row',
      'Barbell Row',
      'Dumbbell Row',
      'Lat Pullover',
      'Reverse Pec Deck',
      'Deadlift',
      'Shrugs',
    ],
  },
];

export function WorkoutScaffold() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectedWorkout, setSelectedWorkout] =
    useState<SelectedWorkout | null>(null);
  const [setsByWorkout, setSetsByWorkout] = useState<
    Record<string, SetDraft[]>
  >({});
  const nextSetId = useRef(1);
  const lastCategoryButtonId = useRef<string | null>(null);
  const lastExerciseButtonId = useRef<string | null>(null);

  const selectedCategory = workoutCategories.find(
    (category) => category.id === selectedCategoryId,
  );

  useEffect(() => {
    if (selectedCategoryId || !lastCategoryButtonId.current) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(lastCategoryButtonId.current ?? '')?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedCategoryId]);

  useEffect(() => {
    if (selectedWorkout || !lastExerciseButtonId.current) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(lastExerciseButtonId.current ?? '')?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedWorkout]);

  const chooseCategory = (category: WorkoutCategory) => {
    lastCategoryButtonId.current = categoryButtonId(category.id);
    setSelectedCategoryId(category.id);
  };

  const chooseWorkout = (category: WorkoutCategory, exercise: string) => {
    const key = workoutKey(category.id, exercise);
    const firstSet: SetDraft = {
      id: nextSetId.current++,
      weight: '',
      reps: '',
    };

    lastExerciseButtonId.current = exerciseButtonId(category.id, exercise);
    setSetsByWorkout((current) =>
      current[key] ? current : { ...current, [key]: [firstSet] },
    );
    setSelectedWorkout({
      categoryId: category.id,
      category: category.name,
      exercise,
      key,
    });
  };

  const changeSet = (
    workoutSetKey: string,
    setId: number,
    field: 'weight' | 'reps',
    value: string,
  ) => {
    setSetsByWorkout((current) => ({
      ...current,
      [workoutSetKey]: current[workoutSetKey].map((set) =>
        set.id === setId ? { ...set, [field]: value } : set,
      ),
    }));
  };

  const addSet = (workoutSetKey: string) => {
    const set: SetDraft = {
      id: nextSetId.current++,
      weight: '',
      reps: '',
    };

    setSetsByWorkout((current) => ({
      ...current,
      [workoutSetKey]: [...current[workoutSetKey], set],
    }));

    return set.id;
  };

  const removeSet = (workoutSetKey: string, setId: number) => {
    setSetsByWorkout((current) => {
      const sets = current[workoutSetKey];
      if (sets.length === 1) return current;

      return {
        ...current,
        [workoutSetKey]: sets.filter((set) => set.id !== setId),
      };
    });
  };

  if (selectedWorkout) {
    const sets = setsByWorkout[selectedWorkout.key] ?? [];

    return (
      <WorkoutDetail
        key={selectedWorkout.key}
        workout={selectedWorkout}
        sets={sets}
        onBack={() => setSelectedWorkout(null)}
        onChangeSet={(setId, field, value) =>
          changeSet(selectedWorkout.key, setId, field, value)
        }
        onAddSet={() => addSet(selectedWorkout.key)}
        onRemoveSet={(setId) => removeSet(selectedWorkout.key, setId)}
      />
    );
  }

  if (selectedCategory) {
    return (
      <CategoryWorkoutList
        category={selectedCategory}
        onBack={() => setSelectedCategoryId(null)}
        onChooseWorkout={(exercise) =>
          chooseWorkout(selectedCategory, exercise)
        }
      />
    );
  }

  return (
    <main className="category-launch-screen">
      <section
        className="category-launch-content"
        aria-label="Choose a workout category"
      >
        {workoutCategories.map((category) => (
          <button
            key={category.id}
            id={categoryButtonId(category.id)}
            type="button"
            className="category-launch-button"
            onClick={() => chooseCategory(category)}
          >
            <span>{category.name}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </section>

      <VersionFooter />
    </main>
  );
}

function CategoryWorkoutList({
  category,
  onBack,
  onChooseWorkout,
}: {
  category: WorkoutCategory;
  onBack: () => void;
  onChooseWorkout: (exercise: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="category-launch-screen category-workout-screen">
      <button
        className="category-screen-back"
        type="button"
        onClick={onBack}
        aria-label="Back to workout categories"
      >
        <ArrowLeft aria-hidden="true" />
      </button>

      <section className="selected-category-content">
        <h1 ref={headingRef} tabIndex={-1} className="selected-category-title">
          {category.name}
        </h1>

        <div className="category-exercise-list">
          {category.exercises.map((exercise) => (
            <button
              key={exercise}
              id={exerciseButtonId(category.id, exercise)}
              type="button"
              className="category-exercise-button"
              onClick={() => onChooseWorkout(exercise)}
            >
              <span>{exercise}</span>
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <VersionFooter />
    </main>
  );
}

function WorkoutDetail({
  workout,
  sets,
  onBack,
  onChangeSet,
  onAddSet,
  onRemoveSet,
}: {
  workout: SelectedWorkout;
  sets: SetDraft[];
  onBack: () => void;
  onChangeSet: (setId: number, field: 'weight' | 'reps', value: string) => void;
  onAddSet: () => number;
  onRemoveSet: (setId: number) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const addAndFocusSet = () => {
    const setId = onAddSet();
    window.requestAnimationFrame(() => {
      document.getElementById(setInputId(setId, 'weight'))?.focus();
    });
  };

  const removeAndFocusSet = (setId: number, index: number) => {
    const remainingSets = sets.filter((set) => set.id !== setId);
    const nextSet = remainingSets[Math.min(index, remainingSets.length - 1)];
    onRemoveSet(setId);

    window.requestAnimationFrame(() => {
      if (nextSet) {
        document.getElementById(setInputId(nextSet.id, 'weight'))?.focus();
      } else {
        document.getElementById('add-workout-set')?.focus();
      }
    });
  };

  return (
    <main className="workout-detail-screen">
      <div className="workout-detail-frame">
        <button className="workout-detail-back" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back
        </button>

        <section className="workout-detail-content">
          <div className="workout-detail-heading">
            <p className="eyebrow">{workout.category}</p>
            <h1 ref={headingRef} tabIndex={-1}>
              {workout.exercise}
            </h1>
          </div>

          <section className="workout-sets-card" aria-labelledby="sets-heading">
            <header>
              <h2 id="sets-heading">Sets</h2>
              <span>
                {sets.length} {sets.length === 1 ? 'set' : 'sets'}
              </span>
            </header>

            <div className="workout-set-list">
              {sets.map((set, index) => (
                <div className="workout-set-editor-row" key={set.id}>
                  <span className="workout-set-index">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <label
                    className="workout-set-field"
                    htmlFor={setInputId(set.id, 'weight')}
                  >
                    <span>Weight (lb)</span>
                    <Input
                      id={setInputId(set.id, 'weight')}
                      className="workout-set-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={set.weight}
                      placeholder="0"
                      aria-label={`Weight for set ${index + 1}`}
                      onChange={(event) =>
                        onChangeSet(set.id, 'weight', event.target.value)
                      }
                    />
                  </label>

                  <label
                    className="workout-set-field reps-field"
                    htmlFor={setInputId(set.id, 'reps')}
                  >
                    <span>Reps</span>
                    <Input
                      id={setInputId(set.id, 'reps')}
                      className="workout-set-input"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="100"
                      step="1"
                      value={set.reps}
                      placeholder="0"
                      aria-label={`Reps for set ${index + 1}`}
                      onChange={(event) =>
                        onChangeSet(set.id, 'reps', event.target.value)
                      }
                    />
                  </label>

                  {sets.length > 1 ? (
                    <button
                      type="button"
                      className="workout-set-remove"
                      onClick={() => removeAndFocusSet(set.id, index)}
                      aria-label={`Remove set ${index + 1}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : (
                    <span
                      className="workout-set-remove-spacer"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <button
            id="add-workout-set"
            className="add-set-button"
            type="button"
            onClick={addAndFocusSet}
          >
            <Plus aria-hidden="true" />
            Add set
          </button>
        </section>
      </div>
    </main>
  );
}

function VersionFooter() {
  return (
    <footer className="launch-footer">
      AI Gym Bro <span>v{APP_VERSION}</span>
    </footer>
  );
}

function categoryButtonId(categoryId: string) {
  return `category-${categoryId}`;
}

function exerciseButtonId(categoryId: string, exercise: string) {
  const exerciseId = exercise.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `exercise-${categoryId}-${exerciseId}`;
}

function workoutKey(categoryId: string, exercise: string) {
  return `${categoryId}:${exercise}`;
}

function setInputId(setId: number, field: 'weight' | 'reps') {
  return `set-${setId}-${field}`;
}
