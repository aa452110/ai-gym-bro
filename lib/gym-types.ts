export type SetType =
  | 'warm_up'
  | 'working'
  | 'top_set'
  | 'backoff'
  | 'drop_set'
  | 'amrap'
  | 'failure'
  | 'other';

export type WorkoutStatus = 'planned' | 'active' | 'completed';
export type ExerciseStatus = 'pending' | 'active' | 'complete' | 'skipped';
export type AutonomyLevel = 'track' | 'assist' | 'coach' | 'full_coach';
export type WarmupPreference = 'dont_track' | 'track_if_wanted' | 'always_track';
export type RpePreference = 'minimal' | 'balanced' | 'detailed';
export type OperationSource = 'manual' | 'ai' | 'webmcp';

export interface ExerciseMedia {
  kind: 'image';
  src: string;
  alt: string;
  sourceType: 'generated' | 'licensed' | 'user';
  sourceLabel?: string;
  attribution?: string;
}

export interface ExerciseKnowledge {
  id: string;
  name: string;
  shortName: string;
  aliases?: string[];
  description?: string;
  instructions?: string[];
  category: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';
  movementPattern: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  strengthSuitability: number;
  hypertrophySuitability: number;
  isMainLift: boolean;
  similarExerciseIds: string[];
  stabilityRequirement?: 'low' | 'moderate' | 'high';
  fatigueCost?: 'low' | 'moderate' | 'high';
  media?: ExerciseMedia;
}

export interface PlannedSet {
  id: string;
  type: SetType;
  targetReps?: number;
  repRange?: [number, number];
  suggestedWeight?: number;
  targetRpe?: number;
  optional?: boolean;
  note?: string;
}

export interface PerformedSet {
  id: string;
  type: SetType;
  weight: number;
  reps: number;
  rpe?: number;
  rir?: number;
  note?: string;
  qualitativeContext?: string;
  source: OperationSource;
  createdAt: string;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  originalExerciseId?: string;
  substitutionReason?: string;
  plannedSets: PlannedSet[];
  performedSets: PerformedSet[];
  status: ExerciseStatus;
  userSelectedWeight?: number;
  sessionTargetSets?: number;
  adaptationNote?: string;
  notes: string[];
}

export interface Workout {
  id: string;
  date: string;
  title: string;
  focus: string;
  estimatedMinutes: number;
  status: WorkoutStatus;
  programDayId: string;
  currentExerciseIndex: number;
  exercises: WorkoutExercise[];
  startedAt?: string;
  completedAt?: string;
  timeCapMinutes?: number;
  notes: string[];
}

export interface ProgramDayExercise {
  id: string;
  exerciseId: string;
  label: string;
  detail: string;
  optional?: boolean;
}

export interface ProgramDay {
  id: string;
  name: string;
  focus: string;
  estimatedMinutes: number;
  exercises: ProgramDayExercise[];
}

export interface Program {
  id: string;
  name: string;
  description: string;
  active: boolean;
  week: number;
  days: ProgramDay[];
}

export interface UserPreferences {
  autonomy: AutonomyLevel;
  warmups: WarmupPreference;
  rpe: RpePreference;
  units: 'lb' | 'kg';
  restTimer: boolean;
  haptics: boolean;
  confirmedExerciseDislikes: string[];
  unavailableEquipment: string[];
  trainingStyle: string[];
  observedBehaviors: string[];
}

export interface Recommendation {
  id: string;
  workoutId: string;
  exerciseId: string;
  kind: 'weight' | 'backoff' | 'substitution' | 'time_adaptation';
  fact: string;
  recommendation: string;
  rationale: string;
  suggestedWeight?: number;
  suggestedReps?: number;
  status: 'active' | 'accepted' | 'overridden' | 'dismissed';
  userDecision?: string;
  createdAt: string;
}

export interface Interpretation {
  id: string;
  rawInput: string;
  confidence: number;
  summary: string;
  status: 'pending' | 'confirmed' | 'corrected' | 'rejected';
  createdAt: string;
}

export interface TrainingMemory {
  id: string;
  exerciseId: string;
  kind: 'cue' | 'observation' | 'preference';
  text: string;
  confirmed: boolean;
  source: OperationSource;
  createdAt: string;
}

export interface GymState {
  version: number;
  today: Workout;
  history: Workout[];
  program: Program;
  preferences: UserPreferences;
  recommendations: Recommendation[];
  interpretations: Interpretation[];
  trainingMemories: TrainingMemory[];
}

export type WorkoutOperation =
  | { type: 'START_WORKOUT'; source: OperationSource }
  | { type: 'SELECT_EXERCISE'; workoutExerciseId: string; source: OperationSource }
  | {
      type: 'LOG_SET';
      workoutExerciseId: string;
      set: Omit<PerformedSet, 'id' | 'createdAt'>;
      source: OperationSource;
    }
  | {
      type: 'UPDATE_SET';
      workoutExerciseId: string;
      setId: string;
      changes: Partial<Pick<PerformedSet, 'weight' | 'reps' | 'rpe' | 'rir' | 'type' | 'note' | 'qualitativeContext'>>;
      source: OperationSource;
    }
  | { type: 'REMOVE_SET'; workoutExerciseId: string; setId: string; source: OperationSource }
  | {
      type: 'ADD_PLANNED_SET';
      workoutExerciseId: string;
      set: Omit<PlannedSet, 'id'>;
      source: OperationSource;
    }
  | {
      type: 'CHANGE_EXERCISE';
      workoutExerciseId: string;
      replacementExerciseId: string;
      reason: string;
      source: OperationSource;
    }
  | { type: 'SKIP_EXERCISE'; workoutExerciseId: string; source: OperationSource }
  | { type: 'ADD_NOTE'; workoutExerciseId: string; note: string; source: OperationSource }
  | {
      type: 'SAVE_EXERCISE_MEMORY';
      workoutExerciseId: string;
      kind: TrainingMemory['kind'];
      text: string;
      confirmed: boolean;
      source: OperationSource;
    }
  | { type: 'SET_USER_WEIGHT'; workoutExerciseId: string; weight: number; source: OperationSource }
  | { type: 'ADAPT_FOR_TIME'; minutes: number; source: OperationSource }
  | { type: 'COMPLETE_WORKOUT'; source: OperationSource }
  | { type: 'RESET_DEMO'; source: OperationSource };

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

export interface AiAction {
  label: string;
  kind: 'operation' | 'substitution' | 'edit_last';
  operation?: WorkoutOperation;
  replacementExerciseId?: string;
}

export interface AiResponse {
  text: string;
  category: 'log' | 'history' | 'recommendation' | 'substitution' | 'safety' | 'general';
  interpretation?: Interpretation;
  operation?: WorkoutOperation;
  autoApply?: boolean;
  actions?: AiAction[];
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: AiAction[];
}
