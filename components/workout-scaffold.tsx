'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { APP_VERSION } from '@/lib/app-version';

type WorkoutCategory = {
  id: string;
  name: string;
  exercises: string[];
};

type SelectedWorkout = {
  category: string;
  exercise: string;
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
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] =
    useState<SelectedWorkout | null>(null);
  const lastExerciseButtonId = useRef<string | null>(null);

  useEffect(() => {
    if (selectedWorkout || !lastExerciseButtonId.current) return;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(lastExerciseButtonId.current ?? '')?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedWorkout]);

  if (selectedWorkout) {
    return (
      <WorkoutDetail
        key={selectedWorkout.exercise}
        workout={selectedWorkout}
        onBack={() => setSelectedWorkout(null)}
      />
    );
  }

  return (
    <main className="category-launch-screen">
      <section
        className="category-launch-content"
        aria-label="Choose a workout category"
      >
        {workoutCategories.map((category) => {
          const open = category.id === openCategoryId;

          return (
            <Collapsible
              key={category.id}
              className={`category-launch-item ${open ? 'open' : ''}`}
              open={open}
              onOpenChange={(nextOpen) =>
                setOpenCategoryId(nextOpen ? category.id : null)
              }
            >
              <CollapsibleTrigger className="category-launch-button">
                <span>{category.name}</span>
                <ChevronDown aria-hidden="true" />
              </CollapsibleTrigger>

              <CollapsibleContent className="category-exercise-panel">
                <div className="category-exercise-list">
                  {category.exercises.map((exercise) => (
                    <button
                      key={exercise}
                      id={exerciseButtonId(category.id, exercise)}
                      type="button"
                      className="category-exercise-button"
                      onClick={() => {
                        lastExerciseButtonId.current = exerciseButtonId(
                          category.id,
                          exercise,
                        );
                        setSelectedWorkout({
                          category: category.name,
                          exercise,
                        });
                      }}
                    >
                      <span>{exercise}</span>
                      <ChevronRight aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </section>

      <footer className="launch-footer">
        AI Gym Bro <span>v{APP_VERSION}</span>
      </footer>
    </main>
  );
}

function WorkoutDetail({
  workout,
  onBack,
}: {
  workout: SelectedWorkout;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
              <span>3 total</span>
            </header>

            <div className="workout-set-list">
              {[1, 2, 3].map((setNumber) => (
                <div className="workout-set-row" key={setNumber}>
                  <span>{String(setNumber).padStart(2, '0')}</span>
                  <strong>Set {setNumber}</strong>
                  <small>—</small>
                </div>
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function exerciseButtonId(categoryId: string, exercise: string) {
  const exerciseId = exercise.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `exercise-${categoryId}-${exerciseId}`;
}
