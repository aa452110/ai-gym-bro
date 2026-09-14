'use client';

/* oxlint-disable react/react-compiler -- Controlled resets synchronize modal and exercise-local form state with a newly selected record. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  Clock3,
  Dumbbell,
  Flame,
  History,
  Home,
  Info,
  LibraryBig,
  Minus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  Sparkles,
  Trash2,
  UserRound,
  Weight,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Toaster, toast } from '@/components/ui/toast';
import { coachPrompts, respondToCoach, substitutionsFor } from '@/lib/ai-coach';
import { exerciseDatabase, getExercise, warmupSequence } from '@/lib/gym-data';
import type {
  AiAction,
  AiMessage,
  AutonomyLevel,
  GymState,
  PerformedSet,
  ProgramDay,
  Recommendation,
  RpePreference,
  SetType,
  ValidationResult,
  WarmupPreference,
  WorkoutExercise,
  WorkoutOperation,
} from '@/lib/gym-types';
import { useGymStore } from '@/lib/use-gym-store';
import { useGymWebMcp } from '@/lib/use-gym-webmcp';
import {
  formatPerformedSet,
  getLatestRecommendation,
  getWarmups,
  getWorkingSets,
  setTypeLabels,
} from '@/lib/workout-engine';

type AppTab = 'today' | 'history' | 'programs' | 'profile';
type CoachScreen = 'today' | 'active' | 'history' | 'programs';

const navItems: Array<{ id: AppTab; label: string; icon: typeof Home }> = [
  { id: 'today', label: 'Today', icon: Home },
  { id: 'history', label: 'History', icon: History },
  { id: 'programs', label: 'Programs', icon: CalendarDays },
  { id: 'profile', label: 'Profile', icon: UserRound },
];

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

function dateFromKey(date: string) {
  return new Date(`${date}T12:00:00`);
}

function planLabel(exercise: WorkoutExercise) {
  const top = exercise.plannedSets.find((set) => set.type === 'top_set');
  const backoffs = exercise.plannedSets.filter((set) => set.type === 'backoff');
  if (top) return `Top set × ${top.targetReps}${backoffs.length ? ` · ${backoffs.length} backoffs × ${backoffs[0].targetReps}` : ''}`;
  const first = exercise.plannedSets[0];
  if (!first) return 'Open plan';
  const reps = first.repRange ? `${first.repRange[0]}–${first.repRange[1]}` : first.targetReps;
  return `${exercise.sessionTargetSets ?? exercise.plannedSets.length} × ${reps}`;
}

function successToast(title: string, description: string | undefined, undo?: () => void) {
  toast.add({
    title,
    description,
    type: 'success',
    timeout: undo ? 6500 : 3500,
    actionProps: undo ? { children: 'Undo', onClick: undo } : undefined,
  });
}

export function GymApp() {
  const store = useGymStore();
  const { dispatchOperation, stateRef, undo } = store;
  const [tab, setTab] = useState<AppTab>('today');
  const [showActive, setShowActive] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachScreen, setCoachScreen] = useState<CoachScreen>('today');
  const [coachExerciseId, setCoachExerciseId] = useState<string>();
  const [swapExerciseId, setSwapExerciseId] = useState<string>();
  const [whyRecommendation, setWhyRecommendation] = useState<Recommendation>();
  const [editTarget, setEditTarget] = useState<{ exerciseId: string; set: PerformedSet }>();
  const [noteExerciseId, setNoteExerciseId] = useState<string>();
  const [finishOpen, setFinishOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const showActiveWorkout = useCallback(() => setShowActive(true), []);
  useGymWebMcp(stateRef, dispatchOperation, showActiveWorkout);

  const runOperation = useCallback((operation: WorkoutOperation, message?: string, description?: string) => {
    const result = dispatchOperation(operation);
    if (!result.ok) {
      toast.add({ title: 'Couldn’t save that', description: result.error, type: 'error', priority: 'high' });
      return result;
    }
    if (message) successToast(message, description, undo);
    return result;
  }, [dispatchOperation, undo]);

  const startWorkout = useCallback(() => {
    const result = runOperation({ type: 'START_WORKOUT', source: 'manual' });
    if (result.ok) setShowActive(true);
  }, [runOperation]);

  const openCoach = useCallback((screen: CoachScreen, exerciseId?: string) => {
    setCoachScreen(screen);
    setCoachExerciseId(exerciseId);
    setCoachOpen(true);
  }, []);

  const openLastSet = useCallback(() => {
    const current = store.state.today.exercises.find((exercise) => exercise.id === coachExerciseId)
      ?? store.state.today.exercises[store.state.today.currentExerciseIndex];
    const last = current?.performedSets.at(-1);
    if (current && last) setEditTarget({ exerciseId: current.id, set: last });
    else toast.add({ title: 'No set to edit yet', type: 'info' });
  }, [coachExerciseId, store.state.today]);

  return (
    <Toaster>
      {showActive && store.state.today.status !== 'completed' ? (
        <ActiveWorkoutScreen
          state={store.state}
          runOperation={runOperation}
          onBack={() => setShowActive(false)}
          onCoach={() => openCoach('active', store.state.today.exercises[store.state.today.currentExerciseIndex]?.id)}
          onSwap={(id) => setSwapExerciseId(id)}
          onWhy={(recommendation) => setWhyRecommendation(recommendation)}
          onEdit={(exerciseId, set) => setEditTarget({ exerciseId, set })}
          onNote={(id) => setNoteExerciseId(id)}
          onFinish={() => setFinishOpen(true)}
        />
      ) : (
        <AppShell tab={tab} onTabChange={setTab}>
          {tab === 'today' && (
            <TodayScreen
              state={store.state}
              onStart={startWorkout}
              onResume={() => setShowActive(true)}
              onCoach={() => openCoach('today')}
              onWhy={(recommendation) => setWhyRecommendation(recommendation)}
              onOverview={() => setTab('history')}
              onPrograms={() => setTab('programs')}
            />
          )}
          {tab === 'history' && <HistoryScreen state={store.state} onCoach={() => openCoach('history')} />}
          {tab === 'programs' && (
            <ProgramsScreen
              state={store.state}
              updateDay={store.updateProgramDay}
              addExercise={store.addProgramExercise}
              removeExercise={store.removeProgramExercise}
              addDay={store.addProgramDay}
              onLibrary={() => setLibraryOpen(true)}
              onCoach={() => openCoach('programs')}
            />
          )}
          {tab === 'profile' && (
            <ProfileScreen
              state={store.state}
              updatePreferences={store.updatePreferences}
              onReset={() => {
                runOperation({ type: 'RESET_DEMO', source: 'manual' }, 'Demo data restored');
                setTab('today');
              }}
            />
          )}
        </AppShell>
      )}

      <CoachSheet
        open={coachOpen}
        onOpenChange={setCoachOpen}
        screen={coachScreen}
        workoutExerciseId={coachExerciseId}
        state={store.state}
        stateRef={store.stateRef}
        runOperation={runOperation}
        saveInterpretation={store.saveInterpretation}
        onEditLast={openLastSet}
      />

      <SwapDialog
        state={store.state}
        workoutExerciseId={swapExerciseId}
        onClose={() => setSwapExerciseId(undefined)}
        runOperation={runOperation}
      />
      <WhyDialog recommendation={whyRecommendation} onClose={() => setWhyRecommendation(undefined)} />
      <EditSetDialog
        target={editTarget}
        units={store.state.preferences.units}
        onClose={() => setEditTarget(undefined)}
        runOperation={runOperation}
      />
      <NoteDialog
        workoutExerciseId={noteExerciseId}
        onClose={() => setNoteExerciseId(undefined)}
        runOperation={runOperation}
      />
      <FinishDialog
        open={finishOpen}
        state={store.state}
        onClose={() => setFinishOpen(false)}
        onFinish={() => {
          const result = runOperation({ type: 'COMPLETE_WORKOUT', source: 'manual' }, 'Workout saved', 'Every performed set is now in your history.');
          if (result.ok) {
            setFinishOpen(false);
            setShowActive(false);
            setTab('history');
          }
        }}
      />
      <ExerciseLibrary open={libraryOpen} onOpenChange={setLibraryOpen} />
    </Toaster>
  );
}

function AppShell({ tab, onTabChange, children }: { tab: AppTab; onTabChange: (tab: AppTab) => void; children: React.ReactNode }) {
  return (
    <main className="gym-shell">
      <aside className="desktop-rail" aria-label="Primary navigation">
        <div className="brand-mark"><Dumbbell aria-hidden="true" /></div>
        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={`rail-link ${tab === item.id ? 'active' : ''}`} onClick={() => onTabChange(item.id)}>
                <Icon /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="rail-link rail-settings" onClick={() => onTabChange('profile')}><Settings2 /><span>Settings</span></button>
      </aside>

      <section className="app-frame">
        <header className="topbar">
          <button className="wordmark" onClick={() => onTabChange('today')}><span>AI</span> GYM BRO</button>
          <span className="streak-pill" aria-label="Six-week workout streak"><Flame aria-hidden="true" /> 6-week streak</span>
        </header>
        {children}
        <nav className="bottom-nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => onTabChange(item.id)}>
                <Icon /><span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </section>
    </main>
  );
}

function ScreenTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="screen-title">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      {action}
    </div>
  );
}

function TodayScreen({ state, onStart, onResume, onCoach, onWhy, onOverview, onPrograms }: {
  state: GymState;
  onStart: () => void;
  onResume: () => void;
  onCoach: () => void;
  onWhy: (recommendation: Recommendation) => void;
  onOverview: () => void;
  onPrograms: () => void;
}) {
  const recommendation = state.recommendations.find((item) => item.id === 'rec-bench-250') ?? state.recommendations[0];
  const completed = state.today.status === 'completed';
  const active = state.today.status === 'active';
  const completedSets = state.today.exercises.reduce((total, exercise) => total + getWorkingSets(exercise).length, 0);

  return (
    <div className="screen-scroll">
      <ScreenTitle
        eyebrow={longDate.format(dateFromKey(state.today.date))}
        title={completed ? 'Good work.' : active ? 'Keep it moving.' : 'Time to press.'}
        action={<button className="icon-button" aria-label="Training overview" onClick={onOverview}><BarChart3 /></button>}
      />

      {completed ? (
        <article className="completion-card">
          <div className="completion-check"><Check /></div>
          <p className="session-label"><span /> Session complete</p>
          <h2>{state.today.title} <em>—</em> {state.today.focus}</h2>
          <p>{completedSets} working sets saved. Your next recommendation will use what you did—not just what was planned.</p>
          <Button className="primary-wide" onClick={onPrograms}>View program <ArrowRight /></Button>
        </article>
      ) : (
        <article className="workout-card">
          <div className="workout-card-top">
            <div>
              <div className="session-label"><span /> {active ? 'In progress' : 'Today’s session'}</div>
              <h2>{state.today.title} <em>—</em> {state.today.focus}</h2>
              <p>{state.today.exercises.length} exercises <span>·</span> {state.today.timeCapMinutes ? `${state.today.timeCapMinutes}-min cap` : `about ${state.today.estimatedMinutes} min`}</p>
            </div>
            <button className="program-chip" onClick={onPrograms}>W{state.program.week} / D1</button>
          </div>

          {recommendation && (
            <div className="coach-note">
              <div className="coach-avatar"><Bot /></div>
              <p><strong>Bench is moving.</strong> {recommendation.fact} I’d target 250 × 3 today.</p>
              <button onClick={() => onWhy(recommendation)}>Why?</button>
            </div>
          )}

          <div className="exercise-list">
            {state.today.exercises.map((workoutExercise, index) => {
              const exercise = getExercise(workoutExercise.exerciseId);
              const firstPlan = workoutExercise.plannedSets[0];
              return (
                <div className={`exercise-row ${index === 0 ? 'featured' : ''} ${workoutExercise.status === 'skipped' ? 'muted-row' : ''}`} key={workoutExercise.id}>
                  <span className="exercise-index">{workoutExercise.status === 'complete' ? <Check /> : String(index + 1).padStart(2, '0')}</span>
                  <div className="exercise-copy">
                    <h3>{exercise.shortName}</h3>
                    <p>{workoutExercise.adaptationNote ?? planLabel(workoutExercise)}</p>
                  </div>
                  <div className="exercise-load">
                    {index === 0 && <small>{workoutExercise.userSelectedWeight ? 'Your call' : 'Suggested'}</small>}
                    <strong>{workoutExercise.userSelectedWeight ?? firstPlan?.suggestedWeight ?? '—'} {index === 0 ? '× 3' : 'lb'}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          <Button className="start-button" size="lg" onClick={active ? onResume : onStart}>
            <Play fill="currentColor" /> {active ? 'Resume workout' : 'Start workout'} <ArrowRight />
          </Button>
        </article>
      )}

      <button className="ask-card" onClick={onCoach}>
        <div className="spark-icon"><Sparkles /></div>
        <div><strong>{completed ? 'Ask about your training' : 'Need to adjust today?'}</strong><span>{completed ? 'Your answers come from recorded sets.' : 'Ask for a swap, a shorter session, or a weight check.'}</span></div>
        <ArrowRight />
      </button>
    </div>
  );
}

function useElapsedTime(startedAt?: string) {
  const [now, setNow] = useState(() => startedAt ? new Date(startedAt).getTime() : 0);
  useEffect(() => {
    if (!startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return '00:00';
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function ActiveWorkoutScreen({ state, runOperation, onBack, onCoach, onSwap, onWhy, onEdit, onNote, onFinish }: {
  state: GymState;
  runOperation: (operation: WorkoutOperation, message?: string, description?: string) => ValidationResult;
  onBack: () => void;
  onCoach: () => void;
  onSwap: (workoutExerciseId: string) => void;
  onWhy: (recommendation: Recommendation) => void;
  onEdit: (exerciseId: string, set: PerformedSet) => void;
  onNote: (exerciseId: string) => void;
  onFinish: () => void;
}) {
  const workout = state.today;
  const current = workout.exercises[workout.currentExerciseIndex];
  const exercise = getExercise(current.exerciseId);
  const history = state.history
    .map((entry) => ({ workout: entry, exercise: entry.exercises.find((item) => item.exerciseId === current.exerciseId) }))
    .find((entry) => entry.exercise);
  const priorWorking = history?.exercise?.performedSets.filter((set) => set.type !== 'warm_up') ?? [];
  const warmups = getWarmups(current);
  const working = getWorkingSets(current);
  const recommendation = getLatestRecommendation(state, current);
  const elapsed = useElapsedTime(workout.startedAt);
  const [mode, setMode] = useState<'warmup' | 'working'>(() => exercise.isMainLift && !working.length ? 'warmup' : 'working');
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(5);
  const [rpe, setRpe] = useState<number | undefined>();
  const [rpeOpen, setRpeOpen] = useState(false);
  const [warmupsOpen, setWarmupsOpen] = useState(false);

  const preset = useMemo(() => {
    if (mode === 'warmup') return warmupSequence[Math.min(warmups.length, warmupSequence.length - 1)];
    const plan = current.plannedSets[Math.min(working.length, current.plannedSets.length - 1)];
    return {
      weight: current.userSelectedWeight
        ?? recommendation?.suggestedWeight
        ?? plan?.suggestedWeight
        ?? (exercise.id === 'incline-dumbbell-press' ? 75 : exercise.id === 'cable-fly' ? 40 : 55),
      reps: recommendation?.suggestedReps ?? plan?.targetReps ?? plan?.repRange?.[0] ?? 10,
    };
  }, [current, exercise.id, mode, recommendation, warmups.length, working.length]);

  useEffect(() => {
    setWeight(preset.weight);
    setReps(preset.reps);
    setRpe(undefined);
    setRpeOpen(false);
  }, [current.id, mode, preset.reps, preset.weight]);

  useEffect(() => {
    setMode(getExercise(current.exerciseId).isMainLift && !getWorkingSets(current).length ? 'warmup' : 'working');
  }, [current]);

  const setType: SetType = mode === 'warmup'
    ? 'warm_up'
    : !exercise.isMainLift
      ? 'working'
      : working.some((set) => set.type === 'top_set')
        ? 'backoff'
        : 'top_set';

  const logSet = () => {
    const result = runOperation({
      type: 'LOG_SET',
      workoutExerciseId: current.id,
      source: 'manual',
      set: { type: setType, weight, reps, rpe, source: 'manual' },
    }, `${weight} × ${reps} logged`, `${setTypeLabels[setType]} · ${exercise.shortName}`);
    if (result.ok && mode === 'warmup' && warmups.length + 1 >= warmupSequence.length) setMode('working');
  };

  const totalDone = workout.exercises.filter((item) => item.status === 'complete' || item.status === 'skipped').length;

  return (
    <main className="active-shell">
      <header className="active-topbar">
        <button className="round-button" aria-label="Back to Today" onClick={onBack}><ArrowLeft /></button>
        <div className="active-title"><span>{workout.title} · {totalDone + 1}/{workout.exercises.length}</span><strong><Clock3 /> {elapsed}</strong></div>
        <Button variant="outline" className="finish-top" onClick={onFinish}>Finish</Button>
      </header>
      <div className="workout-progress"><span style={{ width: `${Math.max(8, ((workout.currentExerciseIndex + 1) / workout.exercises.length) * 100)}%` }} /></div>

      <div className="exercise-tabs" aria-label="Workout exercises">
        {workout.exercises.map((item, index) => {
          const itemExercise = getExercise(item.exerciseId);
          return (
            <button
              key={item.id}
              className={`${index === workout.currentExerciseIndex ? 'active' : ''} ${item.status === 'complete' ? 'done' : ''}`}
              onClick={() => runOperation({ type: 'SELECT_EXERCISE', workoutExerciseId: item.id, source: 'manual' })}
            >
              <span>{item.status === 'complete' ? <Check /> : index + 1}</span>{itemExercise.shortName}
            </button>
          );
        })}
      </div>

      <section className="active-content">
        <div className="lift-heading">
          <div><p className="eyebrow">Now lifting</p><h1>{exercise.shortName}</h1></div>
          <button className="more-button" aria-label="More exercise actions"><CircleEllipsis /></button>
        </div>

        {current.originalExerciseId && (
          <div className="substitution-banner"><RotateCcw /><span>Replaced {getExercise(current.originalExerciseId).shortName}</span><strong>{current.substitutionReason}</strong></div>
        )}

        <div className="lift-context-grid">
          <div><span>Last session</span><strong>{priorWorking[0] ? `${priorWorking[0].weight} × ${priorWorking[0].reps}` : 'No history'}</strong><small>{priorWorking[0]?.rpe ? `RPE ${priorWorking[0].rpe}` : history ? shortDate.format(dateFromKey(history.workout.date)) : '—'}</small></div>
          <div><span>Today’s target</span><strong>{planLabel(current).split(' · ')[0]}</strong><small>{current.adaptationNote ?? 'From your program'}</small></div>
          <div className="suggested-stat"><span>{current.userSelectedWeight ? 'Your decision' : 'Suggested'}</span><strong>{current.userSelectedWeight ?? recommendation?.suggestedWeight ?? current.plannedSets[0]?.suggestedWeight ?? '—'} × {recommendation?.suggestedReps ?? current.plannedSets[0]?.targetReps ?? current.plannedSets[0]?.repRange?.[0] ?? '—'}</strong><small>{current.userSelectedWeight ? 'AI won’t override this' : 'Based on history'}</small></div>
        </div>

        {recommendation && (
          <div className="active-recommendation">
            <div className="ai-dot"><Sparkles /></div>
            <div><p>{recommendation.recommendation}</p><span>{recommendation.fact}</span></div>
            <button onClick={() => onWhy(recommendation)}>Why?</button>
          </div>
        )}

        <Collapsible open={warmupsOpen} onOpenChange={setWarmupsOpen} className="sets-block warmup-block">
          <CollapsibleTrigger className="sets-block-heading">
            <div><span>Warm-ups</span><small>{warmups.length ? `${warmups.length} set${warmups.length === 1 ? '' : 's'}` : state.preferences.warmups === 'dont_track' ? 'Not tracking' : 'Optional'}</small></div>
            <ChevronDown className={warmupsOpen ? 'rotated' : ''} />
          </CollapsibleTrigger>
          <CollapsibleContent className="sets-panel">
            {warmups.length === 0 ? (
              <div className="empty-inline">No warm-ups logged. They stay out of the main journal unless you add them.</div>
            ) : warmups.map((set, index) => (
              <SetRow key={set.id} set={set} index={index} units={state.preferences.units} onEdit={() => onEdit(current.id, set)} />
            ))}
          </CollapsibleContent>
        </Collapsible>

        <div className="sets-block working-block">
          <div className="sets-block-heading static-heading"><div><span>Working sets</span><small>{working.length}/{current.sessionTargetSets ?? current.plannedSets.length} done</small></div></div>
          <div className="sets-panel">
            {working.length === 0 ? (
              <div className="empty-working"><Weight /><div><strong>Your first working set lands here.</strong><span>Plan and performance stay separate.</span></div></div>
            ) : working.map((set, index) => (
              <SetRow key={set.id} set={set} index={index} units={state.preferences.units} onEdit={() => onEdit(current.id, set)} />
            ))}
          </div>
        </div>

        {current.notes.length > 0 && <div className="exercise-note"><Info />{current.notes.at(-1)}</div>}

        <div className="quick-actions" aria-label="Exercise actions">
          <button onClick={() => onSwap(current.id)}><RotateCcw /><span>Change</span></button>
          <button onClick={() => setMode('working')}><Plus /><span>Add set</span></button>
          <button onClick={() => onNote(current.id)}><Pencil /><span>Notes</span></button>
          <button onClick={() => runOperation({ type: 'SKIP_EXERCISE', workoutExerciseId: current.id, source: 'manual' }, 'Exercise skipped')}><SkipForward /><span>Skip</span></button>
          <button className="ask-action" onClick={onCoach}><Sparkles /><span>Ask AI</span></button>
        </div>

        <section className="log-dock" aria-label="Quick set logger">
          {exercise.isMainLift && (
            <div className="log-mode-tabs">
              <button className={mode === 'warmup' ? 'active' : ''} onClick={() => setMode('warmup')}>Warm-up</button>
              <button className={mode === 'working' ? 'active' : ''} onClick={() => setMode('working')}>Working set</button>
            </div>
          )}
          <div className="log-fields">
            <NumberControl label="Weight" value={weight} suffix={state.preferences.units} step={state.preferences.units === 'lb' ? 5 : 2.5} min={0} onChange={setWeight} />
            <div className="times-mark">×</div>
            <NumberControl label="Reps" value={reps} suffix="reps" step={1} min={1} onChange={setReps} />
          </div>
          {(exercise.isMainLift || state.preferences.rpe === 'detailed') && mode === 'working' && (
            <div className="effort-row">
              {!rpeOpen ? (
                <button className="add-rpe" onClick={() => setRpeOpen(true)}><Plus /> Add RPE <span>optional</span></button>
              ) : (
                <div className="rpe-options">
                  <span>RPE</span>
                  {[6, 7, 8, 8.5, 9, 10].map((value) => <button key={value} className={rpe === value ? 'active' : ''} onClick={() => setRpe(value)}>{value}</button>)}
                  <button aria-label="Remove RPE" onClick={() => { setRpe(undefined); setRpeOpen(false); }}><X /></button>
                </div>
              )}
            </div>
          )}
          <Button className="log-button" size="lg" onClick={logSet}><Plus /> Log {setTypeLabels[setType]}<span>{weight} × {reps}{rpe ? ` @ ${rpe}` : ''}</span></Button>
        </section>

        <button className="finish-workout-link" onClick={onFinish}>Finish workout <ArrowRight /></button>
      </section>
    </main>
  );
}

function NumberControl({ label, value, suffix, step, min, onChange }: { label: string; value: number; suffix: string; step: number; min: number; onChange: (value: number) => void }) {
  return (
    <div className="number-control">
      <label>{label}</label>
      <div>
        <button aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, value - step))}><Minus /></button>
        <input aria-label={label} type="number" value={value} step={step} min={min} onChange={(event) => onChange(Number(event.target.value))} />
        <small>{suffix}</small>
        <button aria-label={`Increase ${label}`} onClick={() => onChange(value + step)}><Plus /></button>
      </div>
    </div>
  );
}

function SetRow({ set, index, units, onEdit }: { set: PerformedSet; index: number; units: string; onEdit: () => void }) {
  return (
    <button className="set-row" onClick={onEdit} aria-label={`Edit ${setTypeLabels[set.type]} ${formatPerformedSet(set, units)}`}>
      <span className={`set-number ${set.type === 'top_set' ? 'top' : ''}`}>{set.type === 'top_set' ? 'T' : index + 1}</span>
      <span className="set-kind">{setTypeLabels[set.type]}</span>
      <strong>{set.weight}<small>{units}</small> × {set.reps}</strong>
      <span className="set-effort">{set.rpe ? `@ ${set.rpe}` : set.rir !== undefined ? `${set.rir} RIR` : '—'}</span>
      <Pencil />
    </button>
  );
}

function CoachSheet({ open, onOpenChange, screen, workoutExerciseId, state, stateRef, runOperation, saveInterpretation, onEditLast }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  screen: CoachScreen;
  workoutExerciseId?: string;
  state: GymState;
  stateRef: { current: GymState };
  runOperation: (operation: WorkoutOperation, message?: string, description?: string) => ValidationResult;
  saveInterpretation: (interpretation: NonNullable<ReturnType<typeof respondToCoach>['interpretation']>) => void;
  onEditLast: () => void;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const messageEnd = useRef<HTMLDivElement>(null);
  const contextExercise = state.today.exercises.find((exercise) => exercise.id === workoutExerciseId)
    ?? state.today.exercises[state.today.currentExerciseIndex];
  const contextName = getExercise(contextExercise?.exerciseId ?? 'bench-press').shortName;

  useEffect(() => {
    if (!open) return;
    const intro = screen === 'history'
      ? 'Ask about any recorded lift. If the data isn’t there, I’ll say so.'
      : screen === 'programs'
        ? 'I can help make a small program change without taking over.'
        : screen === 'active'
          ? `I’m looking at ${contextName} and the sets you’ve logged.`
          : 'I know today’s plan and your recent training history.';
    setMessages([{ id: `intro-${screen}-${contextName}`, role: 'assistant', text: intro }]);
  }, [contextName, open, screen]);

  useEffect(() => messageEnd.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const handleAction = (action: AiAction) => {
    if (action.kind === 'edit_last') {
      onEditLast();
      return;
    }
    if (!action.operation) return;
    const result = runOperation(
      action.operation,
      action.kind === 'substitution' ? 'Exercise changed' : 'Workout updated',
      action.kind === 'substitution' && action.replacementExerciseId
        ? `Now using ${getExercise(action.replacementExerciseId).shortName}.`
        : undefined,
    );
    if (result.ok) {
      setMessages((current) => [...current, {
        id: `applied-${Date.now()}`,
        role: 'assistant',
        text: action.kind === 'substitution'
          ? `Done. ${getExercise(action.replacementExerciseId ?? 'bench-press').shortName} is in today’s workout; the original plan is still recorded.`
          : 'Applied to today only. Your base program stays intact.',
      }]);
    }
  };

  const send = (value = input) => {
    const clean = value.trim();
    if (!clean) return;
    const response = respondToCoach(stateRef.current, clean, { screen, workoutExerciseId });
    setMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: clean },
      { id: `assistant-${Date.now() + 1}`, role: 'assistant', text: response.text, actions: response.actions },
    ]);
    if (response.interpretation) saveInterpretation(response.interpretation);
    if (response.operation && response.autoApply) {
      const result = runOperation(response.operation);
      if (result.ok && response.category === 'log') {
        successToast('AI action saved', response.interpretation?.summary, undefined);
      }
    }
    setInput('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="coach-sheet">
        <SheetHeader className="coach-sheet-header">
          <div className="coach-title-row">
            <div className="coach-logo"><Sparkles /></div>
            <div><SheetTitle>Ask Gym Bro</SheetTitle><SheetDescription>{screen === 'active' ? contextName : `${screen[0].toUpperCase()}${screen.slice(1)} context`}</SheetDescription></div>
          </div>
        </SheetHeader>

        <div className="coach-context-chip"><Info /> Looking at {screen === 'active' ? `${contextName} + today’s sets` : screen === 'history' ? 'your structured workout history' : screen === 'programs' ? 'Strength Builder' : 'today’s Push session'}</div>

        <div className="coach-messages" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`chat-message ${message.role}`}>
              {message.role === 'assistant' && <div className="mini-bot"><Bot /></div>}
              <div className="message-bubble">
                <p>{message.text}</p>
                {message.actions && message.actions.length > 0 && (
                  <div className="message-actions">
                    {message.actions.map((action, index) => <button key={`${action.label}-${index}`} onClick={() => handleAction(action)}>{action.label}<ChevronRight /></button>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messageEnd} />
        </div>

        <div className="coach-prompts">
          {coachPrompts[screen].map((prompt) => <button key={prompt} onClick={() => send(prompt)}>{prompt}</button>)}
        </div>

        <form className="coach-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
          <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder={screen === 'active' ? 'Try “225 for 5”…' : 'Ask about your training…'} aria-label="Message Gym Bro" />
          <Button type="submit" size="icon" aria-label="Send message"><ArrowRight /></Button>
        </form>
        <p className="coach-footnote">Clear logs save instantly with undo. Uncertain interpretations wait for you.</p>
      </SheetContent>
    </Sheet>
  );
}

function SwapDialog({ state, workoutExerciseId, onClose, runOperation }: {
  state: GymState;
  workoutExerciseId?: string;
  onClose: () => void;
  runOperation: (operation: WorkoutOperation, message?: string, description?: string) => ValidationResult;
}) {
  const workoutExercise = state.today.exercises.find((exercise) => exercise.id === workoutExerciseId);
  const exercise = workoutExercise ? getExercise(workoutExercise.exerciseId) : undefined;
  const replacements = exercise ? substitutionsFor(exercise.id) : [];
  const [showMore, setShowMore] = useState(false);

  useEffect(() => setShowMore(false), [workoutExerciseId]);

  if (!workoutExercise || !exercise) return null;
  const options = showMore
    ? exerciseDatabase.filter((candidate) => candidate.id !== exercise.id && candidate.movementPattern === exercise.movementPattern)
    : replacements;

  return (
    <Dialog open={Boolean(workoutExerciseId)} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog swap-dialog">
        <DialogHeader>
          <p className="dialog-kicker">Change exercise</p>
          <DialogTitle>Replace {exercise.shortName}</DialogTitle>
          <DialogDescription>Recommended first—same intent, useful equipment alternatives.</DialogDescription>
        </DialogHeader>
        <div className="replacement-list">
          <p>Recommended</p>
          {options.map((candidate, index) => (
            <button key={candidate.id} onClick={() => {
              const result = runOperation({
                type: 'CHANGE_EXERCISE',
                workoutExerciseId: workoutExercise.id,
                replacementExerciseId: candidate.id,
                reason: 'User-selected substitution',
                source: 'manual',
              }, 'Exercise changed', `${exercise.shortName} → ${candidate.shortName}`);
              if (result.ok) onClose();
            }}>
              <span className="replacement-rank">{index + 1}</span>
              <div><strong>{candidate.name}</strong><small>{candidate.movementPattern} · {candidate.equipment.join(', ')}</small></div>
              <span className="fit-pill">{candidate.primaryMuscles[0]}</span>
              <ChevronRight />
            </button>
          ))}
        </div>
        <button className="more-options" onClick={() => setShowMore((value) => !value)}>{showMore ? 'Show recommended' : 'More similar movements'}<ChevronDown /></button>
      </DialogContent>
    </Dialog>
  );
}

function WhyDialog({ recommendation, onClose }: { recommendation?: Recommendation; onClose: () => void }) {
  if (!recommendation) return null;
  return (
    <Dialog open={Boolean(recommendation)} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog why-dialog">
        <DialogHeader>
          <div className="why-icon"><Sparkles /></div>
          <p className="dialog-kicker">Why this recommendation?</p>
          <DialogTitle>{recommendation.recommendation}</DialogTitle>
        </DialogHeader>
        <div className="reason-stack">
          <div><span className="reason-label fact">Fact</span><p>{recommendation.fact}</p></div>
          <div><span className="reason-label estimate">Reasoning</span><p>{recommendation.rationale}</p></div>
          {recommendation.userDecision && <div><span className="reason-label decision">Your decision</span><p>{recommendation.userDecision}</p></div>}
        </div>
        <p className="why-disclaimer">This is a recommendation, not a command. Your chosen load always wins.</p>
      </DialogContent>
    </Dialog>
  );
}

function EditSetDialog({ target, units, onClose, runOperation }: {
  target?: { exerciseId: string; set: PerformedSet };
  units: string;
  onClose: () => void;
  runOperation: (operation: WorkoutOperation, message?: string, description?: string) => ValidationResult;
}) {
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(1);
  const [rpe, setRpe] = useState('');
  const [type, setType] = useState<SetType>('working');

  useEffect(() => {
    if (!target) return;
    setWeight(target.set.weight);
    setReps(target.set.reps);
    setRpe(target.set.rpe?.toString() ?? '');
    setType(target.set.type);
  }, [target]);

  if (!target) return null;
  return (
    <Dialog open={Boolean(target)} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog edit-set-dialog">
        <DialogHeader><p className="dialog-kicker">Performed set</p><DialogTitle>Edit set</DialogTitle><DialogDescription>Correct the record without changing what was planned.</DialogDescription></DialogHeader>
        <div className="edit-set-grid">
          <label htmlFor="edit-set-weight">Weight <span>{units}</span><Input id="edit-set-weight" type="number" value={weight} onChange={(event) => setWeight(Number(event.target.value))} /></label>
          <label htmlFor="edit-set-reps">Reps<Input id="edit-set-reps" type="number" value={reps} onChange={(event) => setReps(Number(event.target.value))} /></label>
          <label htmlFor="edit-set-rpe">RPE <span>optional</span><Input id="edit-set-rpe" type="number" min="5" max="10" step="0.5" value={rpe} onChange={(event) => setRpe(event.target.value)} placeholder="—" /></label>
        </div>
        <fieldset className="set-type-picker" aria-label="Set type">
          {(['warm_up', 'working', 'top_set', 'backoff', 'drop_set', 'amrap'] as SetType[]).map((item) => <button key={item} className={type === item ? 'active' : ''} onClick={() => setType(item)}>{setTypeLabels[item]}</button>)}
        </fieldset>
        <DialogFooter className="gym-dialog-footer">
          <Button variant="destructive" onClick={() => {
            const result = runOperation({ type: 'REMOVE_SET', workoutExerciseId: target.exerciseId, setId: target.set.id, source: 'manual' }, 'Set removed');
            if (result.ok) onClose();
          }}><Trash2 /> Delete</Button>
          <Button onClick={() => {
            const result = runOperation({
              type: 'UPDATE_SET',
              workoutExerciseId: target.exerciseId,
              setId: target.set.id,
              changes: { weight, reps, rpe: rpe ? Number(rpe) : undefined, type },
              source: 'manual',
            }, 'Set updated');
            if (result.ok) onClose();
          }}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({ workoutExerciseId, onClose, runOperation }: {
  workoutExerciseId?: string;
  onClose: () => void;
  runOperation: (operation: WorkoutOperation, message?: string, description?: string) => ValidationResult;
}) {
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [workoutExerciseId]);
  if (!workoutExerciseId) return null;
  return (
    <Dialog open={Boolean(workoutExerciseId)} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog">
        <DialogHeader><p className="dialog-kicker">Training context</p><DialogTitle>Add a note</DialogTitle><DialogDescription>Useful next time: setup changes, discomfort, cues, or how the movement felt.</DialogDescription></DialogHeader>
        <textarea className="gym-textarea" value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Shoulder felt better with a slightly narrower grip." aria-label="Exercise note" />
        <DialogFooter className="gym-dialog-footer"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => {
          const result = runOperation({ type: 'ADD_NOTE', workoutExerciseId, note, source: 'manual' }, 'Note saved');
          if (result.ok) onClose();
        }}>Save note</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FinishDialog({ open, state, onClose, onFinish }: { open: boolean; state: GymState; onClose: () => void; onFinish: () => void }) {
  const workingSets = state.today.exercises.reduce((count, exercise) => count + getWorkingSets(exercise).length, 0);
  const volume = state.today.exercises.flatMap((exercise) => getWorkingSets(exercise)).reduce((total, set) => total + set.weight * set.reps, 0);
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog finish-dialog">
        <DialogHeader><div className="finish-icon"><Check /></div><DialogTitle>Finish this workout?</DialogTitle><DialogDescription>The full plan and what you actually performed will both be saved.</DialogDescription></DialogHeader>
        <div className="finish-stats"><div><strong>{workingSets}</strong><span>working sets</span></div><div><strong>{volume.toLocaleString()}</strong><span>lb volume</span></div><div><strong>{state.today.exercises.filter((exercise) => exercise.status === 'complete').length}</strong><span>exercises done</span></div></div>
        <DialogFooter className="gym-dialog-footer"><Button variant="outline" onClick={onClose}>Keep training</Button><Button onClick={onFinish}>Save workout</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryScreen({ state, onCoach }: { state: GymState; onCoach: () => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([state.history[0]?.id]);
  const filtered = state.history.filter((workout) => {
    const haystack = [workout.title, workout.focus, ...workout.exercises.map((item) => getExercise(item.exerciseId).name)].join(' ').toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const benchTrend = [...state.history]
    .reverse()
    .flatMap((workout) => {
      const bench = workout.exercises.find((exercise) => exercise.exerciseId === 'bench-press');
      const top = bench?.performedSets.find((set) => set.type === 'top_set');
      return top ? [{ date: workout.date, weight: top.weight, reps: top.reps }] : [];
    })
    .slice(-5);

  return (
    <div className="screen-scroll history-screen">
      <ScreenTitle
        eyebrow="Training journal"
        title="Your work, remembered."
        action={<button className="icon-button ai-icon-button" aria-label="Ask AI about history" onClick={onCoach}><Sparkles /></button>}
      />

      <div className="history-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workouts or exercises" aria-label="Search workout history" />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X /></button>}</div>

      <section className="trend-card">
        <div className="trend-copy"><p>Bench trend</p><h2>{benchTrend.at(-1)?.weight ?? 235} <span>lb</span></h2><small>Latest top set · {benchTrend.at(-1)?.reps ?? 5} reps</small></div>
        <BenchTrendChart points={benchTrend} />
        <button onClick={onCoach}>Ask about this <ArrowRight /></button>
      </section>

      <div className="section-heading"><div><h2>Recent workouts</h2><span>{filtered.length} sessions</span></div><button>All time <ChevronDown /></button></div>

      <div className="history-list">
        {filtered.length === 0 ? (
          <div className="empty-state"><Search /><h3>No matching workouts</h3><p>Try an exercise name like “bench” or “squat.”</p><Button variant="outline" onClick={() => setQuery('')}>Clear search</Button></div>
        ) : filtered.map((workout) => {
          const isOpen = expanded.includes(workout.id);
          const workingCount = workout.exercises.reduce((count, exercise) => count + getWorkingSets(exercise).length, 0);
          return (
            <article className="history-card" key={workout.id}>
              <button className="history-card-header" onClick={() => setExpanded((items) => isOpen ? items.filter((id) => id !== workout.id) : [...items, workout.id])}>
                <div className="date-tile"><strong>{dateFromKey(workout.date).getDate()}</strong><span>{new Intl.DateTimeFormat('en-US', { month: 'short' }).format(dateFromKey(workout.date))}</span></div>
                <div><h3>{workout.title} <em>—</em> {workout.focus}</h3><p>{workout.exercises.filter((exercise) => getWorkingSets(exercise).length > 0).length} exercises · {workingCount} working sets</p></div>
                <ChevronDown className={isOpen ? 'rotated' : ''} />
              </button>
              {isOpen && (
                <div className="history-card-body">
                  {workout.exercises.filter((exercise) => exercise.performedSets.length > 0).map((workoutExercise) => (
                    <HistoryExercise key={workoutExercise.id} exercise={workoutExercise} units={state.preferences.units} />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <button className="floating-ai-button" onClick={onCoach}><Sparkles /> Ask AI about your training</button>
    </div>
  );
}

function BenchTrendChart({ points }: { points: Array<{ date: string; weight: number; reps: number }> }) {
  const data = points.length ? points : [{ date: '2026-09-03', weight: 230, reps: 5 }, { date: '2026-09-10', weight: 235, reps: 5 }];
  const min = Math.min(...data.map((point) => point.weight)) - 5;
  const max = Math.max(...data.map((point) => point.weight)) + 5;
  const coordinates = data.map((point, index) => ({
    x: data.length === 1 ? 90 : 10 + (index / (data.length - 1)) * 170,
    y: 69 - ((point.weight - min) / Math.max(1, max - min)) * 48,
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  return (
    <svg className="trend-chart" viewBox="0 0 190 80" aria-label="Bench top set trend">
      <defs><linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c7f65b" stopOpacity=".25" /><stop offset="1" stopColor="#c7f65b" stopOpacity="0" /></linearGradient></defs>
      <path d={`${path} L ${coordinates.at(-1)?.x} 78 L ${coordinates[0].x} 78 Z`} fill="url(#trendFill)" />
      <path d={path} fill="none" stroke="#c7f65b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.map((point, index) => <circle key={data[index].date} cx={point.x} cy={point.y} r={index === coordinates.length - 1 ? 4.5 : 3} fill={index === coordinates.length - 1 ? '#c7f65b' : '#151816'} stroke="#c7f65b" strokeWidth="2" />)}
    </svg>
  );
}

function HistoryExercise({ exercise, units }: { exercise: WorkoutExercise; units: string }) {
  const [warmOpen, setWarmOpen] = useState(false);
  const knowledge = getExercise(exercise.exerciseId);
  const working = getWorkingSets(exercise);
  const warmups = getWarmups(exercise);
  const note = exercise.notes.at(-1) ?? exercise.performedSets.find((set) => set.note)?.note;
  const groups: Array<{ label: string; value: string }> = [];
  const top = working.find((set) => set.type === 'top_set');
  if (top) groups.push({ label: 'Top', value: formatPerformedSet(top, units) });
  const nonTop = working.filter((set) => set.type !== 'top_set');
  const seen = new Set<string>();
  nonTop.forEach((set) => {
    const key = `${set.type}-${set.weight}-${set.reps}`;
    if (seen.has(key)) return;
    seen.add(key);
    const matches = nonTop.filter((candidate) => `${candidate.type}-${candidate.weight}-${candidate.reps}` === key);
    groups.push({
      label: setTypeLabels[set.type],
      value: `${set.weight} ${units} × ${set.reps}${matches.length > 1 ? ` × ${matches.length}` : ''}${set.rpe ? ` @ ${set.rpe}` : ''}`,
    });
  });
  return (
    <div className="history-exercise">
      <div className="history-exercise-title"><span className={knowledge.isMainLift ? 'main-lift-dot' : ''} /><h4>{knowledge.shortName}</h4>{exercise.originalExerciseId && <small>replaced {getExercise(exercise.originalExerciseId).shortName}</small>}</div>
      <div className="history-set-summary">
        {groups.map((group, index) => <div key={`${group.label}-${index}`}><span>{group.label}</span><strong>{group.value}</strong></div>)}
      </div>
      {warmups.length > 0 && (
        <Collapsible open={warmOpen} onOpenChange={setWarmOpen}>
          <CollapsibleTrigger className="history-warmup-trigger">Warm-ups: {warmups.length} sets <ChevronDown className={warmOpen ? 'rotated' : ''} /></CollapsibleTrigger>
          <CollapsibleContent className="history-warmup-content">{warmups.map((set) => <span key={set.id}>{set.weight} × {set.reps}</span>)}</CollapsibleContent>
        </Collapsible>
      )}
      {note && <div className="history-note"><Info />{note}</div>}
    </div>
  );
}

function ProgramsScreen({ state, updateDay, addExercise, removeExercise, addDay, onLibrary, onCoach }: {
  state: GymState;
  updateDay: (dayId: string, changes: Partial<Pick<ProgramDay, 'name' | 'focus' | 'estimatedMinutes'>>) => void;
  addExercise: (dayId: string, exerciseId: string) => void;
  removeExercise: (dayId: string, programExerciseId: string) => void;
  addDay: (name: string, focus: string, duration: number) => void;
  onLibrary: () => void;
  onCoach: () => void;
}) {
  const [editDay, setEditDay] = useState<ProgramDay>();
  const [newDayOpen, setNewDayOpen] = useState(false);
  return (
    <div className="screen-scroll programs-screen">
      <ScreenTitle eyebrow="Current program" title="Train your way." action={<button className="icon-button" aria-label="Open exercise library" onClick={onLibrary}><LibraryBig /></button>} />

      <section className="program-hero">
        <div className="program-hero-top"><span className="active-program-pill"><span /> Active</span><button><CircleEllipsis /></button></div>
        <h2>{state.program.name}</h2>
        <p>{state.program.description}</p>
        <div className="program-meta"><div><strong>{state.program.days.length}</strong><span>days</span></div><div><strong>W{state.program.week}</strong><span>current week</span></div><div><strong>Yours</strong><span>program owner</span></div></div>
      </section>

      <div className="program-principle"><div className="coach-avatar"><Bot /></div><div><strong>You’re driving.</strong><span>I’ll suggest small changes when useful. Your program doesn’t change unless you approve it.</span></div><button onClick={onCoach}>Ask AI</button></div>

      <div className="section-heading"><div><h2>Training days</h2><span>Flexible set structures</span></div><Button variant="outline" size="sm" onClick={() => setNewDayOpen(true)}><Plus /> New day</Button></div>
      <div className="program-day-list">
        {state.program.days.map((day, index) => (
          <article className={`program-day-card ${day.id === state.today.programDayId ? 'today-day' : ''}`} key={day.id}>
            <header><div className="day-number">D{index + 1}</div><div><p>{day.id === state.today.programDayId ? 'Today' : `Day ${index + 1}`}</p><h3>{day.name} <em>—</em> {day.focus}</h3></div><button onClick={() => setEditDay(day)}><Pencil /></button></header>
            <div className="program-exercises">
              {day.exercises.length === 0 ? <div className="empty-day">No exercises yet. Edit this day to add one.</div> : day.exercises.map((item, itemIndex) => (
                <div key={item.id}><span>{itemIndex + 1}</span><div><strong>{getExercise(item.exerciseId).shortName}</strong><small>{item.detail}{item.optional ? ' · Optional' : ''}</small></div>{getExercise(item.exerciseId).isMainLift && <span className="main-badge">Main</span>}</div>
              ))}
            </div>
            <footer><span><Clock3 /> {day.estimatedMinutes} min</span><button onClick={() => setEditDay(day)}>Edit day <ChevronRight /></button></footer>
          </article>
        ))}
      </div>

      <button className="library-card" onClick={onLibrary}><div><LibraryBig /></div><span><strong>Exercise library</strong><small>Structured movement data and substitutions</small></span><ChevronRight /></button>

      <ProgramEditor day={editDay} onClose={() => setEditDay(undefined)} updateDay={updateDay} addExercise={addExercise} removeExercise={removeExercise} />
      <NewDayDialog open={newDayOpen} onClose={() => setNewDayOpen(false)} addDay={addDay} />
    </div>
  );
}

function ProgramEditor({ day, onClose, updateDay, addExercise, removeExercise }: {
  day?: ProgramDay;
  onClose: () => void;
  updateDay: (dayId: string, changes: Partial<Pick<ProgramDay, 'name' | 'focus' | 'estimatedMinutes'>>) => void;
  addExercise: (dayId: string, exerciseId: string) => void;
  removeExercise: (dayId: string, programExerciseId: string) => void;
}) {
  const [name, setName] = useState('');
  const [focus, setFocus] = useState('');
  const [duration, setDuration] = useState(60);
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    if (!day) return;
    setName(day.name);
    setFocus(day.focus);
    setDuration(day.estimatedMinutes);
    setAdding(false);
  }, [day]);
  if (!day) return null;
  return (
    <Dialog open={Boolean(day)} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog program-editor">
        <DialogHeader><p className="dialog-kicker">Program day</p><DialogTitle>Edit {day.name}</DialogTitle><DialogDescription>Top sets, ranges, and optional work stay structured—not flattened into generic sets.</DialogDescription></DialogHeader>
        <div className="program-field-grid"><label htmlFor="edit-day-name">Day name<Input id="edit-day-name" value={name} onChange={(event) => setName(event.target.value)} /></label><label htmlFor="edit-day-focus">Focus<Input id="edit-day-focus" value={focus} onChange={(event) => setFocus(event.target.value)} /></label><label htmlFor="edit-day-minutes">Minutes<Input id="edit-day-minutes" type="number" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label></div>
        <div className="editor-exercises"><div className="editor-section-title"><span>Exercises</span><button onClick={() => setAdding((value) => !value)}><Plus /> Add</button></div>{day.exercises.map((item) => <div key={item.id}><span><strong>{getExercise(item.exerciseId).shortName}</strong><small>{item.detail}</small></span><button aria-label={`Remove ${getExercise(item.exerciseId).shortName}`} onClick={() => removeExercise(day.id, item.id)}><Trash2 /></button></div>)}</div>
        {adding && <div className="quick-library">{exerciseDatabase.filter((exercise) => !day.exercises.some((item) => item.exerciseId === exercise.id)).slice(0, 8).map((exercise) => <button key={exercise.id} onClick={() => addExercise(day.id, exercise.id)}><Plus />{exercise.shortName}</button>)}</div>}
        <DialogFooter className="gym-dialog-footer"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { updateDay(day.id, { name, focus, estimatedMinutes: duration }); successToast('Program day updated', `${name} · ${duration} min`); onClose(); }}>Save day</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDayDialog({ open, onClose, addDay }: { open: boolean; onClose: () => void; addDay: (name: string, focus: string, duration: number) => void }) {
  const [name, setName] = useState('Upper');
  const [focus, setFocus] = useState('Hypertrophy');
  const [duration, setDuration] = useState(60);
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="gym-dialog">
        <DialogHeader><p className="dialog-kicker">Create workout</p><DialogTitle>Add a training day</DialogTitle><DialogDescription>Start with the day structure. Add exercises next.</DialogDescription></DialogHeader>
        <div className="program-field-grid"><label htmlFor="new-day-name">Day name<Input id="new-day-name" value={name} onChange={(event) => setName(event.target.value)} /></label><label htmlFor="new-day-focus">Focus<Input id="new-day-focus" value={focus} onChange={(event) => setFocus(event.target.value)} /></label><label htmlFor="new-day-minutes">Minutes<Input id="new-day-minutes" type="number" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label></div>
        <DialogFooter className="gym-dialog-footer"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { addDay(name, focus, duration); successToast('Training day created', `${name} · ${focus}`); onClose(); }}>Create day</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const autonomyOptions: Array<{ value: AutonomyLevel; label: string; description: string }> = [
  { value: 'track', label: 'Track', description: 'Log and remember. Advice stays quiet.' },
  { value: 'assist', label: 'Assist', description: 'Recommend weights, swaps, and small adjustments.' },
  { value: 'coach', label: 'Coach', description: 'Help manage progression and today’s workout.' },
  { value: 'full_coach', label: 'Full Coach', description: 'Build and manage programming.' },
];

const warmupOptions: Array<{ value: WarmupPreference; label: string; description: string }> = [
  { value: 'dont_track', label: 'Don’t track', description: 'Keep warm-ups out of the formal log.' },
  { value: 'track_if_wanted', label: 'Track if I want', description: 'Quick entry when the details matter.' },
  { value: 'always_track', label: 'Always track', description: 'Record every warm-up set.' },
];

const rpeOptions: Array<{ value: RpePreference; label: string; description: string }> = [
  { value: 'minimal', label: 'Minimal', description: 'Only ask at major decision points.' },
  { value: 'balanced', label: 'Balanced', description: 'Main lifts and top sets when useful.' },
  { value: 'detailed', label: 'Detailed', description: 'Show optional effort entry everywhere.' },
];

function ProfileScreen({ state, updatePreferences, onReset }: {
  state: GymState;
  updatePreferences: (changes: Partial<GymState['preferences']>) => void;
  onReset: () => void;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  return (
    <div className="screen-scroll profile-screen">
      <ScreenTitle eyebrow="Preferences & memory" title="Train on your terms." />
      <section className="profile-card">
        <div className="profile-avatar">BD</div><div><h2>Brian</h2><p>Intermediate · Powerbuilding</p></div><button><Pencil /></button>
      </section>

      <SettingsSection title="AI control" description="You can change this anytime. Your explicit choices always override the AI.">
        <RadioGroup value={state.preferences.autonomy} onValueChange={(value) => { updatePreferences({ autonomy: value as AutonomyLevel }); successToast('AI control updated', autonomyOptions.find((option) => option.value === value)?.label); }} className="settings-radio-grid autonomy-grid">
          {autonomyOptions.map((option) => (
            <label htmlFor={`autonomy-${option.value}`} key={option.value} className={`settings-option ${state.preferences.autonomy === option.value ? 'selected' : ''}`}>
              <RadioGroupItem id={`autonomy-${option.value}`} value={option.value} /><span><strong>{option.label}{option.value === 'assist' && <em>Default</em>}</strong><small>{option.description}</small></span>
            </label>
          ))}
        </RadioGroup>
      </SettingsSection>

      <SettingsSection title="Warm-up tracking" description="Warm-ups stay collapsed in your journal either way.">
        <RadioGroup value={state.preferences.warmups} onValueChange={(value) => updatePreferences({ warmups: value as WarmupPreference })} className="settings-radio-grid">
          {warmupOptions.map((option) => <label htmlFor={`warmup-${option.value}`} key={option.value} className={`settings-option horizontal-option ${state.preferences.warmups === option.value ? 'selected' : ''}`}><RadioGroupItem id={`warmup-${option.value}`} value={option.value} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
        </RadioGroup>
      </SettingsSection>

      <SettingsSection title="Effort tracking" description="RPE is useful, never mandatory.">
        <RadioGroup value={state.preferences.rpe} onValueChange={(value) => updatePreferences({ rpe: value as RpePreference })} className="settings-radio-grid">
          {rpeOptions.map((option) => <label htmlFor={`rpe-${option.value}`} key={option.value} className={`settings-option horizontal-option ${state.preferences.rpe === option.value ? 'selected' : ''}`}><RadioGroupItem id={`rpe-${option.value}`} value={option.value} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}
        </RadioGroup>
      </SettingsSection>

      <SettingsSection title="What I remember" description="Confirmed preferences are different from patterns I’ve only noticed.">
        <div className="memory-groups">
          <div><span className="memory-label confirmed"><Check /> Confirmed</span><div className="memory-tags">{state.preferences.trainingStyle.map((item) => <span key={item}>{item}</span>)}{state.preferences.unavailableEquipment.map((item) => <span key={item}>No {item}</span>)}</div></div>
          <div><span className="memory-label observed"><Info /> Observed</span><div className="observed-row"><p>{state.preferences.observedBehaviors[0]}</p><button onClick={() => updatePreferences({ observedBehaviors: [] })}>Dismiss</button></div></div>
        </div>
      </SettingsSection>

      <SettingsSection title="Workout experience">
        <div className="switch-list">
          <label htmlFor="rest-timer-setting"><span><strong>Rest timer</strong><small>Start automatically after working sets</small></span><Switch id="rest-timer-setting" checked={state.preferences.restTimer} onCheckedChange={(checked) => updatePreferences({ restTimer: checked })} /></label>
          <label htmlFor="haptics-setting"><span><strong>Haptic feedback</strong><small>Confirm logged sets on supported devices</small></span><Switch id="haptics-setting" checked={state.preferences.haptics} onCheckedChange={(checked) => updatePreferences({ haptics: checked })} /></label>
          <button className="units-setting" onClick={() => updatePreferences({ units: state.preferences.units === 'lb' ? 'kg' : 'lb' })}><span><strong>Units</strong><small>Tap to switch workout loads</small></span><em>{state.preferences.units}</em></button>
        </div>
      </SettingsSection>

      <section className="data-card"><div><RotateCcw /><span><strong>Demo training data</strong><small>Stored on this device for the MVP</small></span></div><Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>Reset</Button></section>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="gym-dialog"><DialogHeader><DialogTitle>Reset the demo?</DialogTitle><DialogDescription>This replaces logged demo changes with the original reference workout and history.</DialogDescription></DialogHeader><DialogFooter className="gym-dialog-footer"><Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => { onReset(); setResetOpen(false); }}>Reset data</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="settings-section"><header><h2>{title}</h2>{description && <p>{description}</p>}</header>{children}</section>;
}

function ExerciseLibrary({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'main' | 'accessory'>('all');
  const results = exerciseDatabase.filter((exercise) => {
    const matchesFilter = filter === 'all' || (filter === 'main' ? exercise.isMainLift : !exercise.isMainLift);
    const haystack = [exercise.name, exercise.movementPattern, ...exercise.primaryMuscles, ...exercise.equipment].join(' ').toLowerCase();
    return matchesFilter && haystack.includes(query.toLowerCase());
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="library-sheet">
        <SheetHeader><p className="dialog-kicker">Exercise knowledge</p><SheetTitle>Exercise library</SheetTitle><SheetDescription>Structured metadata powers both the UI and AI substitutions.</SheetDescription></SheetHeader>
        <div className="library-search"><Search /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movement, muscle, equipment" /></div>
        <div className="library-filters">{(['all', 'main', 'accessory'] as const).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'All' : item === 'main' ? 'Main lifts' : 'Accessories'}</button>)}</div>
        <div className="library-results">
          {results.map((exercise) => (
            <article key={exercise.id}>
              <div className={`exercise-glyph ${exercise.category}`}><Dumbbell /></div>
              <div><h3>{exercise.name}</h3><p>{exercise.movementPattern} · {exercise.primaryMuscles.join(', ')}</p><div className="exercise-metadata"><span>{exercise.equipment[0]}</span><span>{exercise.difficulty}</span><span>{exercise.strengthSuitability >= 8 ? 'Strength' : 'Hypertrophy'}</span></div></div>
            </article>
          ))}
          {results.length === 0 && <div className="empty-state"><Search /><h3>No exercises found</h3><p>Try a movement, muscle, or piece of equipment.</p></div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
