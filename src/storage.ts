import { DEFAULT_LIMIT, type Game, type Round } from './game';

const GAMES_KEY = 'skyjo:games';
const VERSION_KEY = 'skyjo:version';
export const SCHEMA_VERSION = 1;

// Repli en mémoire si localStorage est indisponible (navigation privée stricte, quota…) :
// la partie reste jouable pendant la session, sans persistance.
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return memory.get(key) ?? localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string): boolean {
  memory.set(key, value);
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function isRound(x: unknown): x is Round {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return Array.isArray(r.scores) && (r.closer === null || typeof r.closer === 'number');
}

function isGame(x: unknown): x is Game {
  if (!x || typeof x !== 'object') return false;
  const g = x as Record<string, unknown>;
  return (
    typeof g.id === 'string' &&
    typeof g.createdAt === 'string' &&
    Array.isArray(g.players) &&
    Array.isArray(g.rounds) &&
    g.rounds.length > 0 &&
    g.rounds.every(isRound)
  );
}

/** Migre les données stockées vers la version courante du schéma. */
function migrate(data: unknown, _fromVersion: number): Game[] {
  // Version 1 : format initial. Ajouter ici les migrations futures (if (fromVersion < 2) …).
  if (!Array.isArray(data)) return [];
  return data.filter(isGame).map((g) => ({
    ...g,
    limit: typeof g.limit === 'number' && g.limit > 0 ? g.limit : DEFAULT_LIMIT,
    finished: Boolean(g.finished),
  }));
}

export function loadGames(): Game[] {
  const raw = readRaw(GAMES_KEY);
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const version = Number(readRaw(VERSION_KEY) ?? SCHEMA_VERSION) || SCHEMA_VERSION;
  return migrate(data, version);
}

export function saveGames(games: Game[]): boolean {
  const ok = writeRaw(GAMES_KEY, JSON.stringify(games));
  writeRaw(VERSION_KEY, String(SCHEMA_VERSION));
  return ok;
}

export function getGame(id: string): Game | undefined {
  return loadGames().find((g) => g.id === id);
}

export function upsertGame(game: Game): boolean {
  const games = loadGames();
  const i = games.findIndex((g) => g.id === game.id);
  if (i === -1) games.push(game);
  else games[i] = game;
  return saveGames(games);
}

export function deleteGame(id: string): boolean {
  return saveGames(loadGames().filter((g) => g.id !== id));
}
