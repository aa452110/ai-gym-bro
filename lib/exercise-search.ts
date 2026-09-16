import { exerciseDatabase, getExercise } from './gym-data';
import type { ExerciseKnowledge, UserPreferences } from './gym-types';

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const searchableText = (exercise: ExerciseKnowledge) => normalize([
  exercise.name,
  exercise.shortName,
  ...(exercise.aliases ?? []),
  exercise.category,
  exercise.movementPattern,
  ...exercise.primaryMuscles,
  ...exercise.secondaryMuscles,
  ...exercise.equipment,
].join(' '));

function searchScore(exercise: ExerciseKnowledge, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return exercise.isMainLift ? 2 : 1;
  const terms = normalizedQuery.split(' ').filter(Boolean);
  const name = normalize(exercise.name);
  const shortName = normalize(exercise.shortName);
  const aliases = (exercise.aliases ?? []).map(normalize);
  const haystack = searchableText(exercise);
  if (!terms.every((term) => haystack.includes(term))) return -1;

  let score = terms.length * 10;
  if (name === normalizedQuery || shortName === normalizedQuery || aliases.includes(normalizedQuery)) score += 100;
  if (name.startsWith(normalizedQuery) || shortName.startsWith(normalizedQuery)) score += 40;
  score += terms.filter((term) => name.includes(term) || shortName.includes(term)).length * 12;
  score += exercise.isMainLift ? 2 : 0;
  return score;
}

export function searchExercises(query: string, options?: {
  excludeId?: string;
  limit?: number;
  filter?: 'all' | 'main' | 'accessory';
}) {
  const filter = options?.filter ?? 'all';
  return exerciseDatabase
    .filter((exercise) => exercise.id !== options?.excludeId)
    .filter((exercise) => filter === 'all' || (filter === 'main' ? exercise.isMainLift : !exercise.isMainLift))
    .map((exercise) => ({ exercise, score: searchScore(exercise, query) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name))
    .slice(0, options?.limit ?? exerciseDatabase.length)
    .map(({ exercise }) => exercise);
}

export function findExerciseFromText(input: string) {
  const normalizedInput = normalize(input);
  return exerciseDatabase
    .map((exercise) => {
      const names = [exercise.name, exercise.shortName, ...(exercise.aliases ?? [])].map(normalize);
      const match = names.find((name) => normalizedInput.includes(name));
      return { exercise, score: match?.length ?? 0 };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.exercise;
}

export function rankSubstitutions(exerciseId: string, preferences: UserPreferences, query = '') {
  const current = getExercise(exerciseId);
  const desired = query ? searchExercises(query, { excludeId: exerciseId }) : exerciseDatabase;
  const unavailable = preferences.unavailableEquipment.map(normalize);
  const disliked = new Set(preferences.confirmedExerciseDislikes);

  return desired
    .filter((candidate) => candidate.id !== current.id && !disliked.has(candidate.id))
    .filter((candidate) => !candidate.equipment.some((item) => unavailable.some((blocked) => normalize(item).includes(blocked))))
    .map((candidate) => {
      let score = current.similarExerciseIds.includes(candidate.id) ? 100 : 0;
      if (candidate.movementPattern === current.movementPattern) score += 35;
      score += candidate.primaryMuscles.filter((muscle) => current.primaryMuscles.includes(muscle)).length * 14;
      score += candidate.secondaryMuscles.filter((muscle) => current.secondaryMuscles.includes(muscle)).length * 4;
      if (candidate.isMainLift === current.isMainLift) score += 6;
      return { candidate, score };
    })
    .filter(({ score }) => Boolean(query) || score > 0)
    .sort((a, b) => b.score - a.score || b.candidate.hypertrophySuitability - a.candidate.hypertrophySuitability)
    .map(({ candidate }) => candidate);
}
