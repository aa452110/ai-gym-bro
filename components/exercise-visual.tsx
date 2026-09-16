import { Dumbbell } from 'lucide-react';

import type { ExerciseKnowledge } from '@/lib/gym-types';

export function ExerciseVisual({ exercise, variant = 'card' }: {
  exercise: ExerciseKnowledge;
  variant?: 'compact' | 'card' | 'hero';
}) {
  if (exercise.media) {
    return (
      <figure className={`exercise-visual ${variant}`}>
        {/* Project-bound generated exercise artwork is intentionally rendered with a plain img. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={exercise.media.src} alt={exercise.media.alt} loading={variant === 'hero' ? 'eager' : 'lazy'} />
      </figure>
    );
  }

  return (
    <div className={`exercise-visual exercise-visual-fallback ${variant}`} aria-label={`${exercise.name} visual unavailable`}>
      <Dumbbell aria-hidden="true" />
      {variant !== 'compact' && <span>{exercise.movementPattern}</span>}
    </div>
  );
}
