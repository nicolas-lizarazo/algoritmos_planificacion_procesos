/* ═══════════════════════════════════════════════════════
   MAIN · Orquestador de la UI con metáfora de plantas
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ALGOS_SCHED = ['FCFS', 'SJF', 'SRTF', 'RR', 'PRIORITY'];
  const MEM_CHAIN = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  const MEM_FRAMES = 3;

  const state = {
    processes: [
      { pid: 'P1', arrival: 0, burst: 5, priority: 2 },
      { pid: 'P2', arrival: 0, burst: 4, priority: 1 },
      { pid: 'P3', arrival: 2, burst: 3, priority: 3 },
      { pid: 'P4', arrival: 4, burst: 6, priority: 2 }
    ],
    quantum: 2,
    clock: 0,
    speed: 5,
    running: false,
    mode: 'scheduling',   // 'scheduling' | 'memory'
    results: null,
    timerId: null,
    garden: {}            // garden[algo][pid] = { remaining, total, done, arrival }
  };

  /* ═══ NARRADOR ═══ */
  function narrate(text) {
    const el = $('#narrator-text');
    if (el) el.textContent = text;
  }

  /* ═══ LISTA DE PROCESOS ═══ */
  function renderProcessList() {
    const list = $('#process-list');
    list.innerHTML = '';
    const tpl = $('#process-row-template');
    state.processes.forEach((p, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('.pid-badge').textContent = p.pid;
      node.querySelector('[data-role="arrival"]').value = p.arrival;
      node.querySelector('[data-role="burst"]').value = p.burst;
      node.querySelector('[data-role="priority"]').value = p.priority;

      const bind = (role, key) => {
        node.querySelector(`[data-role="${role}"]`).oninput = (e) => {
          p[key] = +e.target.value;
          softReset();
        };
      };
      bind('arrival', 'arrival');
      bind('burst', 'burst');
      bind('priority', 'priority');

      node.querySelector('[data-role="remove"]').onclick = () => {
        state.processes.splice(i, 1);
        renderProcessList();
        softReset();
      };
      list.appendChild(node);
    });
  }

  function nextPid() {
    const used = new Set(state.processes.map(p => p.pid));
    let i = 1;
    while (used.has('P' + i)) i++;
    return 'P' + i;
  }

  /* ═══ BOTONES DE CONFIGURACIÓN ═══ */
  $('#btn-add').onclick = () => {
    if (state.processes.length >= 8) return;
    state.processes.push({ pid: nextPid(), arrival: 0, burst: 5, priority: 1 });
    renderProcessList();
    softReset();
  };

  $('#btn-random').onclick = () => {
    state.processes = Array.from({ length: 4 }, (_, i) => ({
      pid: 'P' + (i + 1),
      arrival: Math.floor(Math.random() * 6),
      burst: Math.floor(Math.random() * 8) + 1,
      priority: Math.floor(Math.random() * 5) + 1
    }));
    renderProcessList();
    softReset();
    narrate('Se generaron 4 plantas al azar. Pulsa «Regar» para simular.');
  };

  $('#btn-scenario').onclick = () => {
    state.processes = [
      { pid: 'P1', arrival: 0, burst: 5, priority: 2 },
      { pid: 'P2', arrival: 1, burst: 3, priority: 1 },
      { pid: 'P3', arrival: 2, burst: 8, priority: 4 },
      { pid: 'P4', arrival: 3, burst: 2, priority: 3 }
    ];
    renderProcessList();
    softReset();
    narrate('Escenario clásico cargado. Compáralo entre los 5 algoritmos.');
  };

  $('#quantum').oninput = (e) => {
    state.quantum = Math.max(1, +e.target.value || 1);
    softReset();
  };

  $('#speed').oninput = (e) => {
    state.speed = +e.target.value;
    if (state.running && state.timerId) {
      clearInterval(state.timerId);
      startTicker();
    }
  };

  /* ═══ RENDER DE JARDÍN ═══ */
  function renderGarden(algo) {
    const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
    if (!card) return;
    const box = card.querySelector('[data-role="plants"]');
    if (!box) return;
    box.innerHTML = '';
    const tpl = $('#plant-template');
    const procs = state.results[algo].processes
      .slice()
      .sort((a, b) => a.pid.localeCompare(b.pid));

    for (const p of procs) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.pid = p.pid;
      node.dataset.arrival = p.arrival;   // ← guardamos arrival en el DOM
      node.querySelector('.plant-label').textContent = p.pid;
      node.querySelector('.thirst-fill').style.width = '100%';
      // NO añadimos .is-visible aquí: nace oculta
      box.appendChild(node);
    }
  }

  function initGardenState(algo) {
    state.garden[algo] = {};
    for (const p of state.results[algo].processes) {
      state.garden[algo][p.pid] = {
        remaining: p.burst,
        total: p.burst,
        done: false,
        arrival: p.arrival,
        visible: false,
      };
    }
  }

  function revealArrivedPlants(algo) {
  const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
  if (!card) return;
  const g = state.garden[algo];
  if (!g) return;
  const now = state.clock;   // tiempo actual de simulación

  card.querySelectorAll('.plant').forEach(plant => {
    const pid = plant.dataset.pid;
    const info = g[pid];
    if (!info || info.visible) return;
    if (info.arrival <= now) {
      info.visible = true;
      plant.classList.add('is-visible', 'is-sprouting');
      setTimeout(() => plant.classList.remove('is-sprouting'), 700);
    }
  });
}

  /* ═══ TICK (avanza 1 unidad de tiempo) ═══ */
  function tick() {
    state.clock++;
    $('#clock-value').textContent = 'T+' + String(state.clock).padStart(3, '0');
    for (const algo of ALGOS_SCHED) revealArrivedPlants(algo);

    let anyRunning = false;

    for (const algo of ALGOS_SCHED) {
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (!card) continue;
      const result = state.results[algo];
      if (!result) continue;

      const tStart = state.clock - 1;
      const tEnd = state.clock;
      const seg = result.timeline.find(s => s.start <= tStart && s.end >= tEnd)
        || result.timeline.find(s => s.start === tStart);
      const activePid = seg ? seg.pid : null;

      const plants = card.querySelectorAll('.plant');
      plants.forEach(plant => {
        const pid = plant.dataset.pid;
        const g = state.garden[algo][pid];
        const active = pid === activePid;
        plant.classList.toggle('is-watering', active);

        if (active && g.remaining > 0) {
          g.remaining--;
          const pct = (g.remaining / g.total) * 100;
          plant.querySelector('.thirst-fill').style.width = pct + '%';
          if (g.remaining === 0) {
            g.done = true;
            plant.classList.remove('is-watering');
            plant.classList.add('is-done');
          }
        }
      });

      // Regadera
      const can = card.querySelector('[data-role="can"]');
      if (can && activePid) {
        const target = card.querySelector(`.plant[data-pid="${activePid}"]`);
        const scene = card.querySelector('.garden-scene');
        if (target && scene) {
          const tRect = target.getBoundingClientRect();
          const sRect = scene.getBoundingClientRect();
          can.style.left = (tRect.left - sRect.left + tRect.width / 2 - 16) + 'px';
          can.classList.add('is-pouring');
        }
      } else if (can) {
        can.classList.remove('is-pouring');
      }

      // Métricas parciales
      let wtSum = 0, tatSum = 0, done = 0;
      for (const p of result.processes) {
        const g = state.garden[algo][p.pid];
        if (!g.done) continue;
        const finish = result.timeline
          .filter(s => s.pid === p.pid)
          .reduce((a, s) => Math.max(a, s.end), 0);
        const tat = finish - p.arrival;
        wtSum += tat - p.burst;
        tatSum += tat;
        done++;
      }
      card.querySelector('[data-role="wt"]').textContent = done ? (wtSum / done).toFixed(1) : '0.0';
      card.querySelector('[data-role="tat"]').textContent = done ? (tatSum / done).toFixed(1) : '0.0';
      card.querySelector('[data-role="cs"]').textContent = result.contextSwitches;
      card.querySelector('[data-role="cpu"]').textContent = result.cpuUsage + '%';

      const totalRem = Object.values(state.garden[algo]).reduce((a, g) => a + g.remaining, 0);
      if (totalRem > 0) anyRunning = true;
      else {
        card.classList.remove('is-running');
        card.classList.add('is-done');
        card.querySelector('[data-role="state"]').textContent = 'Terminado';
      }
    }

    // Tabla comparativa en vivo
    renderMetricsTable();

    if (!anyRunning) {
      state.running = false;
      if (state.timerId) clearInterval(state.timerId);
      state.timerId = null;
      $('#btn-run').disabled = false;
      $('#btn-pause').disabled = true;
      narrate('¡Listo! Todas las plantas florecieron. 🌸');
    }
  }

  function startTicker() {
    const delay = Math.max(120, 1100 - state.speed * 100);
    state.timerId = setInterval(tick, delay);
  }

  /* ═══ TABLA DE MÉTRICAS ═══ */
  function renderMetricsTable() {
    const body = $('#metrics-body');
    if (!body || !state.results) return;
    body.innerHTML = '';
    for (const algo of ALGOS_SCHED) {
      const r = state.results[algo];
      if (!r) continue;
      const tr = document.createElement('tr');
      const label = algo === 'PRIORITY' ? 'Prioridades' : algo;
      tr.innerHTML = `
        <td>${label}</td>
        <td>${r.avgWT.toFixed(2)}</td>
        <td>${r.avgTAT.toFixed(2)}</td>
        <td>${r.cpuUsage}%</td>
        <td>${r.contextSwitches}</td>
      `;
      body.appendChild(tr);
    }
  }

  /* ═══ PREPARAR / RESET ═══ */
  function prepareRun() {
    state.results = {
      FCFS: Algorithms.runFCFS(state.processes),
      SJF: Algorithms.runSJF(state.processes),
      SRTF: Algorithms.runSRTF(state.processes),
      RR: Algorithms.runRR(state.processes, state.quantum),
      PRIORITY: Algorithms.runPriority(state.processes)
    };
    for (const algo of ALGOS_SCHED) {
      narrate('La regadera ya se está moviendo entre las macetas...');
      renderGarden(algo);
      initGardenState(algo);
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (card) {
        card.classList.add('is-running');
        card.classList.remove('is-done');
        card.querySelector('[data-role="state"]').textContent = 'Regando';
      }
    }
    renderMetricsTable();
  }

  function softReset() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.running = false;
    state.results = null;
    state.clock = 0;
    state.garden = {};
    $('#clock-value').textContent = 'T+000';
    $('#btn-run').disabled = false;
    $('#btn-pause').disabled = true;
    for (const algo of ALGOS_SCHED) {
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (!card) continue;
      card.classList.remove('is-running', 'is-done');
      card.querySelector('[data-role="state"]').textContent = 'En espera';
      const box = card.querySelector('[data-role="plants"]');
      if (box) box.innerHTML = '';
      card.querySelector('[data-role="wt"]').textContent = '0.0';
      card.querySelector('[data-role="tat"]').textContent = '0.0';
      card.querySelector('[data-role="cpu"]').textContent = '0%';
      card.querySelector('[data-role="cs"]').textContent = '0';
    }
    const body = $('#metrics-body');
    if (body) body.innerHTML = '';
  }

  /* ═══ TRANSPORTE ═══ */
  $('#btn-run').onclick = () => {
    if (state.mode === 'memory') return; // memoria tiene su propio flujo
    if (!state.results) prepareRun();
    state.running = true;
    $('#btn-run').disabled = true;
    $('#btn-pause').disabled = false;
    if (state.timerId) clearInterval(state.timerId);
    startTicker();
  };

  $('#btn-pause').onclick = () => {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.running = false;
    $('#btn-run').disabled = false;
    $('#btn-pause').disabled = true;
    narrate('Simulación pausada. Pulsa «Regar» para continuar.');
  };

  $('#btn-step').onclick = () => {
    if (state.mode === 'memory') { memStep(); return; }
    if (!state.results) prepareRun();
    tick();
    narrate('Tick manual: T+' + state.clock + '. Pulsa «Paso» otra vez o «Regar».');
  };

  $('#btn-reset').onclick = () => {
    softReset();
    if (state.mode === 'memory') initMemory();
    narrate('Todo reiniciado a T+000.');
  };

  /* ═══════════════════════════════════════════════════════
     MODO MEMORIA (FIFO / LRU / Óptimo)
     ═══════════════════════════════════════════════════════ */
  const memState = {
    fifo: null, lru: null, optimo: null,
    stepIndex: 0,
    timerId: null
  };

  function initMemory() {
    memState.fifo = Algorithms.runFIFO(MEM_CHAIN, MEM_FRAMES);
    memState.lru = Algorithms.runLRU(MEM_CHAIN, MEM_FRAMES);
    memState.optimo = Algorithms.runOptimo(MEM_CHAIN, MEM_FRAMES);
    memState.stepIndex = 0;

    ['FIFO', 'LRU', 'OPTIMO'].forEach(algo => {
      const key = algo.toLowerCase();
      const card = document.querySelector(`.memory-card[data-algo="${algo}"]`);
      if (!card) return;
      const baskets = card.querySelector('[data-role="baskets"]');
      baskets.innerHTML = '';
      for (let i = 0; i < MEM_FRAMES; i++) {
        const b = document.createElement('div');
        b.className = 'basket';
        b.innerHTML = `<div class="basket-contents"></div><div class="basket-label">Canasta ${i + 1}</div>`;
        baskets.appendChild(b);
      }
      card.querySelector('[data-role="hits"]').textContent = '0';
      card.querySelector('[data-role="faults"]').textContent = '0';
    });

    $('#memory-page').textContent = '—';
    narrate('Modo memoria listo. Pulsa «Paso» o «Regar» para ver las páginas entrar en las canastas.');
  }

  function memStep() {
    if (!memState.fifo) initMemory();
    if (memState.stepIndex >= MEM_CHAIN.length) {
      narrate('Secuencia terminada. Pulsa «Reiniciar» para volver a empezar.');
      return;
    }
    const i = memState.stepIndex;
    const page = MEM_CHAIN[i];
    $('#memory-page').textContent = page;

    [['FIFO', memState.fifo], ['LRU', memState.lru], ['OPTIMO', memState.optimo]].forEach(([algo, res]) => {
      const card = document.querySelector(`.memory-card[data-algo="${algo}"]`);
      if (!card) return;
      const step = res.steps[i];
      const baskets = card.querySelectorAll('.basket-contents');
      baskets.forEach(b => b.innerHTML = '');
      step.mem.forEach((p, k) => {
        const chip = document.createElement('div');
        chip.className = 'page-chip' +
          (k === step.mem.length - 1 && step.event === 'fault' ? ' is-new' : '') +
          (step.event === 'hit' && p === page ? ' is-hit' : '');
        chip.textContent = p;
        baskets[k].appendChild(chip);
      });
      card.querySelector('[data-role="hits"]').textContent = String(res.steps.slice(0, i + 1).filter(s => s.event === 'hit').length);
      card.querySelector('[data-role="faults"]').textContent = String(res.steps.slice(0, i + 1).filter(s => s.event === 'fault').length);
    });

    memState.stepIndex++;
    narrate(`Llegó la página ${page}. ${MEM_CHAIN.slice(0, i + 1).join(', ')}`);
  }

  /* ═══ CAMBIO DE MODO ═══ */
  $('#mode-toggle').onclick = () => {
    state.mode = state.mode === 'scheduling' ? 'memory' : 'scheduling';
    const isMem = state.mode === 'memory';
    $('#garden-grid').classList.toggle('hidden', isMem);
    $('#memory-grid').classList.toggle('hidden', !isMem);
    $('#setup-scheduling').classList.toggle('hidden', isMem);
    $('#mode-icon').textContent = isMem ? '🧺' : '🌱';
    $('#mode-label').textContent = isMem ? 'Memoria' : 'Planificación';
    softReset();
    if (isMem) {
      initMemory();
    } else {
      narrate('Modo planificación: la regadera reparte agua entre las plantas.');
    }
  };

  /* ═══ BOOTSTRAP ═══ */
  document.addEventListener('DOMContentLoaded', () => {
    renderProcessList();
    narrate('Pulsa «Regar» para empezar la simulación.');
  });
})();