/* ═══════════════════════════════════════════════════════
   MAIN · Orquestador de la UI con metáfora de plantas
   ═══════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ALGOS_SCHED = ["FCFS", "SJF", "SRTF", "RR", "PRIORITY"];

  // ─── Escenario por defecto de memoria ───
  const MEM_SCENARIO = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  const MEM_SCENARIO_FRAMES = 3;

  const state = {
    processes: [
      { pid: "P1", arrival: 0, burst: 5, priority: 2 },
      { pid: "P2", arrival: 0, burst: 4, priority: 1 },
      { pid: "P3", arrival: 2, burst: 3, priority: 3 },
      { pid: "P4", arrival: 4, burst: 6, priority: 2 },
    ],
    quantum: 2,
    clock: 0,
    speed: 5,
    running: false,
    mode: "scheduling", // 'scheduling' | 'memory'
    results: null,
    timerId: null,
    garden: {}, // garden[algo][pid] = { remaining, total, done, arrival }
  };

  /* ═══ NARRADOR ═══ */
  function narrate(text) {
    const el = $("#narrator-text");
    if (el) el.textContent = text;
  }

  /* ═══ LISTA DE PROCESOS ═══ */
  function renderProcessList() {
    const list = $("#process-list");
    list.innerHTML = "";
    const tpl = $("#process-row-template");
    state.processes.forEach((p, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector(".pid-badge").textContent = p.pid;
      node.querySelector('[data-role="arrival"]').value = p.arrival;
      node.querySelector('[data-role="burst"]').value = p.burst;
      node.querySelector('[data-role="priority"]').value = p.priority;

      const bind = (role, key) => {
        node.querySelector(`[data-role="${role}"]`).oninput = (e) => {
          p[key] = +e.target.value;
          softReset();
        };
      };
      bind("arrival", "arrival");
      bind("burst", "burst");
      bind("priority", "priority");

      node.querySelector('[data-role="remove"]').onclick = () => {
        state.processes.splice(i, 1);
        renderProcessList();
        softReset();
      };
      list.appendChild(node);
    });
  }

  function nextPid() {
    const used = new Set(state.processes.map((p) => p.pid));
    let i = 1;
    while (used.has("P" + i)) i++;
    return "P" + i;
  }

  /* ═══ BOTONES DE CONFIGURACIÓN ═══ */
  $("#btn-add").onclick = () => {
    if (state.processes.length >= 8) return;
    state.processes.push({ pid: nextPid(), arrival: 0, burst: 5, priority: 1 });
    renderProcessList();
    softReset();
  };

  $("#btn-random").onclick = () => {
    state.processes = Array.from({ length: 4 }, (_, i) => ({
      pid: "P" + (i + 1),
      arrival: Math.floor(Math.random() * 6),
      burst: Math.floor(Math.random() * 8) + 1,
      priority: Math.floor(Math.random() * 5) + 1,
    }));
    renderProcessList();
    softReset();
    narrate("Se generaron 4 plantas al azar. Pulsa «Regar» para simular.");
  };

  $("#btn-scenario").onclick = () => {
    state.processes = [
      { pid: "P1", arrival: 0, burst: 5, priority: 2 },
      { pid: "P2", arrival: 1, burst: 3, priority: 1 },
      { pid: "P3", arrival: 2, burst: 8, priority: 4 },
      { pid: "P4", arrival: 3, burst: 2, priority: 3 },
    ];
    renderProcessList();
    softReset();
    narrate("Escenario clásico cargado. Compáralo entre los 5 algoritmos.");
  };

  $("#quantum").oninput = (e) => {
    state.quantum = Math.max(1, +e.target.value || 1);
    softReset();
  };

  $("#speed").oninput = (e) => {
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
    box.innerHTML = "";
    const tpl = $("#plant-template");
    const procs = state.results[algo].processes
      .slice()
      .sort((a, b) => a.pid.localeCompare(b.pid));

    for (const p of procs) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.pid = p.pid;
      node.dataset.arrival = p.arrival; // ← guardamos arrival en el DOM
      node.querySelector(".plant-label").textContent = p.pid;
      node.querySelector(".thirst-fill").style.width = "100%";
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
    const now = state.clock; // tiempo actual de simulación

    card.querySelectorAll(".plant").forEach((plant) => {
      const pid = plant.dataset.pid;
      const info = g[pid];
      if (!info || info.visible) return;
      if (info.arrival <= now) {
        info.visible = true;
        plant.classList.add("is-visible", "is-sprouting");
        setTimeout(() => plant.classList.remove("is-sprouting"), 700);
      }
    });
  }

  /* ═══ TICK (avanza 1 unidad de tiempo) ═══ */
  function tick() {
    state.clock++;
    $("#clock-value").textContent = "T+" + String(state.clock).padStart(3, "0");
    for (const algo of ALGOS_SCHED) revealArrivedPlants(algo);

    let anyRunning = false;

    for (const algo of ALGOS_SCHED) {
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (!card) continue;
      const result = state.results[algo];
      if (!result) continue;

      const tStart = state.clock - 1;
      const tEnd = state.clock;
      const seg =
        result.timeline.find((s) => s.start <= tStart && s.end >= tEnd) ||
        result.timeline.find((s) => s.start === tStart);
      const activePid = seg ? seg.pid : null;

      const plants = card.querySelectorAll(".plant");
      plants.forEach((plant) => {
        const pid = plant.dataset.pid;
        const g = state.garden[algo][pid];
        const active = pid === activePid;
        plant.classList.toggle("is-watering", active);

        if (active && g.remaining > 0) {
          g.remaining--;
          const pct = (g.remaining / g.total) * 100;
          plant.querySelector(".thirst-fill").style.width = pct + "%";
          if (g.remaining === 0) {
            g.done = true;
            plant.classList.remove("is-watering");
            plant.classList.add("is-done");
          }
        }
      });

      // Regadera
      const can = card.querySelector('[data-role="can"]');
      if (can && activePid) {
        const target = card.querySelector(`.plant[data-pid="${activePid}"]`);
        const scene = card.querySelector(".garden-scene");
        if (target && scene) {
          const tRect = target.getBoundingClientRect();
          const sRect = scene.getBoundingClientRect();
          can.style.left =
            tRect.left - sRect.left + tRect.width / 2 - 16 + "px";
          can.classList.add("is-pouring");
        }
      } else if (can) {
        can.classList.remove("is-pouring");
      }

      // Métricas parciales
      let wtSum = 0,
        tatSum = 0,
        done = 0;
      for (const p of result.processes) {
        const g = state.garden[algo][p.pid];
        if (!g.done) continue;
        const finish = result.timeline
          .filter((s) => s.pid === p.pid)
          .reduce((a, s) => Math.max(a, s.end), 0);
        const tat = finish - p.arrival;
        wtSum += tat - p.burst;
        tatSum += tat;
        done++;
      }
      card.querySelector('[data-role="wt"]').textContent = done
        ? (wtSum / done).toFixed(1)
        : "0.0";
      card.querySelector('[data-role="tat"]').textContent = done
        ? (tatSum / done).toFixed(1)
        : "0.0";
      card.querySelector('[data-role="cs"]').textContent =
        result.contextSwitches;
      card.querySelector('[data-role="cpu"]').textContent =
        result.cpuUsage + "%";

      const totalRem = Object.values(state.garden[algo]).reduce(
        (a, g) => a + g.remaining,
        0,
      );
      if (totalRem > 0) anyRunning = true;
      else {
        card.classList.remove("is-running");
        card.classList.add("is-done");
        card.querySelector('[data-role="state"]').textContent = "Terminado";
      }
    }

    // Tabla comparativa en vivo
    renderMetricsTable();

    if (!anyRunning) {
      state.running = false;
      if (state.timerId) clearInterval(state.timerId);
      state.timerId = null;
      $("#btn-run").disabled = false;
      $("#btn-pause").disabled = true;
      narrate("¡Listo! Todas las plantas florecieron. 🌸");
    }
  }

  function startTicker() {
    const delay = Math.max(120, 1100 - state.speed * 100);
    state.timerId = setInterval(tick, delay);
  }

  /* ═══ TABLA DE MÉTRICAS ═══ */
  function renderMetricsTable() {
    const body = $("#metrics-body");
    if (!body || !state.results) return;
    body.innerHTML = "";
    for (const algo of ALGOS_SCHED) {
      const r = state.results[algo];
      if (!r) continue;
      const tr = document.createElement("tr");
      const label = algo === "PRIORITY" ? "Prioridades" : algo;
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
      PRIORITY: Algorithms.runPriority(state.processes),
    };
    for (const algo of ALGOS_SCHED) {
      narrate("La regadera ya se está moviendo entre las macetas...");
      renderGarden(algo);
      initGardenState(algo);
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (card) {
        card.classList.add("is-running");
        card.classList.remove("is-done");
        card.querySelector('[data-role="state"]').textContent = "Regando";
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
    $("#clock-value").textContent = "T+000";
    $("#btn-run").disabled = false;
    $("#btn-pause").disabled = true;
    for (const algo of ALGOS_SCHED) {
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (!card) continue;
      card.classList.remove("is-running", "is-done");
      card.querySelector('[data-role="state"]').textContent = "En espera";
      const box = card.querySelector('[data-role="plants"]');
      if (box) box.innerHTML = "";
      card.querySelector('[data-role="wt"]').textContent = "0.0";
      card.querySelector('[data-role="tat"]').textContent = "0.0";
      card.querySelector('[data-role="cpu"]').textContent = "0%";
      card.querySelector('[data-role="cs"]').textContent = "0";
    }
    const body = $("#metrics-body");
    if (body) body.innerHTML = "";
  }

  /* ═══ TRANSPORTE ═══ */
  $("#btn-run").onclick = () => {
    if (state.mode === "memory") {
      memRun();
      return;
    }
    if (!state.results) prepareRun();
    state.running = true;
    $("#btn-run").disabled = true;
    $("#btn-pause").disabled = false;
    if (state.timerId) clearInterval(state.timerId);
    startTicker();
  };

  $("#btn-pause").onclick = () => {
    if (state.mode === "memory") {
      memPause();
      return;
    }
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.running = false;
    $("#btn-run").disabled = false;
    $("#btn-pause").disabled = true;
    narrate("Simulación pausada. Pulsa «Regar» para continuar.");
  };

  $("#btn-step").onclick = () => {
    if (state.mode === "memory") {
      memPause();
      memStep();
      return;
    }
    if (!state.results) prepareRun();
    tick();
    narrate(
      "Tick manual: T+" + state.clock + ". Pulsa «Paso» otra vez o «Regar».",
    );
  };

  $("#btn-reset").onclick = () => {
    softReset();
    if (state.mode === "memory") initMemory();
    narrate("Todo reiniciado a T+000.");
  };

  /* ═══════════════════════════════════════════════════════
     MODO MEMORIA (FIFO / LRU / Óptimo)
     ═══════════════════════════════════════════════════════ */
  const memState = {
    fifo: null,
    lru: null,
    optimo: null,
    stepIndex: 0,
    timerId: null,
    chain: [...MEM_SCENARIO],
    frames: MEM_SCENARIO_FRAMES,
  };

  /* ─── Utilidades de cadena ─── */
  function parseChain(str) {
    return String(str)
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.floor(n));
  }

  function formatChain(chain) {
    return "[" + chain.join(",") + "]";
  }

  function randomChain() {
    const len = 10 + Math.floor(Math.random() * 5); // 10–14
    const distinct = 3 + Math.floor(Math.random() * 3); // 3–5
    const chain = [];
    for (let i = 0; i < len; i++) {
      chain.push(1 + Math.floor(Math.random() * distinct));
    }
    return chain;
  }

  function syncMemoryInputs() {
    const chainInput = $("#memory-chain-input");
    const framesInput = $("#memory-frames-input");
    const chainDisplay = $("#memory-chain-display");
    const framesDisplay = $("#memory-frames-display");

    if (chainInput) chainInput.value = memState.chain.join(", ");
    if (framesInput) framesInput.value = memState.frames;
    if (chainDisplay) chainDisplay.textContent = formatChain(memState.chain);
    if (framesDisplay) framesDisplay.textContent = memState.frames;
  }

  /* ─── Inicialización ─── */
  function initMemory() {
    memState.fifo = Algorithms.runFIFO(memState.chain, memState.frames);
    memState.lru = Algorithms.runLRU(memState.chain, memState.frames);
    memState.optimo = Algorithms.runOptimo(memState.chain, memState.frames);
    memState.stepIndex = 0;
    memPause();
    syncMemoryInputs();

    ["FIFO", "LRU", "OPTIMO"].forEach((algo) => {
      const card = document.querySelector(`.memory-card[data-algo="${algo}"]`);
      if (!card) return;
      const baskets = card.querySelector('[data-role="baskets"]');
      baskets.innerHTML = "";
      for (let i = 0; i < memState.frames; i++) {
        const b = document.createElement("div");
        b.className = "basket";
        b.innerHTML = `<div class="basket-contents"></div><div class="basket-label">Canasta ${i + 1}</div>`;
        baskets.appendChild(b);
      }
      card.querySelector('[data-role="hits"]').textContent = "0";
      card.querySelector('[data-role="faults"]').textContent = "0";
    });

    $("#memory-page").textContent = "—";
    narrate(
      `Memoria lista (${memState.frames} canastas). Pulsa «Paso» o «Regar» para ver las páginas entrar.`,
    );
  }

  /* ─── Paso de memoria ─── */
  function memStep() {
    if (!memState.fifo) initMemory();
    if (memState.stepIndex >= memState.chain.length) {
      memPause();
      narrate("Secuencia terminada. Pulsa «Reiniciar» para volver a empezar.");
      return;
    }
    const i = memState.stepIndex;
    const page = memState.chain[i];
    $("#memory-page").textContent = page;

    [
      ["FIFO", memState.fifo],
      ["LRU", memState.lru],
      ["OPTIMO", memState.optimo],
    ].forEach(([algo, res]) => {
      const card = document.querySelector(`.memory-card[data-algo="${algo}"]`);
      if (!card) return;
      const step = res.steps[i];
      const baskets = card.querySelectorAll(".basket-contents");
      baskets.forEach((b) => (b.innerHTML = ""));
      step.mem.forEach((p, k) => {
        const chip = document.createElement("div");
        chip.className =
          "page-chip" +
          (k === step.mem.length - 1 && step.event === "fault"
            ? " is-new"
            : "") +
          (step.event === "hit" && p === page ? " is-hit" : "");
        chip.textContent = p;
        baskets[k].appendChild(chip);
      });
      card.querySelector('[data-role="hits"]').textContent = String(
        res.steps.slice(0, i + 1).filter((s) => s.event === "hit").length,
      );
      card.querySelector('[data-role="faults"]').textContent = String(
        res.steps.slice(0, i + 1).filter((s) => s.event === "fault").length,
      );
    });

    memState.stepIndex++;
    narrate(
      `Llegó la página ${page}. ${memState.chain.slice(0, i + 1).join(", ")}`,
    );
  }

  /* ─── Run/Pause de memoria ─── */
  function memRun() {
    if (!memState.fifo) initMemory();
    if (memState.timerId) return;
    const speed = state.speed || 5;
    const delay = Math.max(120, 1100 - speed * 100);
    state.running = true;
    $("#btn-run").disabled = true;
    $("#btn-pause").disabled = false;
    memState.timerId = setInterval(() => {
      if (memState.stepIndex >= memState.chain.length) {
        memPause();
        narrate(
          "Secuencia terminada. Pulsa «Reiniciar» para volver a empezar.",
        );
        return;
      }
      memStep();
    }, delay);
  }

  function memPause() {
    if (memState.timerId) clearInterval(memState.timerId);
    memState.timerId = null;
    state.running = false;
    $("#btn-run").disabled = false;
    $("#btn-pause").disabled = true;
  }

  /* ─── Controles de cadena ─── */
  $("#btn-mem-apply").onclick = () => {
    const chain = parseChain($("#memory-chain-input").value);
    const frames = Math.max(
      1,
      Math.min(8, +$("#memory-frames-input").value || MEM_SCENARIO_FRAMES),
    );
    if (!chain.length) {
      narrate(
        "La cadena está vacía o no es válida. Escribe números separados por comas.",
      );
      return;
    }
    memState.chain = chain;
    memState.frames = frames;
    initMemory();
    narrate(
      `Cadena aplicada: ${chain.join(", ")} · ${frames} canastas. Pulsa «Regar».`,
    );
  };

  $("#btn-mem-random").onclick = () => {
    memState.chain = randomChain();
    memState.frames = MEM_SCENARIO_FRAMES;
    initMemory();
    narrate("Cadena aleatoria generada. Pulsa «Paso» o «Regar».");
  };

  $("#btn-mem-scenario").onclick = () => {
    memState.chain = [...MEM_SCENARIO];
    memState.frames = MEM_SCENARIO_FRAMES;
    initMemory();
    narrate(
      "Escenario clásico cargado (1,2,3,4,1,2,5,1,2,3,4,5 · 3 canastas).",
    );
  };

  /* ═══ CAMBIO DE MODO ═══ */
  $("#mode-toggle").onclick = () => {
    state.mode = state.mode === "scheduling" ? "memory" : "scheduling";
    const isMem = state.mode === "memory";
    $("#garden-grid").classList.toggle("hidden", isMem);
    $("#memory-grid").classList.toggle("hidden", !isMem);
    $("#setup-scheduling").classList.toggle("hidden", isMem);
    $("#mode-icon").textContent = isMem ? "🧺" : "🌱";
    $("#mode-label").textContent = isMem ? "Memoria" : "Planificación";
    softReset();
    if (isMem) {
      initMemory();
    } else {
      narrate(
        "Modo planificación: la regadera reparte agua entre las plantas.",
      );
    }
  };

  /* ═══ BOOTSTRAP ═══ */
  document.addEventListener("DOMContentLoaded", () => {
    renderProcessList();
    syncMemoryInputs();
    narrate("Pulsa «Regar» para empezar la simulación.");
  });
})();
