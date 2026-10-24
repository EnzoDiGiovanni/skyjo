// Logique pure du compteur : aucune dépendance au DOM ni au stockage.

export type Score = number | null;

/** Une manche : points saisis (avant doublement) et joueur qui a retourné toutes ses cartes. */
export type Round = {
  scores: Score[]; // scores[joueur], null = non saisi
  closer: number | null; // index du joueur qui a fini la manche
};

export type Game = {
  id: string;
  createdAt: string;
  players: string[];
  limit: number; // la partie s'arrête quand un joueur atteint ou dépasse ce total
  rounds: Round[]; // la dernière manche est celle en cours (sauf partie terminée)
  finished: boolean;
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const DEFAULT_LIMIT = 100;
export const LIMITS = [50, 100, 150, 200];

/** Bornes raisonnables d'une manche : 12 cartes de −2 à 12. */
const MIN_SCORE = -99;
const MAX_SCORE = 999;

export function emptyRound(playerCount: number): Round {
  return { scores: Array.from({ length: playerCount }, () => null), closer: null };
}

export function createGame(
  players: string[],
  limit: number = DEFAULT_LIMIT,
  id: string = newId(),
): Game {
  return {
    id,
    createdAt: new Date().toISOString(),
    players: [...players],
    limit,
    rounds: [emptyRound(players.length)],
    finished: false,
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Normalise un nom de joueur (espaces superflus). */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Retourne un message d'erreur si le nom ne peut pas être ajouté, sinon null. */
export function validateNewPlayer(name: string, existing: string[]): string | null {
  const n = normalizeName(name);
  if (!n) return "Écrivez un prénom avant d'appuyer sur Ajouter.";
  if (existing.length >= MAX_PLAYERS) return `On ne peut pas jouer à plus de ${MAX_PLAYERS}.`;
  if (existing.some((p) => p.toLocaleLowerCase('fr') === n.toLocaleLowerCase('fr'))) {
    return `${n} est déjà dans la liste. Ajoutez une initiale pour les distinguer (par exemple ${n} B.).`;
  }
  return null;
}

/** Parse une saisie utilisateur : entier relatif, ou null si vide / invalide (« - » seul compris). */
export function parseScore(raw: string): Score {
  const s = raw.trim().replace('−', '-');
  if (!/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= MIN_SCORE && n <= MAX_SCORE ? n : null;
}

export function isRoundComplete(round: Round): boolean {
  return round.scores.length > 0 && round.scores.every((s) => s !== null) && round.closer !== null;
}

export function isRoundEmpty(round: Round): boolean {
  return round.closer === null && round.scores.every((s) => s === null);
}

/** Indices des joueurs sans score pour cette manche. */
export function missingPlayers(round: Round): number[] {
  return round.scores.flatMap((s, i) => (s === null ? [i] : []));
}

/**
 * Le joueur qui a fini la manche doit avoir strictement le plus petit score.
 * Sinon (égalité comprise), ses points sont doublés — uniquement s'ils sont positifs.
 */
export function isDoubled(round: Round): boolean {
  const c = round.closer;
  if (c === null) return false;
  const own = round.scores[c];
  if (own === null || own <= 0) return false;
  return round.scores.some((s, i) => i !== c && s !== null && s <= own);
}

/** Points réellement comptés pour chaque joueur (doublement appliqué). */
export function roundPoints(round: Round): Score[] {
  const doubled = isDoubled(round);
  return round.scores.map((s, i) => (s !== null && doubled && i === round.closer ? s * 2 : s));
}

function sumRounds(rounds: Round[], playerCount: number): number[] {
  const t = Array.from({ length: playerCount }, () => 0);
  for (const round of rounds) {
    roundPoints(round).forEach((s, p) => {
      t[p] += s ?? 0;
    });
  }
  return t;
}

export function totals(game: Game): number[] {
  return sumRounds(game.rounds, game.players.length);
}

/** Index de la première manche incomplète, ou -1 si tout est saisi. */
export function currentRoundIndex(game: Game): number {
  return game.rounds.findIndex((r) => !isRoundComplete(r));
}

/** Qui commence la manche : celui qui a fini la précédente (null pour la première). */
export function starterIndex(game: Game, roundIndex: number): number | null {
  return roundIndex > 0 ? (game.rounds[roundIndex - 1]?.closer ?? null) : null;
}

export function hasAnyScore(game: Game): boolean {
  return game.rounds.some((r) => r.scores.some((s) => s !== null));
}

function reachedLimit(rounds: Round[], game: Game): boolean {
  return Math.max(...sumRounds(rounds, game.players.length)) >= game.limit;
}

/**
 * Remet la partie d'aplomb après une saisie :
 * - retire une manche vide en trop (manche précédente redevenue incomplète, ou limite atteinte) ;
 * - ajoute la manche suivante quand tout est saisi et que personne n'a atteint la limite ;
 * - recalcule « terminée ».
 */
export function normalize(game: Game): Game {
  const rounds = [...game.rounds];
  while (rounds.length > 1 && isRoundEmpty(rounds[rounds.length - 1])) {
    const before = rounds.slice(0, -1);
    const prev = before[before.length - 1];
    if (isRoundComplete(prev) && !reachedLimit(before, game)) break;
    rounds.pop();
  }
  const allDone = rounds.every(isRoundComplete);
  const reached = reachedLimit(rounds, game);
  if (allDone && !reached) rounds.push(emptyRound(game.players.length));
  return { ...game, rounds, finished: allDone && reached };
}

/** Retourne une nouvelle partie avec le score modifié. */
export function setScore(game: Game, round: number, player: number, value: Score): Game {
  const rounds = game.rounds.map((r, i) =>
    i === round ? { ...r, scores: r.scores.map((s, p) => (p === player ? value : s)) } : r,
  );
  return normalize({ ...game, rounds });
}

/** Retourne une nouvelle partie avec le joueur qui a fini la manche (null pour effacer). */
export function setCloser(game: Game, round: number, player: number | null): Game {
  const rounds = game.rounds.map((r, i) => (i === round ? { ...r, closer: player } : r));
  return normalize({ ...game, rounds });
}

/** Indices des joueurs au total le plus bas (vide si aucun score saisi). */
export function leaders(game: Game): number[] {
  if (!hasAnyScore(game)) return [];
  const t = totals(game);
  const min = Math.min(...t);
  return t.flatMap((v, i) => (v === min ? [i] : []));
}

export type RankingEntry = { rank: number; player: string; index: number; total: number };

/** Classement par total croissant ; ex æquo au même rang (1, 1, 3…). Ordre stable sinon. */
export function ranking(game: Game): RankingEntry[] {
  const t = totals(game);
  const sorted = game.players
    .map((player, index) => ({ player, index, total: t[index] }))
    .sort((a, b) => a.total - b.total || a.index - b.index);
  return sorted.map((e) => ({
    ...e,
    rank: sorted.findIndex((o) => o.total === e.total) + 1,
  }));
}

/** Noms des gagnants (plusieurs en cas d'égalité). */
export function winners(game: Game): string[] {
  return ranking(game).filter((e) => e.rank === 1).map((e) => e.player);
}

/** Joueurs qui ont atteint ou dépassé la limite. */
export function overLimit(game: Game): number[] {
  return totals(game).flatMap((v, i) => (v >= game.limit ? [i] : []));
}
