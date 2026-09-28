/* ═══════════════════════════════════════════════════════
   MAIN · Orquestador de la UI (compatible con algorithms v3)
   Incluye: Gantt · Scrubber · Atajos · Starvation · Dark mode
   · Gráfico comparativo · 3 escenarios rotativos · Tooltips flotantes
   ═══════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const ALGOS_SCHED = ["FCFS", "SJF", "SRTF", "RR", "PRIORITY"];
  const MEM_CHAIN = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
  const MEM_FRAMES = 3;
  const THEME_KEY = "invernadero:theme";

  const PID_PALETTE = [
    "#5fa756",
    "#e8a33d",
    "#6bb6d9",
    "#d9584b",
    "#a970c9",
    "#4caf7d",
    "#f19bbf",
    "#8b6f47",
    "#3e8bb0",
    "#b08a4a",
  ];

  const ALGO_COLORS = {
    FCFS: "#5fa756",
    SJF: "#3d7a3a",
    SRTF: "#e8a33d",
    RR: "#6bb6d9",
    PRIORITY: "#a970c9",
  };
  const ALGO_LABELS = {
    FCFS: "FCFS",
    SJF: "SJF",
    SRTF: "SRTF",
    RR: "Round Robin",
    PRIORITY: "Prioridades",
  };

  /* ═══ 3 ESCENARIOS PREDEFINIDOS ═══ */
  const SCENARIOS = [
    {
      name: "Convoy",
      hint: "un proceso largo bloquea a los cortos. FCFS sufre, SRTF gana por preempción.",
      processes: [
        { pid: "P1", arrival: 0, burst: 8, priority: 1 },
        { pid: "P2", arrival: 1, burst: 1, priority: 5 },
        { pid: "P3", arrival: 2, burst: 1, priority: 3 },
        { pid: "P4", arrival: 3, burst: 1, priority: 4 },
      ],
    },
    {
      name: "CPU ociosa",
      hint: "llegadas espaciadas: la CPU queda inactiva entre procesos.",
      processes: [
        { pid: "P1", arrival: 0, burst: 4, priority: 1 },
        { pid: "P2", arrival: 1, burst: 2, priority: 5 },
        { pid: "P3", arrival: 12, burst: 3, priority: 2 },
        { pid: "P4", arrival: 13, burst: 1, priority: 4 },
      ],
    },
    {
      name: "Prioridades",
      hint: "prioridades 1 vs 9 con todos llegando a la vez: el orden cambia radicalmente.",
      processes: [
        { pid: "P1", arrival: 0, burst: 6, priority: 9 },
        { pid: "P2", arrival: 0, burst: 2, priority: 1 },
        { pid: "P3", arrival: 0, burst: 2, priority: 5 },
        { pid: "P4", arrival: 0, burst: 2, priority: 3 },
      ],
    },
  ];
  let scenarioIndex = 0;

  const state = {
    processes: [
      { pid: "P1", arrival: 0, burst: 5, priority: 2 },
      { pid: "P2", arrival: 0, burst: 4, priority: 1 },
      { pid: "P3", arrival: 2, burst: 3, priority: 3 },
      { pid: "P4", arrival: 4, burst: 6, priority: 2 },
    ],
    quantum: 2,
    clock: 0,
    maxTick: 0,
    speed: 5,
    running: false,
    mode: "scheduling",
    results: null,
    timerId: null,
    theme: "light",
    chartMetric: "avgWaiting",
    chartLabel: "Espera media",
    chartMode: "lower",
  };

  function narrate(text) {
    const el = $("#narrator-text");
    if (el) el.textContent = text;
  }

  function buildPidColors() {
    const pids = [...new Set(state.processes.map((p) => p.pid))].sort();
    const map = {};
    pids.forEach((pid, i) => (map[pid] = PID_PALETTE[i % PID_PALETTE.length]));
    return map;
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
    narrate("🎲 Se generaron 4 plantas al azar. Pulsa «Regar» para simular.");
  };

  /* ═══ BOTÓN DE ESCENARIOS · ROTA ENTRE LOS 3 ═══ */
  $("#btn-scenario").onclick = () => {
    const idx = scenarioIndex % SCENARIOS.length;
    const sc = SCENARIOS[idx];
    scenarioIndex = (scenarioIndex + 1) % SCENARIOS.length;

    state.processes = sc.processes.map((p) => ({ ...p }));
    renderProcessList();
    softReset();
    narrate(
      `🧪 Escenario ${idx + 1}/${SCENARIOS.length} · "${sc.name}": ${sc.hint}`,
    );
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
    const colors = buildPidColors();
    const procs = state.results[algo].metrics.perProcess
      .slice()
      .sort((a, b) => a.pid.localeCompare(b.pid));

    for (const p of procs) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.pid = p.pid;
      const label = node.querySelector(".plant-label");
      label.textContent = p.pid;
      label.style.color = colors[p.pid] || "var(--muted)";
      label.style.fontWeight = "900";
      node.querySelector(".thirst-fill").style.width = "100%";
      box.appendChild(node);
    }
  }

  /* ═══ RENDER DE GANTT ═══ */
  function renderGantt(algo) {
    const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
    if (!card) return;
    const box = card.querySelector('[data-role="gantt"]');
    if (!box) return;
    box.innerHTML = "";
    box.style.setProperty("--playhead", "0%");

    const result = state.results[algo];
    const total = result.timeline.length || 1;
    const colors = buildPidColors();

    for (const block of result.gantt) {
      const el = document.createElement("div");
      el.className = "gantt-block";
      el.style.width = (block.duration / total) * 100 + "%";
      el.dataset.start = block.start;
      el.dataset.end = block.end;

      if (block.pid === null) {
        el.classList.add("is-idle");
        el.title = `CPU inactiva · t=${block.start}–${block.end}`;
        el.textContent = "—";
      } else {
        el.style.background = colors[block.pid] || "#888";
        el.textContent = block.pid;
        el.title = `${block.pid} · t=${block.start}–${block.end} · ${block.duration} tick${block.duration !== 1 ? "s" : ""}`;
      }
      box.appendChild(el);
    }
  }

  /* ═══ RENDER IDEMPOTENTE A UN TICK DADO ═══ */
  function renderSchedulingAt(clock) {
    state.clock = clock;
    $("#clock-value").textContent = "T+" + String(clock).padStart(3, "0");

    const scrubber = $("#scrubber");
    if (scrubber && +scrubber.value !== clock) scrubber.value = clock;
    const sv = $("#scrubber-value");
    if (sv) sv.textContent = clock;

    for (const algo of ALGOS_SCHED) renderGardenAt(algo, clock);
    renderMetricsTable();
    renderComparisonChart();

    if (clock >= state.maxTick && state.maxTick > 0) finishRun();
  }

  function renderGardenAt(algo, clock) {
    const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
    if (!card) return;
    const result = state.results[algo];
    if (!result) return;
    const perProc = result.metrics.perProcess;

    const remaining = {};
    perProc.forEach((p) => (remaining[p.pid] = p.burst));
    const upto = Math.min(clock, result.timeline.length);
    for (let t = 0; t < upto; t++) {
      const pid = result.timeline[t].pid;
      if (pid && remaining[pid] != null) remaining[pid]--;
    }

    const currentFrame = clock > 0 ? result.timeline[clock - 1] : null;
    const activePid = currentFrame ? currentFrame.pid : null;

    card.querySelectorAll(".plant").forEach((plant) => {
      const pid = plant.dataset.pid;
      const info = perProc.find((p) => p.pid === pid);
      if (!info) return;

      if (clock >= info.arrival) {
        if (!plant.classList.contains("is-visible")) {
          plant.classList.add("is-visible");
          if (!plant.dataset.sprouted) {
            plant.dataset.sprouted = "1";
            plant.classList.add("is-sprouting");
            setTimeout(() => plant.classList.remove("is-sprouting"), 700);
          }
        }
      } else {
        plant.classList.remove("is-visible");
      }

      const rem = Math.max(0, remaining[pid]);
      const pct = (rem / info.burst) * 100;
      plant.querySelector(".thirst-fill").style.width = pct + "%";
      plant.classList.toggle("is-watering", pid === activePid && rem > 0);
      plant.classList.toggle("is-done", rem === 0 && clock >= info.arrival);
    });

    const can = card.querySelector('[data-role="can"]');
    if (can && activePid) {
      const target = card.querySelector(`.plant[data-pid="${activePid}"]`);
      const scene = card.querySelector(".garden-scene");
      if (target && scene) {
        const tRect = target.getBoundingClientRect();
        const sRect = scene.getBoundingClientRect();
        can.style.left = tRect.left - sRect.left + tRect.width / 2 - 16 + "px";
        can.classList.add("is-pouring");
      }
    } else if (can) {
      can.classList.remove("is-pouring");
    }

    const gantt = card.querySelector('[data-role="gantt"]');
    if (gantt) {
      const total = result.timeline.length || 1;
      const pct = Math.min(100, (clock / total) * 100);
      gantt.style.setProperty("--playhead", pct + "%");
      gantt.querySelectorAll(".gantt-block").forEach((b) => {
        const end = +b.dataset.end;
        b.classList.toggle("is-future", end > clock);
      });
    }

    let wtSum = 0,
      tatSum = 0,
      done = 0;
    for (const p of perProc) {
      if (p.completion != null && p.completion <= clock) {
        wtSum += p.waiting;
        tatSum += p.turnaround;
        done++;
      }
    }
    card.querySelector('[data-role="wt"]').textContent = done
      ? (wtSum / done).toFixed(1)
      : "0.0";
    card.querySelector('[data-role="tat"]').textContent = done
      ? (tatSum / done).toFixed(1)
      : "0.0";
    card.querySelector('[data-role="cs"]').textContent =
      result.metrics.contextSwitches;
    card.querySelector('[data-role="cpu"]').textContent =
      Math.round(result.metrics.cpuUtilization * 100) + "%";

    const totalRem = Object.values(remaining).reduce((a, b) => a + b, 0);
    if (totalRem > 0 && clock < state.maxTick) {
      card.classList.add("is-running");
      card.classList.remove("is-done");
      card.querySelector('[data-role="state"]').textContent =
        clock > 0 ? "Regando" : "En espera";
    } else {
      card.classList.remove("is-running");
      card.classList.add("is-done");
      card.querySelector('[data-role="state"]').textContent = "Terminado";
    }

    const warn = card.querySelector('[data-role="warn"]');
    if (warn) {
      const st = result.metrics.starvation;
      if (st.risk) {
        warn.classList.remove("hidden");
        warn.title = `Riesgo de inanición: ${st.processes.join(", ")} · espera máx. ${st.maxWait} ticks`;
      } else {
        warn.classList.add("hidden");
      }
    }
  }

  /* ═══ TICKER ═══ */
  function tick() {
    if (!state.results) return;
    if (state.clock >= state.maxTick) {
      finishRun();
      return;
    }
    renderSchedulingAt(state.clock + 1);
    if (state.clock >= state.maxTick) finishRun();
  }

  function stepBack() {
    if (state.mode !== "scheduling") return;
    if (!state.results) return;
    pauseTicker();
    if (state.clock > 0) renderSchedulingAt(state.clock - 1);
  }

  function startTicker() {
    const delay = Math.max(120, 1100 - state.speed * 100);
    state.timerId = setInterval(tick, delay);
  }

  function pauseTicker() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.running = false;
    $("#btn-run").disabled = false;
    $("#btn-pause").disabled = true;
  }

  function finishRun() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.running = false;
    $("#btn-run").disabled = false;
    $("#btn-pause").disabled = true;
    narrate("¡Listo! Todas las plantas florecieron. 🌸");
  }

  /* ═══ TABLA DE MÉTRICAS ═══ */
  function renderMetricsTable() {
    const body = $("#metrics-body");
    if (!body || !state.results) return;
    body.innerHTML = "";

    const rows = ALGOS_SCHED.map((algo) => {
      const r = state.results[algo];
      if (!r || !r.metrics) return null;
      return {
        algo,
        label: ALGO_LABELS[algo],
        wt: r.metrics.avgWaiting,
        tat: r.metrics.avgTurnaround,
        resp: r.metrics.avgResponse,
        cpu: r.metrics.cpuUtilization,
        cs: r.metrics.contextSwitches,
        risk: r.metrics.starvation.risk,
      };
    }).filter(Boolean);

    if (!rows.length) return;

    const minWT = Math.min(...rows.map((r) => r.wt));
    const minTAT = Math.min(...rows.map((r) => r.tat));
    const minResp = Math.min(...rows.map((r) => r.resp));
    const maxCPU = Math.max(...rows.map((r) => r.cpu));
    const minCS = Math.min(...rows.map((r) => r.cs));

    for (const r of rows) {
      const tr = document.createElement("tr");
      const tag = (v, best, cls) => (v === best ? ` class="${cls}"` : "");
      tr.innerHTML = `
        <td>${r.label}</td>
        <td${tag(r.wt, minWT, "best")}>${r.wt.toFixed(2)}</td>
        <td${tag(r.tat, minTAT, "best")}>${r.tat.toFixed(2)}</td>
        <td${tag(r.resp, minResp, "best")}>${r.resp.toFixed(2)}</td>
        <td${tag(r.cpu, maxCPU, "best")}>${Math.round(r.cpu * 100)}%</td>
        <td${tag(r.cs, minCS, "best")}>${r.cs}</td>
        <td class="${r.risk ? "risk-yes" : "risk-no"}">${r.risk ? "⚠️" : "✓"}</td>
      `;
      body.appendChild(tr);
    }
  }

  /* ═══ GRÁFICO COMPARATIVO ═══ */
  function renderComparisonChart() {
    const body = $("#chart-body");
    const legend = $("#chart-legend");
    const metricLabel = $("#chart-metric-label");
    if (!body) return;

    if (!state.results) {
      body.innerHTML =
        '<p class="chart-empty">Pulsa «Regar» para ver la comparación.</p>';
      return;
    }

    const metric = state.chartMetric;
    const higherIsBetter = state.chartMode === "higher";

    const rows = ALGOS_SCHED.map((algo) => {
      const r = state.results[algo];
      if (!r || !r.metrics) return null;
      const value = r.metrics[metric];
      return { algo, label: ALGO_LABELS[algo], value };
    }).filter(Boolean);

    if (!rows.length) return;

    const values = rows.map((r) => r.value);
    const maxVal = Math.max(...values, 0.0001);
    const bestVal = higherIsBetter ? Math.max(...values) : Math.min(...values);

    body.innerHTML = "";
    for (const row of rows) {
      const pct = Math.max(2, (row.value / maxVal) * 100);
      const isWinner = row.value === bestVal;
      const valueText =
        metric === "cpuUtilization"
          ? Math.round(row.value * 100) + "%"
          : metric === "contextSwitches"
            ? String(row.value)
            : row.value.toFixed(2);

      const el = document.createElement("div");
      el.className = "chart-row" + (isWinner ? " is-winner" : "");
      el.innerHTML = `
        <span class="chart-label">${row.label}</span>
        <div class="chart-track">
          <div class="chart-bar" style="width:${pct}%;background:${ALGO_COLORS[row.algo]};"></div>
        </div>
        <span class="chart-value">${valueText}</span>
        <span class="chart-crown">${isWinner ? "⭐" : ""}</span>
      `;
      body.appendChild(el);
    }

    if (metricLabel) metricLabel.textContent = state.chartLabel;
    if (legend) {
      legend.textContent = higherIsBetter
        ? "Mayor es mejor · ⭐ marca el algoritmo óptimo para esta métrica"
        : "Menor es mejor · ⭐ marca el algoritmo óptimo para esta métrica";
    }
  }

  /* ═══ PREPARAR / RESET ═══ */
  function prepareRun() {
    const opts = { quantum: state.quantum };
    state.results = {
      FCFS: Algorithms.simulate("FCFS", state.processes, opts),
      SJF: Algorithms.simulate("SJF", state.processes, opts),
      SRTF: Algorithms.simulate("SRTF", state.processes, opts),
      RR: Algorithms.simulate("RR", state.processes, opts),
      PRIORITY: Algorithms.simulate("PRIORITY", state.processes, opts),
    };
    state.maxTick = Math.max(
      ...ALGOS_SCHED.map((a) => state.results[a].timeline.length),
    );

    const scrubber = $("#scrubber");
    if (scrubber) {
      scrubber.max = state.maxTick;
      scrubber.value = 0;
    }

    for (const algo of ALGOS_SCHED) {
      renderGarden(algo);
      renderGantt(algo);
    }
    renderSchedulingAt(0);
    narrate("La regadera ya se está moviendo entre las macetas...");
  }

  function softReset() {
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    state.running = false;
    state.results = null;
    state.clock = 0;
    state.maxTick = 0;
    $("#clock-value").textContent = "T+000";
    $("#btn-run").disabled = false;
    $("#btn-pause").disabled = true;

    const scrubber = $("#scrubber");
    if (scrubber) {
      scrubber.max = 0;
      scrubber.value = 0;
    }
    const sv = $("#scrubber-value");
    if (sv) sv.textContent = "0";

    for (const algo of ALGOS_SCHED) {
      const card = document.querySelector(`.garden-card[data-algo="${algo}"]`);
      if (!card) continue;
      card.classList.remove("is-running", "is-done");
      card.querySelector('[data-role="state"]').textContent = "En espera";
      card.querySelector('[data-role="warn"]').classList.add("hidden");
      const box = card.querySelector('[data-role="plants"]');
      if (box) box.innerHTML = "";
      const gantt = card.querySelector('[data-role="gantt"]');
      if (gantt) {
        gantt.innerHTML = "";
        gantt.style.setProperty("--playhead", "0%");
      }
      card.querySelector('[data-role="wt"]').textContent = "0.0";
      card.querySelector('[data-role="tat"]').textContent = "0.0";
      card.querySelector('[data-role="cpu"]').textContent = "0%";
      card.querySelector('[data-role="cs"]').textContent = "0";
    }
    const body = $("#metrics-body");
    if (body) body.innerHTML = "";

    const chartBody = $("#chart-body");
    if (chartBody) {
      chartBody.innerHTML =
        '<p class="chart-empty">Pulsa «Regar» para ver la comparación.</p>';
    }
  }

  /* ═══ TRANSPORTE ═══ */
  $("#btn-run").onclick = () => {
    if (state.mode === "memory") return;
    if (!state.results) prepareRun();
    if (state.clock >= state.maxTick) renderSchedulingAt(0);
    state.running = true;
    $("#btn-run").disabled = true;
    $("#btn-pause").disabled = false;
    if (state.timerId) clearInterval(state.timerId);
    startTicker();
  };

  $("#btn-pause").onclick = () => {
    pauseTicker();
    narrate("Simulación pausada. Pulsa «Regar» para continuar.");
  };

  $("#btn-step").onclick = () => {
    if (state.mode === "memory") {
      memStep();
      return;
    }
    if (!state.results) prepareRun();
    pauseTicker();
    if (state.clock < state.maxTick) renderSchedulingAt(state.clock + 1);
    narrate(
      "Tick manual: T+" + state.clock + ". Pulsa «Paso» otra vez o «Regar».",
    );
  };

  $("#btn-reset").onclick = () => {
    softReset();
    if (state.mode === "memory") initMemory();
    narrate("Todo reiniciado a T+000.");
  };

  /* ═══ SCRUBBER ═══ */
  $("#scrubber").oninput = (e) => {
    if (state.mode === "memory") return;
    if (!state.results) prepareRun();
    pauseTicker();
    renderSchedulingAt(+e.target.value);
  };

  /* ═══ PESTAÑAS DEL GRÁFICO ═══ */
  $$(".chart-tab").forEach((tab) => {
    tab.onclick = () => {
      $$(".chart-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      state.chartMetric = tab.dataset.metric;
      state.chartLabel = tab.dataset.label;
      state.chartMode = tab.dataset.mode;
      renderComparisonChart();
    };
  });

  /* ═══ MEMORIA ═══ */
  const memState = {
    fifo: null,
    lru: null,
    optimo: null,
    stepIndex: 0,
    chain: MEM_CHAIN.slice(),
    frames: MEM_FRAMES,
  };

  function parseChain(str) {
    return String(str)
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .map((n) => Math.floor(n));
  }

  function randomChain() {
    const len = 10 + Math.floor(Math.random() * 5);
    const distinct = 3 + Math.floor(Math.random() * 3);
    const chain = [];
    for (let i = 0; i < len; i++)
      chain.push(1 + Math.floor(Math.random() * distinct));
    return chain;
  }

  function syncMemoryInputs() {
    const chainInput = $("#memory-chain-input");
    const framesInput = $("#memory-frames-input");
    const chainDisplay = $("#memory-chain-display");
    const framesDisplay = $("#memory-frames-display");

    if (chainInput) chainInput.value = memState.chain.join(", ");
    if (framesInput) framesInput.value = memState.frames;
    if (chainDisplay)
      chainDisplay.textContent = "[" + memState.chain.join(",") + "]";
    if (framesDisplay) framesDisplay.textContent = memState.frames;
  }

  function initMemory() {
    memState.fifo = Algorithms.runFIFO(memState.chain, memState.frames);
    memState.lru = Algorithms.runLRU(memState.chain, memState.frames);
    memState.optimo = Algorithms.runOptimo(memState.chain, memState.frames);
    memState.stepIndex = 0;
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
      "Modo memoria listo. Pulsa «Paso» para ver las páginas entrar en las canastas.",
    );
  }

  function memStep() {
    if (!memState.fifo) initMemory();
    if (memState.stepIndex >= memState.chain.length) {
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

  $("#btn-mem-apply").onclick = () => {
    const chain = parseChain($("#memory-chain-input").value);
    const frames = Math.max(
      1,
      Math.min(8, +$("#memory-frames-input").value || MEM_FRAMES),
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
      `Cadena aplicada: ${chain.join(", ")} · ${frames} canastas. Pulsa «Paso».`,
    );
  };

  $("#btn-mem-random").onclick = () => {
    memState.chain = randomChain();
    memState.frames = MEM_FRAMES;
    initMemory();
    narrate("Cadena aleatoria generada. Pulsa «Paso» para verla entrar.");
  };

  $("#btn-mem-scenario").onclick = () => {
    memState.chain = MEM_CHAIN.slice();
    memState.frames = MEM_FRAMES;
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
    $("#scrubber-bar").classList.toggle("hidden", isMem);

    $(".bottom-panel").classList.toggle("memory-mode", isMem);

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

  /* ═══ TEMA ═══ */
  function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    const btn = $("#theme-toggle");
    if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark");
    narrate(
      state.theme === "dark"
        ? "Modo oscuro activado. 🌙"
        : "Modo claro activado. ☀️",
    );
  }

  $("#theme-toggle").onclick = toggleTheme;

  /* ═══ AYUDA ═══ */
  function toggleHelp(force) {
    const modal = $("#help-modal");
    const isHidden = modal.classList.contains("hidden");
    const show = force != null ? force : isHidden;
    modal.classList.toggle("hidden", !show);
  }
  $("#help-toggle").onclick = () => toggleHelp();
  $$("[data-role='modal-close']").forEach((el) => {
    el.addEventListener("click", () => toggleHelp(false));
  });

  /* ═══ TOOLTIP FLOTANTE ═══ */
  let activeTip = null;

  function hideFloatingTip() {
    if (activeTip) {
      activeTip.remove();
      activeTip = null;
    }
  }

  function showFloatingTip(target, text) {
    hideFloatingTip();
    const tip = document.createElement("div");
    tip.className = "floating-tip";
    tip.textContent = text;
    document.body.appendChild(tip);
    activeTip = tip;

    const r = target.getBoundingClientRect();
    tip.style.left = r.left + r.width / 2 + "px";
    tip.style.top = r.top - 10 + "px";
    tip.style.transform = "translate(-50%, -100%)";

    requestAnimationFrame(() => {
      const tr = tip.getBoundingClientRect();
      if (tr.top < 8) {
        tip.style.top = r.bottom + 10 + "px";
        tip.style.transform = "translate(-50%, 0)";
      }
    });
  }

  function wireTooltips() {
    document.querySelectorAll(".garden-card-header h3").forEach((h3) => {
      const src = h3.querySelector("[data-tooltip]");
      if (!src) return;
      const text = src.dataset.tooltip;
      h3.style.cursor = "help";
      h3.addEventListener("mouseenter", () => showFloatingTip(h3, text));
      h3.addEventListener("mouseleave", hideFloatingTip);
    });
    document.querySelectorAll("[data-tooltip]").forEach((el) => {
      if (el.closest(".garden-card-header h3")) return;
      el.addEventListener("mouseenter", () =>
        showFloatingTip(el, el.dataset.tooltip),
      );
      el.addEventListener("mouseleave", hideFloatingTip);
    });
    window.addEventListener("scroll", hideFloatingTip, { passive: true });
    window.addEventListener("resize", hideFloatingTip);
  }

  /* ═══ ATAJOS ═══ */
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const inField =
      tag === "input" || tag === "textarea" || e.target.isContentEditable;

    if (e.key === "Escape") {
      toggleHelp(false);
      hideFloatingTip();
      return;
    }
    if (e.key === "?" && !inField) {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (inField) return;

    switch (e.key) {
      case " ":
        e.preventDefault();
        if (state.mode === "memory") $("#btn-step").click();
        else if (state.running) $("#btn-pause").click();
        else $("#btn-run").click();
        break;
      case "ArrowRight":
        e.preventDefault();
        $("#btn-step").click();
        break;
      case "ArrowLeft":
        e.preventDefault();
        stepBack();
        break;
      case "r":
      case "R":
        $("#btn-reset").click();
        break;
      case "d":
      case "D":
        toggleTheme();
        break;
      case "m":
      case "M":
        $("#mode-toggle").click();
        break;
      case "1":
      case "2":
      case "3":
      case "4":
      case "5": {
        const idx = +e.key - 1;
        if (state.mode === "memory") return;
        const card = document.querySelectorAll(".garden-card")[idx];
        if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
  });

  /* ═══ BOOTSTRAP ═══ */
  document.addEventListener("DOMContentLoaded", () => {
    let savedTheme = "light";
    try {
      savedTheme = localStorage.getItem(THEME_KEY) || "light";
    } catch (_) {}
    applyTheme(savedTheme);

    renderProcessList();
    syncMemoryInputs();
    wireTooltips();
    narrate("Pulsa «Regar» para empezar. Pulsa «?» para ver los atajos.");
  });
})();
