import {
  DEFAULT_RULES,
  type EndMode,
  LIMITS,
  LIMIT_RANGE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUNDS_RANGE,
  ROUND_COUNTS,
  type Rules,
  createGame,
  normalizeName,
  parseRuleValue,
  validateNewPlayer,
} from '../game';
import { upsertGame } from '../storage';
import { esc, navigate, saveWarning } from '../ui';

/** Ce qui change d'un mode de fin à l'autre dans le formulaire. */
const MODES: Record<
  EndMode,
  {
    label: string;
    hint: string;
    presets: number[];
    range: { min: number; max: number };
    unit: string;
    key: 'limit' | 'maxRounds';
  }
> = {
  points: {
    label: 'Aux points',
    hint: "Dès qu'un joueur atteint ce total, la partie s'arrête.",
    presets: LIMITS,
    range: LIMIT_RANGE,
    unit: 'points',
    key: 'limit',
  },
  rounds: {
    label: 'En manches',
    hint: "Comme sur le carnet : la partie s'arrête après la dernière manche.",
    presets: ROUND_COUNTS,
    range: ROUNDS_RANGE,
    unit: 'manches',
    key: 'maxRounds',
  },
};

export function renderSetup(root: HTMLElement): void {
  const players: string[] = [];
  const rules: Rules = { ...DEFAULT_RULES };
  // Valeur saisie à la main (« Autre ») pour chaque mode, sinon null.
  const custom: Record<EndMode, string | null> = { points: null, rounds: null };

  root.innerHTML = `
    <main class="page setup">
      <a href="#/" class="back">‹ Accueil</a>
      <h1>Qui joue ?</h1>
      <p class="lead">Ajoutez les joueurs dans l'ordre où ils sont assis autour de la table (de ${MIN_PLAYERS} à ${MAX_PLAYERS}).</p>

      <form id="add-form" class="add-form" autocomplete="off">
        <label for="name" class="sr-only">Prénom du joueur</label>
        <input id="name" class="field" type="text" placeholder="Prénom" maxlength="20"
          enterkeyhint="done" autocapitalize="words" />
        <button class="btn btn-light" type="submit">Ajouter</button>
      </form>
      <p id="error" class="error" role="alert"></p>

      <ol id="players" class="paper seat-list" hidden></ol>

      <fieldset class="limit">
        <legend>Fin de la partie</legend>
        <div class="segmented segmented-mode" role="radiogroup" aria-label="Type de fin">
          ${(Object.keys(MODES) as EndMode[])
            .map(
              (m) => `
            <label class="segment">
              <input type="radio" name="mode" value="${m}" ${m === rules.mode ? 'checked' : ''} />
              <span>${MODES[m].label}</span>
            </label>`,
            )
            .join('')}
        </div>
        <p class="limit-hint" id="mode-hint"></p>
        <div class="segmented" id="values" role="radiogroup"></div>
        <div class="custom" id="custom" hidden>
          <label for="custom-value" class="sr-only" id="custom-label"></label>
          <input id="custom-value" class="field field-num" type="text" inputmode="numeric"
            maxlength="3" autocomplete="off" enterkeyhint="done" />
          <span class="custom-unit" id="custom-unit"></span>
        </div>
        <p id="rule-error" class="error" role="alert"></p>
      </fieldset>

      <div class="bottom-bar">
        <button id="start" class="btn btn-sun btn-big" disabled>Commencer la partie</button>
      </div>
      <p id="save-warning" class="warn" hidden>Attention : ce téléphone n'enregistre pas les scores.</p>
    </main>`;

  const form = root.querySelector<HTMLFormElement>('#add-form')!;
  const nameInput = root.querySelector<HTMLInputElement>('#name')!;
  const error = root.querySelector<HTMLElement>('#error')!;
  const list = root.querySelector<HTMLOListElement>('#players')!;
  const start = root.querySelector<HTMLButtonElement>('#start')!;
  const modeHint = root.querySelector<HTMLElement>('#mode-hint')!;
  const values = root.querySelector<HTMLElement>('#values')!;
  const customBox = root.querySelector<HTMLElement>('#custom')!;
  const customInput = root.querySelector<HTMLInputElement>('#custom-value')!;
  const ruleError = root.querySelector<HTMLElement>('#rule-error')!;

  /** Valeur de fin choisie pour le mode courant, ou null si la saisie libre est invalide. */
  function ruleValue(): number | null {
    const m = MODES[rules.mode];
    const raw = custom[rules.mode];
    return raw === null ? rules[m.key] : parseRuleValue(raw, m.range);
  }

  function updateStart(): void {
    const valid = ruleValue() !== null;
    const m = MODES[rules.mode];
    ruleError.textContent =
      valid || custom[rules.mode] === ''
        ? ''
        : `Entrez un nombre entre ${m.range.min} et ${m.range.max}.`;
    const missing = MIN_PLAYERS - players.length;
    start.disabled = missing > 0 || !valid;
    start.textContent =
      missing > 0
        ? `Ajoutez encore ${missing} joueur${missing > 1 ? 's' : ''}`
        : !valid
          ? `Choisissez le nombre de ${m.unit}`
          : `Commencer la partie à ${players.length}`;
  }

  function renderRules(): void {
    const m = MODES[rules.mode];
    const raw = custom[rules.mode];
    modeHint.textContent = m.hint;
    values.setAttribute('aria-label', `Nombre de ${m.unit}`);
    values.innerHTML = [...m.presets.map(String), 'other']
      .map((v) => {
        const checked = v === 'other' ? raw !== null : raw === null && Number(v) === rules[m.key];
        return `
        <label class="segment">
          <input type="radio" name="value" value="${v}" ${checked ? 'checked' : ''} />
          <span>${v === 'other' ? 'Autre' : v}</span>
        </label>`;
      })
      .join('');
    customBox.hidden = raw === null;
    customInput.value = raw ?? '';
    customInput.placeholder = `${m.range.min} à ${m.range.max}`;
    root.querySelector('#custom-label')!.textContent = `Nombre de ${m.unit}`;
    root.querySelector('#custom-unit')!.textContent = m.unit;
    updateStart();
  }

  function renderList(): void {
    list.hidden = players.length === 0;
    list.innerHTML = players
      .map(
        (p, i) => `
        <li class="seat">
          <span class="seat-num">${i + 1}</span>
          <span class="seat-name">${esc(p)}</span>
          <span class="seat-actions">
            <button type="button" class="icon-btn" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter ${esc(p)}">▲</button>
            <button type="button" class="icon-btn" data-move="${i}" data-dir="1" ${i === players.length - 1 ? 'disabled' : ''} aria-label="Descendre ${esc(p)}">▼</button>
            <button type="button" class="icon-btn icon-remove" data-remove="${i}" aria-label="Retirer ${esc(p)}">✕</button>
          </span>
        </li>`,
      )
      .join('');
    const full = players.length >= MAX_PLAYERS;
    nameInput.disabled = full;
    form.querySelector('button')!.disabled = full;
    nameInput.placeholder = full ? `C'est complet (${MAX_PLAYERS} joueurs)` : 'Prénom';
    updateStart();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = validateNewPlayer(nameInput.value, players);
    error.textContent = err ?? '';
    if (err) return;
    players.push(normalizeName(nameInput.value));
    nameInput.value = '';
    renderList();
    if (!nameInput.disabled) nameInput.focus();
  });

  list.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn) return;
    if (btn.dataset.remove !== undefined) {
      players.splice(Number(btn.dataset.remove), 1);
    } else if (btn.dataset.move !== undefined) {
      const i = Number(btn.dataset.move);
      const j = i + Number(btn.dataset.dir);
      [players[i], players[j]] = [players[j], players[i]];
    }
    error.textContent = '';
    renderList();
  });

  root.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      rules.mode = radio.value as EndMode;
      renderRules();
    }),
  );

  values.addEventListener('change', (e) => {
    const radio = e.target as HTMLInputElement;
    if (radio.value === 'other') {
      custom[rules.mode] = custom[rules.mode] ?? '';
      renderRules();
      customInput.focus();
    } else {
      custom[rules.mode] = null;
      rules[MODES[rules.mode].key] = Number(radio.value);
      renderRules();
    }
  });

  customInput.addEventListener('input', () => {
    const digits = customInput.value.replace(/\D/g, '');
    if (digits !== customInput.value) customInput.value = digits;
    custom[rules.mode] = digits;
    updateStart();
  });

  customInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') customInput.blur();
  });

  start.addEventListener('click', () => {
    const value = ruleValue();
    if (value === null) return;
    // Un prénom tapé mais pas encore ajouté : on l'ajoute plutôt que de le perdre.
    if (nameInput.value.trim() && !validateNewPlayer(nameInput.value, players)) {
      players.push(normalizeName(nameInput.value));
    }
    const game = createGame(players, { ...rules, [MODES[rules.mode].key]: value });
    saveWarning(upsertGame(game));
    navigate(`#/game/${encodeURIComponent(game.id)}`);
  });

  renderList();
  renderRules();
}
