import {
  type Game,
  createGame,
  currentRoundIndex,
  isDoubled,
  isRoundComplete,
  isRoundEmpty,
  leaders,
  losers,
  missingPlayers,
  overLimit,
  parseScore,
  ranking,
  roundPoints,
  setCloser,
  setScore,
  starterIndex,
  totals,
  winners,
} from '../game';
import { getGame, upsertGame } from '../storage';
import { esc, navigate, saveWarning } from '../ui';

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** Affiche un vrai signe moins (−) plutôt qu'un tiret. */
function fmt(n: number): string {
  return n < 0 ? `−${-n}` : String(n);
}

/** Garde un éventuel signe moins en tête, puis uniquement des chiffres. */
function cleanInput(v: string): string {
  const neg = /^\s*[-−]/.test(v);
  return (neg ? '-' : '') + v.replace(/\D/g, '');
}

export function renderScoresheet(root: HTMLElement, id: string): void {
  const loaded = getGame(id);
  if (!loaded) {
    root.innerHTML = `
      <main class="page">
        <a href="#/" class="back">‹ Accueil</a>
        <div class="paper empty-state">
          <h1>Partie introuvable</h1>
          <p>Elle a peut-être été supprimée.</p>
          <a class="btn btn-sun" href="#/">Retour à l'accueil</a>
        </div>
      </main>`;
    return;
  }
  let game: Game = loaded;
  // Manche affichée (-1 = classement final). Elle reste figée pendant la saisie :
  // on ne passe à la suivante qu'en appuyant sur « Valider la manche ».
  let shown = game.finished ? -1 : currentRoundIndex(game);
  // true quand on corrige une manche déjà validée.
  let correcting = false;
  let dealAnimation = false;

  function save(): void {
    saveWarning(upsertGame(game));
  }

  // ---------- Gabarits ----------

  const byPoints = game.mode === 'points';
  // Au-delà, les cases de la barre d'avancement deviendraient trop petites.
  const showProgress = !byPoints && game.maxRounds <= 20;

  /** Joueurs à mettre en rouge : au-delà de la limite, ou derniers d'une partie en manches finie. */
  function badPlayers(): Set<number> {
    return new Set(byPoints ? overLimit(game) : game.finished ? losers(game) : []);
  }

  function progressHtml(active: number): string {
    if (!showProgress) return '';
    return `<ol class="progress" aria-label="Avancement de la partie">${Array.from(
      { length: game.maxRounds },
      (_, r) => {
        const done = r < game.rounds.length && isRoundComplete(game.rounds[r]);
        const cls = `${r === active ? 'is-active' : ''} ${done ? 'is-done' : ''}`;
        return `<li class="${cls}" aria-label="Manche ${r + 1}${done ? ', jouée' : ''}">${r + 1}</li>`;
      },
    ).join('')}</ol>`;
  }

  function roundSubtitle(r: number): string {
    if (byPoints) return `Partie en ${game.limit} points`;
    return r === game.maxRounds - 1 ? `Dernière manche sur ${game.maxRounds} !` : `sur ${game.maxRounds}`;
  }

  function gaugeWidth(total: number): string {
    return `${Math.max(0, Math.min(1, total / game.limit)) * 100}%`;
  }

  function doubleText(r: number, p: number): string {
    const round = game.rounds[r];
    if (round.closer !== p || !isDoubled(round)) return '';
    return `×2 = ${fmt(roundPoints(round)[p] ?? 0)}`;
  }

  function roundHtml(r: number): string {
    const round = game.rounds[r];
    const t = totals(game);
    const starter = starterIndex(game, r);
    const entries = game.players
      .map((p, i) => {
        const isCloser = round.closer === i;
        const dbl = doubleText(r, i);
        return `
        <li class="entry ${isCloser ? 'is-closer' : ''}" data-entry="${i}">
          <label class="entry-who" for="score-${i}">
            <span class="entry-name">${esc(p)}</span>
            <span class="entry-total">Total : <b data-total="${i}">${fmt(t[i])}</b>${byPoints ? ` / ${game.limit}` : ''}</span>
            ${
              byPoints
                ? `<span class="gauge" aria-hidden="true"><span data-gauge="${i}" class="${t[i] >= game.limit * 0.75 ? 'is-hot' : ''}" style="width:${gaugeWidth(t[i])}"></span></span>`
                : ''
            }
          </label>
          <div class="entry-tools">
            <button type="button" class="btn-closer" data-closer="${i}" aria-pressed="${isCloser}">A fini</button>
            <span class="double-tag" data-double="${i}" ${dbl ? '' : 'hidden'}>${dbl}</span>
          </div>
          <div class="entry-score">
            <button type="button" class="btn-sign" data-sign="${i}" aria-label="Score négatif pour ${esc(p)}">±</button>
            <input id="score-${i}" class="entry-input" type="text" inputmode="numeric"
              maxlength="4" autocomplete="off" enterkeyhint="next" data-p="${i}"
              value="${round.scores[i] ?? ''}" placeholder="–" />
          </div>
        </li>`;
      })
      .join('');

    return `
      ${progressHtml(r)}
      <section class="round" aria-labelledby="round-title">
        <div class="round-head">
          <div class="round-card ${dealAnimation ? 'is-dealt' : ''}" aria-hidden="true">
            <span class="corner tl">${r + 1}</span>
            <span class="face">${r + 1}</span>
            <span class="corner br">${r + 1}</span>
          </div>
          <div class="round-text">
            <h1 id="round-title">Manche ${r + 1}</h1>
            <p>${roundSubtitle(r)}</p>
            <p class="starter-line">${
              starter === null
                ? 'Chacun retourne 2 cartes : la plus grosse somme commence.'
                : `<span><b>${esc(game.players[starter])}</b> commence</span>`
            }</p>
          </div>
        </div>
        ${correcting ? `<p class="note">Vous corrigez une manche déjà jouée.</p>` : ''}
        <div class="paper">
          <p class="paper-hint">Points de la manche. « A fini » : qui a tout retourné en premier. Sans le plus petit score, ses points sont doublés.</p>
          <ol class="entries">${entries}</ol>
        </div>
        <p class="missing" id="missing" aria-live="polite"></p>
        <button type="button" class="btn btn-sun btn-big" id="validate">
          ${correcting ? 'Enregistrer la correction' : 'Valider la manche'}
        </button>
        ${correcting ? `<button type="button" class="btn btn-quiet" id="cancel-edit">Revenir à la manche en cours</button>` : ''}
      </section>`;
  }

  function endHtml(): string {
    const w = winners(game);
    const over = overLimit(game).map((i) => game.players[i]);
    const lost = losers(game).map((i) => game.players[i]);
    const bad = badPlayers();
    const played = game.rounds.length;
    const how = byPoints
      ? `${esc(listNames(over))} ${over.length > 1 ? 'ont' : 'a'} atteint ${game.limit} points en ${played} manche${played > 1 ? 's' : ''}.`
      : `Les ${played} manche${played > 1 ? 's sont jouées' : ' est jouée'}.`;
    const loserLine =
      lost.length && lost.length < game.players.length
        ? ` ${esc(listNames(lost))} ${lost.length > 1 ? 'perdent' : 'perd'} avec ${fmt(totals(game)[losers(game)[0]])} points.`
        : '';
    const rows = ranking(game)
      .map(
        (e) => `
        <li class="rank-row ${e.rank === 1 ? 'is-winner' : ''} ${bad.has(e.index) ? 'is-over' : ''}">
          <span class="rank-pos">${e.rank === 1 ? '★' : e.rank}</span>
          <span class="rank-name">${esc(e.player)}</span>
          <span class="rank-total">${fmt(e.total)} pts</span>
        </li>`,
      )
      .join('');
    return `
      ${progressHtml(-1)}
      <section class="end">
        <div class="brand-cards" aria-hidden="true">
          <span class="v-neg">−2</span><span class="v-zero">0</span><span class="v-high">12</span>
        </div>
        <h1>${w.length > 1 ? `Égalité entre ${esc(listNames(w))} !` : `Bravo ${esc(w[0])} !`}</h1>
        <p class="end-sub">${how}${loserLine} Le plus petit score gagne.</p>
        <ol class="paper ranking">${rows}</ol>
        <button type="button" class="btn btn-sun btn-big" id="replay">Rejouer avec les mêmes joueurs</button>
        <a class="btn btn-quiet" href="#/">Retour à l'accueil</a>
      </section>`;
  }

  function tableHtml(active: number): string {
    const lead = new Set(leaders(game));
    const bad = badPlayers();
    const t = totals(game);
    const head = game.players
      .map((p, i) => `<th scope="col" class="${lead.has(i) ? 'is-leader' : ''}"><span>${esc(p)}</span></th>`)
      .join('');
    const body = game.rounds
      .map((round, r) => {
        // La manche suivante, encore vide, n'apparaît qu'une fois affichée.
        if (r !== active && isRoundEmpty(round)) return '';
        const points = roundPoints(round);
        const doubled = isDoubled(round);
        const cells = points
          .map((s, p) => {
            const cls = [
              p === round.closer ? 'is-closer' : '',
              p === round.closer && doubled ? 'is-doubled' : '',
            ].join(' ');
            return `<td class="${cls}">${s === null ? '' : fmt(s)}${p === round.closer && doubled ? '<small>×2</small>' : ''}</td>`;
          })
          .join('');
        return `
          <tr data-row="${r}" class="${r === active ? 'is-active' : ''}"
            tabindex="0" aria-label="Manche ${r + 1} : toucher pour modifier">
            <th scope="row">${r + 1}</th>${cells}
          </tr>`;
      })
      .join('');
    return `
      <table class="sheet">
        <thead><tr><th scope="col">Manche</th>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th scope="row">Total</th>${t
          .map(
            (v, i) =>
              `<td class="${lead.has(i) ? 'is-leader' : ''} ${bad.has(i) ? 'is-over' : ''}">${fmt(v)}</td>`,
          )
          .join('')}</tr></tfoot>
      </table>`;
  }

  // ---------- Rendu ----------

  function render(): void {
    const r = shown;
    root.innerHTML = `
      <main class="page">
        <a href="#/" class="back">‹ Accueil</a>
        ${r === -1 ? endHtml() : roundHtml(r)}
        <section class="sheet-section" aria-labelledby="sheet-title">
          <h2 id="sheet-title">Feuille de score</h2>
          <p class="sheet-hint">Touchez une ligne pour corriger une manche. <span class="dot" aria-hidden="true"></span> = a fini la manche.</p>
          <div class="table-wrap" id="table-wrap">${tableHtml(r)}</div>
        </section>
        <p id="save-warning" class="warn" hidden>Attention : ce téléphone n'enregistre pas les scores. Ils seront perdus si la page se ferme.</p>
      </main>`;
    dealAnimation = false;
    bind(r);
    updateValidate();
  }

  /** Mise à jour légère pendant la saisie (sans reconstruire les champs, pour garder le clavier ouvert). */
  function refresh(): void {
    const t = totals(game);
    const r = shown;
    root.querySelectorAll<HTMLElement>('[data-total]').forEach((el) => {
      el.textContent = fmt(t[Number(el.dataset.total)]);
    });
    root.querySelectorAll<HTMLElement>('[data-gauge]').forEach((el) => {
      const v = t[Number(el.dataset.gauge)];
      el.style.width = gaugeWidth(v);
      el.classList.toggle('is-hot', v >= game.limit * 0.75);
    });
    if (r !== -1) {
      const closer = game.rounds[r].closer;
      root.querySelectorAll<HTMLElement>('[data-entry]').forEach((el) => {
        el.classList.toggle('is-closer', Number(el.dataset.entry) === closer);
      });
      root.querySelectorAll<HTMLElement>('[data-closer]').forEach((el) => {
        el.setAttribute('aria-pressed', String(Number(el.dataset.closer) === closer));
      });
      root.querySelectorAll<HTMLElement>('[data-double]').forEach((el) => {
        const text = doubleText(r, Number(el.dataset.double));
        el.textContent = text;
        el.hidden = !text;
      });
    }
    root.querySelectorAll<HTMLElement>('.progress li').forEach((el, k) => {
      el.classList.toggle('is-done', k < game.rounds.length && isRoundComplete(game.rounds[k]));
    });
    root.querySelector('#table-wrap')!.innerHTML = tableHtml(r);
    bindTable();
    updateValidate();
  }

  function updateValidate(): void {
    const btn = root.querySelector<HTMLButtonElement>('#validate');
    const msg = root.querySelector<HTMLElement>('#missing');
    const r = shown;
    if (!btn || !msg || r === -1) return;
    const round = game.rounds[r];
    const missing = missingPlayers(round).map((i) => game.players[i]);
    btn.disabled = !isRoundComplete(round);
    msg.textContent = [
      missing.length ? `Il manque les points de ${listNames(missing)}.` : '',
      round.closer === null ? 'Indiquez qui a fini la manche.' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  function setCell(p: number, value: number | null): void {
    game = setScore(game, shown, p, value);
    save();
    refresh();
  }

  function openRow(tr: HTMLElement): void {
    const row = Number(tr.dataset.row);
    if (row === shown) return;
    correcting = row !== currentRoundIndex(game);
    shown = row;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindTable(): void {
    root.querySelectorAll<HTMLTableRowElement>('.sheet tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => openRow(tr));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openRow(tr);
        }
      });
    });
  }

  function bind(r: number): void {
    const inputs = [...root.querySelectorAll<HTMLInputElement>('.entry-input')];

    inputs.forEach((input, k) => {
      input.addEventListener('input', () => {
        const clean = cleanInput(input.value);
        if (clean !== input.value) input.value = clean;
        setCell(Number(input.dataset.p), parseScore(clean));
      });
      input.addEventListener('focus', () => input.select());
      // Entrée : passe au prochain joueur sans score.
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const next = inputs.slice(k + 1).find((i) => i.value === '') ?? inputs[k + 1];
        if (next) next.focus();
        else input.blur();
      });
    });

    // ± : les claviers numériques des téléphones n'ont pas toujours de signe moins.
    root.querySelectorAll<HTMLButtonElement>('[data-sign]').forEach((btn) => {
      // Garde le focus (et le clavier) sur le champ en cours de saisie.
      btn.addEventListener('pointerdown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.sign);
        const input = inputs[p];
        input.value = input.value.startsWith('-') ? input.value.slice(1) : `-${input.value}`;
        setCell(p, parseScore(input.value));
        if (document.activeElement !== input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-closer]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const p = Number(btn.dataset.closer);
        game = setCloser(game, r, game.rounds[r].closer === p ? null : p);
        save();
        refresh();
      }),
    );

    root.querySelector('#validate')?.addEventListener('click', () => {
      if (!isRoundComplete(game.rounds[r])) return;
      shown = game.finished ? -1 : currentRoundIndex(game);
      dealAnimation = !correcting && shown !== -1;
      correcting = false;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    root.querySelector('#cancel-edit')?.addEventListener('click', () => {
      shown = game.finished ? -1 : currentRoundIndex(game);
      correcting = false;
      render();
      window.scrollTo({ top: 0 });
    });

    root.querySelector('#replay')?.addEventListener('click', () => {
      const next = createGame(game.players, {
        mode: game.mode,
        limit: game.limit,
        maxRounds: game.maxRounds,
      });
      saveWarning(upsertGame(next));
      navigate(`#/game/${encodeURIComponent(next.id)}`);
    });

    bindTable();
  }

  render();
}
