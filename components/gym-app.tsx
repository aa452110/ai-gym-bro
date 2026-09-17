'use client';

import { useState } from 'react';

import { LandingScreen } from '@/components/landing-screen';
import { WorkoutScaffold } from '@/components/workout-scaffold';

export function GymApp() {
  const [hasStarted, setHasStarted] = useState(false);

  return hasStarted ? (
    <WorkoutScaffold />
  ) : (
    <LandingScreen onStart={() => setHasStarted(true)} />
  );
}
