/**
 * Tela de zeramento ("game completed") exibida ao passar da última fase.
 *  - Selo de desempenho (S/A/B/C/D/E) pelo tempo total da partida
 *  - Placar: tempo total, tentativas, fases de primeira, recorde pessoal (salvo no aparelho)
 *  - Tabela por fase, curiosidades (batidas por tipo, buzinadas, engates)
 *  - Compartilhar resultado e "Play again" com confirmação
 * Todo o DOM é montado com createElement/textContent (nunca com HTML em string).
 */

const BEST_KEY = 'kotr_best_run_v1';

// Selos: tempo total máximo (ms) para cada nota; E = completou, qualquer tempo
const GRADES = [
    { grade: 'S', maxMs: 160 * 1000, title: 'King of The Road' },
    { grade: 'A', maxMs: 220 * 1000, title: 'Pro Trucker' },
    { grade: 'B', maxMs: 300 * 1000, title: 'Seasoned Driver' },
    { grade: 'C', maxMs: 600 * 1000, title: 'Licensed Driver' },
    { grade: 'D', maxMs: 1200 * 1000, title: 'Rookie Hauler' },
    { grade: 'E', maxMs: Infinity, title: 'Road Survivor' }
];

export function gradeFor(totalMs) {
    return GRADES.find((g) => totalMs <= g.maxMs) || GRADES[GRADES.length - 1];
}

function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined && text !== null) e.textContent = String(text);
    return e;
}

