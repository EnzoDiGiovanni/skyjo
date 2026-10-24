import { describe, expect, it } from 'vitest';
import {
  createGame,
  currentRoundIndex,
  isDoubled,
  leaders,
  missingPlayers,
  parseScore,
  ranking,
  roundPoints,
  setCloser,
  setScore,
  starterIndex,
  totals,
  validateNewPlayer,
  winners,
  type Game,
  type Round,
} from '../src/game';

const round = (scores: (number | null)[], closer: number | null): Round => ({ scores, closer });

/** Joue une manche complète (scores + qui a fini) sur la manche en cours. */
function play(game: Game, scores: number[], closer: number): Game {
  const r = currentRoundIndex(game);
  let g = game;
  scores.forEach((s, p) => {
    g = setScore(g, r, p, s);
  });
  return setCloser(g, r, closer);
}

describe('doublement', () => {
  it('pas doublé si celui qui a fini a strictement le plus petit score', () => {
    const r = round([3, 10, 7], 0);
    expect(isDoubled(r)).toBe(false);
    expect(roundPoints(r)).toEqual([3, 10, 7]);
  });
  it('doublé si un autre joueur a moins', () => {
    const r = round([9, 4, 12], 0);
    expect(isDoubled(r)).toBe(true);
    expect(roundPoints(r)).toEqual([18, 4, 12]);
  });
  it('doublé en cas d’égalité avec le plus petit score', () => {
    expect(roundPoints(round([5, 5, 8], 0))).toEqual([10, 5, 8]);
  });
  it('jamais doublé si le score est nul ou négatif', () => {
    expect(roundPoints(round([0, -3, 4], 0))).toEqual([0, -3, 4]);
    expect(roundPoints(round([-2, -5, 4], 0))).toEqual([-2, -5, 4]);
  });
  it('rien tant que personne n’a fini', () => {
    expect(roundPoints(round([9, 4], null))).toEqual([9, 4]);
  });
});

describe('déroulé de partie', () => {
  it('une nouvelle manche apparaît quand la précédente est complète', () => {
    let g = createGame(['A', 'B'], 100, 'test');
    expect(g.rounds).toHaveLength(1);
    g = play(g, [10, 20], 0);
    expect(g.rounds).toHaveLength(2);
    expect(currentRoundIndex(g)).toBe(1);
    expect(totals(g)).toEqual([10, 20]);
    expect(g.finished).toBe(false);
  });

  it('effacer un score retire la manche suivante encore vide', () => {
    let g = play(createGame(['A', 'B'], 100, 'test'), [10, 20], 0);
    g = setScore(g, 0, 1, null);
    expect(g.rounds).toHaveLength(1);
    expect(missingPlayers(g.rounds[0])).toEqual([1]);
  });

  it('celui qui a fini commence la manche suivante', () => {
    let g = play(createGame(['A', 'B', 'C'], 100, 'test'), [5, 2, 9], 1);
    expect(starterIndex(g, 0)).toBeNull();
    expect(starterIndex(g, 1)).toBe(1);
  });

  it('la partie s’arrête dès qu’un joueur atteint la limite', () => {
    let g = createGame(['A', 'B'], 50, 'test');
    g = play(g, [20, 30], 0);
    g = play(g, [10, 20], 0);
    expect(totals(g)).toEqual([30, 50]);
    expect(g.finished).toBe(true);
    expect(g.rounds).toHaveLength(2);
    expect(currentRoundIndex(g)).toBe(-1);
    expect(winners(g)).toEqual(['A']);
  });

  it('le doublement peut faire franchir la limite', () => {
    let g = createGame(['A', 'B'], 50, 'test');
    g = play(g, [30, 10], 0); // 30 doublé → 60
    expect(totals(g)).toEqual([60, 10]);
    expect(g.finished).toBe(true);
  });

  it('corriger une manche peut relancer une partie terminée', () => {
    let g = createGame(['A', 'B'], 50, 'test');
    g = play(g, [20, 30], 0);
    g = play(g, [10, 20], 0);
    g = setScore(g, 1, 1, 5);
    expect(g.finished).toBe(false);
    expect(g.rounds).toHaveLength(3);
  });

  it('corriger une manche peut terminer la partie et retire la manche vide', () => {
    let g = createGame(['A', 'B'], 50, 'test');
    g = play(g, [20, 30], 0);
    g = play(g, [10, 5], 1);
    expect(totals(g)).toEqual([30, 35]);
    expect(g.rounds).toHaveLength(3);
    g = setScore(g, 1, 1, 25);
    expect(g.finished).toBe(true);
    expect(g.rounds).toHaveLength(2);
  });
});

describe('classement', () => {
  it('le plus petit total gagne, ex æquo au même rang', () => {
    let g = createGame(['A', 'B', 'C'], 100, 'test');
    g = play(g, [-4, 8, -4], 0);
    expect(leaders(g)).toEqual([0, 2]);
    expect(ranking(g).map((e) => e.rank)).toEqual([1, 1, 3]);
  });
  it('aucun meneur sans score', () => {
    expect(leaders(createGame(['A', 'B']))).toEqual([]);
  });
});

describe('parseScore', () => {
  it('accepte les entiers relatifs', () => {
    expect(parseScore('12')).toBe(12);
    expect(parseScore(' -7 ')).toBe(-7);
    expect(parseScore('−3')).toBe(-3);
    expect(parseScore('0')).toBe(0);
  });
  it('rejette le reste', () => {
    expect(parseScore('')).toBeNull();
    expect(parseScore('-')).toBeNull();
    expect(parseScore('1.5')).toBeNull();
    expect(parseScore('abc')).toBeNull();
    expect(parseScore('1000')).toBeNull();
  });
});

describe('validateNewPlayer', () => {
  it('refuse les doublons sans tenir compte de la casse', () => {
    expect(validateNewPlayer('léa', ['Léa'])).toMatch(/déjà/);
    expect(validateNewPlayer('  ', [])).toMatch(/prénom/);
    expect(validateNewPlayer('Tom', ['Léa'])).toBeNull();
  });
});