function loadBest() {
    try {
        const raw = window.localStorage.getItem(BEST_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        if (!v || typeof v.timeMs !== 'number' || typeof v.attempts !== 'number') return null;
        return { timeMs: v.timeMs, attempts: v.attempts, grade: String(v.grade || '').slice(0, 1) };
    } catch (_err) {
        return null;
    }
}

function saveBest(best) {
    try {
        window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
    } catch (_err) {
        // Armazenamento indisponível (modo privado etc.): ignora
    }
}

export class VictoryScreen {
    constructor({ onPlayAgain, getEngineSound } = {}) {
        this.onPlayAgain = onPlayAgain;
        this.getEngineSound = getEngineSound;
        this.root = null;
        this._timers = [];
    }

    _clearTimers() {
        this._timers.forEach((t) => clearTimeout(t));
        this._timers = [];
    }

    hide() {
        this._clearTimers();
        if (this.root) {
            this.root.remove();
            this.root = null;
        }
    }

    show(summary) {
        this.hide();
        const g = gradeFor(summary.totalMs);

        // Recorde pessoal: menor tempo; empate -> menos tentativas
        const prevBest = loadBest();
        const isNewBest = !prevBest ||
            summary.totalMs < prevBest.timeMs ||
            (summary.totalMs === prevBest.timeMs && summary.totalAttempts < prevBest.attempts);
        const best = isNewBest
            ? { timeMs: summary.totalMs, attempts: summary.totalAttempts, grade: g.grade }
            : prevBest;
        if (isNewBest) saveBest(best);

        const root = el('div', 'victory-overlay');
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Game completed');
        ['mousedown', 'mousemove', 'mouseup', 'wheel', 'touchstart', 'touchmove', 'touchend', 'pointerdown'].forEach((evt) => {
            root.addEventListener(evt, (e) => e.stopPropagation(), { passive: true });
        });

        const card = el('div', 'victory-card');
        card.appendChild(el('div', 'victory-stripe'));

        const header = el('div', 'victory-header');
        header.appendChild(el('div', 'victory-crown', '👑'));
        header.appendChild(el('h1', 'victory-title', 'KING OF THE ROAD'));
        header.appendChild(el('p', 'victory-subtitle', 'You beat the game!'));
        card.appendChild(header);

        // Selo de desempenho
        const gradeWrap = el('div', 'victory-grade-wrap');
        const stamp = el('div', `victory-grade grade-${g.grade.toLowerCase()}`);
        stamp.appendChild(el('span', 'victory-grade-letter', g.grade));
        gradeWrap.appendChild(stamp);
        const gradeText = el('div', 'victory-grade-text');
        gradeText.appendChild(el('div', 'victory-grade-label', 'Rank'));
        gradeText.appendChild(el('div', 'victory-grade-title', g.title));
        gradeWrap.appendChild(gradeText);
        card.appendChild(gradeWrap);

        // Placar geral
        const statsGrid = el('div', 'victory-stats');
        const addStat = (icon, label, valueEl, extraClass = '') => {
            const box = el('div', `victory-stat ${extraClass}`.trim());
            box.appendChild(el('div', 'victory-stat-label', `${icon} ${label}`));
            box.appendChild(valueEl);
            statsGrid.appendChild(box);
            return box;
        };
        const timeVal = el('div', 'victory-stat-value', '00:00');
        addStat('⏱', 'Total time', timeVal);
        const attemptsVal = el('div', 'victory-stat-value', '0');
        addStat('🔁', 'Attempts', attemptsVal);
        addStat('✅', 'First try', el('div', 'victory-stat-value', `${summary.firstTry} / ${summary.numLevels}`));
        const bestBox = addStat('🏆', 'Personal best', el('div', 'victory-stat-value', formatTime(best.timeMs)));
        if (isNewBest) {
            bestBox.classList.add('is-new-best');
            bestBox.appendChild(el('div', 'victory-new-best', 'NEW RECORD!'));
        } else {
            bestBox.appendChild(el('div', 'victory-stat-sub', `${best.attempts} attempts`));
        }
        card.appendChild(statsGrid);

        // Tabela por fase
        const table = el('table', 'victory-table');
        const thead = el('thead');
        const hr = el('tr');
        ['Level', 'Time', 'Attempts'].forEach((h) => hr.appendChild(el('th', null, h)));
        thead.appendChild(hr);
        table.appendChild(thead);
        const tbody = el('tbody');
        summary.levels.forEach((l) => {
            const tr = el('tr', l.attempts === 1 ? 'is-first-try' : '');
            const tdName = el('td', 'victory-level-name');
            tdName.appendChild(el('span', 'victory-level-num', l.level));
            tdName.appendChild(el('span', null, l.title));
            tr.appendChild(tdName);
            tr.appendChild(el('td', null, formatTime(l.timeMs)));
            const tdAtt = el('td', null, l.attempts === 1 ? '1 ✔' : l.attempts);
            tr.appendChild(tdAtt);
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        card.appendChild(table);

        // Curiosidades (recolhíveis no celular)
        const facts = el('details', 'victory-facts');
        if (!document.body.classList.contains('is-mobile')) facts.open = true;
        facts.appendChild(el('summary', null, 'Fun facts'));
        const factsList = el('ul', 'victory-facts-list');
        const c = summary.crashes;
        const totalCrashes = c.cone + c.wall + c.warehouse + c.trailer + c.other;
        [
            ['💥', 'Crashes', totalCrashes === 0 ? 'none — flawless!' :
                `${totalCrashes} (cones ${c.cone} · walls ${c.wall} · warehouse ${c.warehouse} · trailer ${c.trailer})`],
            ['📯', 'Horn honks', summary.horns],
            ['🔗', 'Trailer hitches', summary.hitches]
        ].forEach(([icon, label, value]) => {
            const li = el('li');
            li.appendChild(el('span', 'victory-fact-label', `${icon} ${label}`));
            li.appendChild(el('span', 'victory-fact-value', value));
            factsList.appendChild(li);
        });
        facts.appendChild(factsList);
        card.appendChild(facts);

        // Botões
        const actions = el('div', 'victory-actions');
        const playBtn = el('button', 'victory-btn victory-btn-primary', '▶ Play again');
        playBtn.type = 'button';
        const shareBtn = el('button', 'victory-btn victory-btn-secondary', '📤 Share result');
        shareBtn.type = 'button';
        actions.appendChild(playBtn);
        actions.appendChild(shareBtn);
        card.appendChild(actions);
        const toast = el('div', 'victory-toast');
        card.appendChild(toast);

        root.appendChild(card);
        document.body.appendChild(root);
        this.root = root;

        // Animações: contagem do tempo/tentativas e carimbo do selo
        const animateNumber = (target, durationMs, render) => {
            const start = performance.now();
            const step = (now) => {
                if (!this.root) return;
                const t = Math.min(1, (now - start) / durationMs);
                const eased = 1 - Math.pow(1 - t, 3);
                render(target * eased);
                if (t < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };
        this._timers.push(setTimeout(() => {
            animateNumber(summary.totalMs, 1200, (v) => { timeVal.textContent = formatTime(v); });
            animateNumber(summary.totalAttempts, 900, (v) => { attemptsVal.textContent = String(Math.round(v)); });
        }, 250));
        this._timers.push(setTimeout(() => stamp.classList.add('is-stamped'), 1300));

        // Duas buzinadas comemorativas (respeitam o mudo; não contam nas estatísticas)
        const sound = typeof this.getEngineSound === 'function' ? this.getEngineSound() : null;
        if (sound && typeof sound.setHorn === 'function') {
            // depois do fim do áudio "victory" (~3 s), para não se sobreporem
            [[3250, true], [3500, false], [3700, true], [4200, false]].forEach(([t, on]) => {
                this._timers.push(setTimeout(() => sound.setHorn(on), t));
            });
        }

        // Compartilhar
        const shareText = `I beat King of The Road in ${formatTime(summary.totalMs)} with ` +
            `${summary.totalAttempts} attempts — Rank ${g.grade} (${g.title}) 👑🚛`;
        const showToast = (msg) => {
            toast.textContent = msg;
            toast.classList.add('is-visible');
            this._timers.push(setTimeout(() => toast.classList.remove('is-visible'), 1800));
        };
        shareBtn.addEventListener('click', async () => {
            const url = window.location.origin + window.location.pathname;
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'King of The Road', text: shareText, url });
                    return;
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(`${shareText}\n${url}`);
                    showToast('Copied to clipboard!');
                    return;
                }
                showToast('Sharing is not available on this device');
            } catch (_err) {
                // Usuário cancelou o compartilhamento: nada a fazer
            }
        });

        // Play again com confirmação (modal próprio, sem diálogos nativos do navegador)
        playBtn.addEventListener('click', () => this._confirmPlayAgain());
        this._timers.push(setTimeout(() => playBtn.focus({ preventScroll: true }), 400));
    }

    _confirmPlayAgain() {
        // Anexado ao overlay (tela cheia), e não ao cartão rolável, para ficar sempre visível no centro da tela
        const host = this.root;
        if (!host || host.querySelector('.victory-confirm')) return;
        const backdrop = el('div', 'victory-confirm');
        const box = el('div', 'victory-confirm-box');
        box.appendChild(el('h2', 'victory-confirm-title', 'Start a new game?'));
        box.appendChild(el('p', 'victory-confirm-text', 'You will go back to Level 1 and this run’s results will be cleared. Your personal best is kept.'));
        const row = el('div', 'victory-confirm-actions');
        const cancel = el('button', 'victory-btn victory-btn-secondary', 'Cancel');
        cancel.type = 'button';
        const ok = el('button', 'victory-btn victory-btn-primary', 'Play again');
        ok.type = 'button';
        row.appendChild(cancel);
        row.appendChild(ok);
        box.appendChild(row);
        backdrop.appendChild(box);
        host.appendChild(backdrop);
        ok.focus({ preventScroll: true });
        cancel.addEventListener('click', () => backdrop.remove());
        ok.addEventListener('click', () => {
            this.hide();
            if (typeof this.onPlayAgain === 'function') this.onPlayAgain();
        });
    }
}
