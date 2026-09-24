/* ═══════════════════════════════════════════════════════════════════════════
 * main.js · Orquestador Multi-Grid (v3)
 *   • isFinished independiente por panel
 *   • Al finalizar: badge → FINALIZADO, socket vacío, métricas congeladas
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  if (!global.Algorithms) {
    console.error("[main.js] Algorithms no disponible.");
    return;
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const ALGO_KEYS = ["FCFS", "SJF", "SRTF", "RR", "PRIORITY"];

  const sim = {
    running: false,
    currentTick: 0,
    speed: 5,
    quantum: 2,
    mode: "sim",
    processes: [],
    panels: {},
    timer: null,
    maxTimelineLen: 0,
  };

  let chart = null;

  /* ═══════════════════════════════════════════════════════════════
   * UI HELPERS
   * ═══════════════════════════════════════════════════════════════ */
  function setRunState(key) {
    const el = $("#run-state");
    if (!el) return;
    const labels = { idle: "IDLE", running: "RUNNING", paused: "PAUSED" };
    el.textContent = labels[key] || key;
    el.className = `state-${key}`;
  }

  function updateClock(t) {
    const el = $("#clock-display");
    if (el) el.textContent = `T+${String(t).padStart(3, "0")}`;
  }

  function showError(msg) {
    const box = $("#form-error");
    const txt = $("#form-error-text");
    if (!box || !txt) return;
    txt.textContent = msg;
    box.classList.remove("hidden");
    setTimeout(() => box.classList.add("hidden"), 3800);
  }

  function showToast(msg, type) {
    const cont = $("#toast-container");
    if (!cont) return;
    const el = document.createElement("div");
    el.className = `toast toast-${type || "info"}`;
    el.textContent = msg;
    cont.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 320);
    }, 2400);
  }

  /* ═══════════════════════════════════════════════════════════════
   * PROCESS MANAGEMENT
   * ═══════════════════════════════════════════════════════════════ */
  function getRows() {
    return $$(".process-row-compact");
  }

  function readProcesses() {
    const rows = getRows();
    const list = [];
    const used = new Set();
    rows.forEach((row, i) => {
      let pid = `P${i + 1}`;
      while (used.has(pid)) pid += "_";
      used.add(pid);
      row.dataset.pid = pid;
      const badge = row.querySelector('[data-role="badge"]');
      if (badge) badge.textContent = pid;
      list.push({
        pid,
        arrival:
          parseInt(row.querySelector('[data-role="arrival"]')?.value, 10) || 0,
        burst:
          parseInt(row.querySelector('[data-role="burst"]')?.value, 10) || 1,
        priority:
          parseInt(row.querySelector('[data-role="priority"]')?.value, 10) || 1,
      });
    });
    return list;
  }

  function setProcesses(list) {
    const cont = $("#process-list");
    const tpl = $("#process-row-template");
    if (!cont || !tpl) return;
    cont.querySelectorAll(".process-row-compact").forEach((el) => el.remove());
    list.forEach((p, i) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.pid = p.pid || `P${i + 1}`;
      node.querySelector('[data-role="badge"]').textContent =
        p.pid || `P${i + 1}`;
      node.querySelector('[data-role="arrival"]').value = p.arrival ?? 0;
      node.querySelector('[data-role="burst"]').value = p.burst ?? 1;
      node.querySelector('[data-role="priority"]').value = p.priority ?? 1;
      wireRow(node);
      cont.appendChild(node);
    });
    updateCount();
  }

  function wireRow(row) {
    const rm = row.querySelector('[data-role="remove"]');
    if (rm && !rm._wired) {
      rm.addEventListener("click", () => {
        if (getRows().length <= 1) {
          showError("Debe existir al menos un proceso.");
          return;
        }
        row.remove();
        updateCount();
        resetSimulation();
      });
      rm._wired = true;
    }
  }

  function updateCount() {
    const el = $("#process-count");
    if (el) el.textContent = String(getRows().length);
  }

  function addRow() {
    const cont = $("#process-list");
    const tpl = $("#process-row-template");
    if (!cont || !tpl) return;
    if (getRows().length >= 8) {
      showError("Máximo 8 procesos.");
      return;
    }
    const n = getRows().length + 1;
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('[data-role="badge"]').textContent = `P${n}`;
    node.querySelector('[data-role="arrival"]').value = 0;
    node.querySelector('[data-role="burst"]').value = (n % 4) + 2;
    node.querySelector('[data-role="priority"]').value = 1;
    wireRow(node);
    cont.appendChild(node);
    updateCount();
  }

  function randomize() {
    const cont = $("#process-list");
    const tpl = $("#process-row-template");
    if (!cont || !tpl) return;
    cont.querySelectorAll(".process-row-compact").forEach((el) => el.remove());
    for (let i = 0; i < 4; i++) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.querySelector('[data-role="badge"]').textContent = `P${i + 1}`;
      node.querySelector('[data-role="arrival"]').value = Math.floor(
        Math.random() * 3,
      );
      node.querySelector('[data-role="burst"]').value = randInt(2, 8);
      node.querySelector('[data-role="priority"]').value = randInt(1, 5);
      wireRow(node);
      cont.appendChild(node);
    }
    updateCount();
    resetSimulation();
  }

  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }

  /* ═══════════════════════════════════════════════════════════════
   * PREPARE
   * ═══════════════════════════════════════════════════════════════ */
  function prepareAll() {
    const processes = readProcesses();
    const errs = global.Algorithms.validateProcesses(processes);
    if (errs.length > 0) {
      showError(errs[0]);
      return false;
    }

    sim.processes = processes;
    sim.panels = {};
    sim.maxTimelineLen = 0;

    ALGO_KEYS.forEach((algo) => {
      let result;
      try {
        result = global.Algorithms.simulate(algo, processes, {
          quantum: sim.quantum,
        });
      } catch (e) {
        console.error(`[main.js] ${algo}:`, e);
        return;
      }

      sim.maxTimelineLen = Math.max(sim.maxTimelineLen, result.timeline.length);

      let scene = global.Render3D && global.Render3D.getScene(algo);
      if (!scene)
        scene = global.Render3D.createScene(algo, $(`[data-canvas="${algo}"]`));
      if (scene) {
        scene.reset();
        processes.forEach((p) => scene.registerProcess(p));
      }

      sim.panels[algo] = {
        result,
        scene,
        tick: 0,
        prevRunning: null,
        busyTicks: 0,
        ctxSwitches: 0,
        isFinished: false,
      };

      setPanelState(algo, "running");
      updatePanelMetrics(algo, 0, 0, 0, 0);
      setPanelProgress(algo, 0);
    });

    resetChartSeries();
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
   * PLAYBACK
   * ═══════════════════════════════════════════════════════════════ */
  function delayForSpeed(s) {
    return Math.round(1200 - (Math.max(1, Math.min(10, s)) - 1) * 120);
  }

  function playSimulation() {
    if (sim.running) return;
    if (!prepareAll()) return;
    sim.running = true;
    sim.currentTick = 0;
    setRunState("running");
    updateButtons();
    scheduleNextTick();
  }

  function pauseSimulation() {
    sim.running = false;
    if (sim.timer) {
      clearTimeout(sim.timer);
      sim.timer = null;
    }
    setRunState("paused");
    updateButtons();
  }

  function stepSimulation() {
    if (sim.running) return;
    if (!prepareAll()) return;
    advanceAll();
    updateButtons();
  }

  function resetSimulation() {
    sim.running = false;
    if (sim.timer) {
      clearTimeout(sim.timer);
      sim.timer = null;
    }
    sim.currentTick = 0;
    sim.panels = {};
    if (global.Render3D) {
      ALGO_KEYS.forEach((algo) => {
        const sc = global.Render3D.getScene(algo);
        if (sc) sc.reset();
        setPanelState(algo, "idle");
        updatePanelMetrics(algo, 0, 0, 0, 0);
        setPanelProgress(algo, 0);
      });
    }
    updateClock(0);
    setRunState("idle");
    resetChartSeries();
    updateButtons();
  }

  function scheduleNextTick() {
    if (!sim.running) return;
    sim.timer = setTimeout(() => {
      sim.timer = null;
      const more = advanceAll();
      if (more && sim.running) scheduleNextTick();
      else {
        sim.running = false;
        setRunState("idle");
        updateButtons();
      }
    }, delayForSpeed(sim.speed));
  }

  function advanceAll() {
    let anyActive = false;
    let maxTick = 0;

    ALGO_KEYS.forEach((algo) => {
      const p = sim.panels[algo];
      if (!p || !p.result) return;

      if (p.isFinished) {
        maxTick = Math.max(maxTick, p.tick);
        return;
      }

      const timeline = p.result.timeline;

      if (p.tick >= timeline.length) {
        freezePanel(algo);
        maxTick = Math.max(maxTick, p.tick);
        return;
      }

      const frame = timeline[p.tick];

      if (p.scene) {
        p.scene.syncState({
          running: frame.pid,
          ready: frame.ready,
          completed: frame.completed,
          prevRunning: p.prevRunning,
        });
      }
      p.prevRunning = frame.pid;

      p.tick++;
      if (frame.pid !== null) p.busyTicks++;
      if (frame.contextSwitch) p.ctxSwitches++;

      const live = computeLiveMetrics(p);
      const util = p.tick > 0 ? (p.busyTicks / p.tick) * 100 : 0;
      updatePanelMetrics(algo, live.avgWT, live.avgTAT, util, p.ctxSwitches);
      setPanelProgress(algo, (p.tick / timeline.length) * 100);

      if (p.tick >= timeline.length) {
        freezePanel(algo);
      } else {
        anyActive = true;
      }

      maxTick = Math.max(maxTick, p.tick);
    });

    sim.currentTick = maxTick;
    updateClock(maxTick);
    pushChartPointAll();

    return anyActive;
  }

  function freezePanel(algo) {
    const p = sim.panels[algo];
    if (!p || p.isFinished) return;
    p.isFinished = true;

    setPanelState(algo, "finished");
    setPanelProgress(algo, 100);

    const m = p.result.metrics;
    updatePanelMetrics(
      algo,
      m.avgWaiting,
      m.avgTurnaround,
      m.cpuUtilization * 100,
      m.contextSwitches,
    );

    if (p.scene) {
      p.scene.syncState({
        running: null,
        ready: [],
        completed: m.perProcess.map((x) => x.pid),
        prevRunning: p.prevRunning,
      });
      p.scene.markIdle();
    }
    p.prevRunning = null;
  }

  function computeLiveMetrics(p) {
    const per = p.result.metrics.perProcess;
    let sumWT = 0,
      sumTAT = 0,
      count = 0;

    for (const proc of per) {
      if (proc.completion != null && p.tick >= proc.completion) {
        sumWT += proc.waiting;
        sumTAT += proc.turnaround;
        count++;
      } else if (proc.start != null && p.tick >= proc.start) {
        const elapsed = Math.min(p.tick - proc.start, proc.burst);
        const remaining = proc.burst - elapsed;
        const waitSoFar = Math.max(0, proc.start - proc.arrival);
        sumWT += waitSoFar + remaining;
        sumTAT += waitSoFar + proc.burst;
        count++;
      } else if (p.tick >= proc.arrival) {
        const waitSoFar = p.tick - proc.arrival;
        sumWT += waitSoFar + proc.burst;
        sumTAT += waitSoFar + proc.burst;
        count++;
      }
    }

    return {
      avgWT: count > 0 ? sumWT / count : 0,
      avgTAT: count > 0 ? sumTAT / count : 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════════
   * PANEL UI
   * ═══════════════════════════════════════════════════════════════ */
  function getPanelEl(algo) {
    return document.querySelector(`.algo-card[data-algo="${algo}"]`);
  }

  function setPanelState(algo, stateKey) {
    const card = getPanelEl(algo);
    if (!card) return;
    const badge = card.querySelector('[data-role="state"]');
    card.classList.remove("is-running", "is-finished");
    if (stateKey === "running") card.classList.add("is-running");
    if (stateKey === "finished") card.classList.add("is-finished");
    if (badge) {
      badge.classList.remove("is-running", "is-finished");
      if (stateKey === "running") {
        badge.textContent = "EJECUTANDO";
        badge.classList.add("is-running");
      } else if (stateKey === "finished") {
        badge.textContent = "FINALIZADO";
        badge.classList.add("is-finished");
      } else {
        badge.textContent = "IDLE";
      }
    }
  }

  function updatePanelMetrics(algo, wt, tat, cpu) {
    const card = getPanelEl(algo);
    if (!card) return;
    const wtEl = card.querySelector('[data-role="wt"]');
    const tatEl = card.querySelector('[data-role="tat"]');
    const cpuEl = card.querySelector('[data-role="cpu"]');
    if (wtEl) wtEl.textContent = Number(wt).toFixed(2);
    if (tatEl) tatEl.textContent = Number(tat).toFixed(2);
    if (cpuEl) cpuEl.textContent = Math.round(cpu) + "%";
  }

  function setPanelProgress(algo, pct) {
    const card = getPanelEl(algo);
    if (!card) return;
    const bar = card.querySelector('[data-role="progress"]');
    if (bar) bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
  }

  /* ═══════════════════════════════════════════════════════════════
   * COMPARISON TABLE
   * ═══════════════════════════════════════════════════════════════ */
  function populateComparisonTable() {
    const body = $("#comparison-body");
    if (!body) return;
    body.innerHTML = "";
    ALGO_KEYS.forEach((algo) => {
      const p = sim.panels[algo];
      if (!p || !p.result) return;
      const m = p.result.metrics;
      const tr = document.createElement("tr");
      tr.dataset.algo = algo;
      tr.innerHTML = `
        <td style="font-weight:700;color:var(--neon)">${algo}</td>
        <td class="text-right">${m.avgWaiting.toFixed(2)}</td>
        <td class="text-right">${m.avgTurnaround.toFixed(2)}</td>
        <td class="text-right">${(m.cpuUtilization * 100).toFixed(0)}%</td>
        <td class="text-right">${m.contextSwitches}</td>
        <td class="text-center">
          <span class="badge-starvation ${m.starvation.risk ? "risk-yes" : "risk-no"}">
            ${m.starvation.risk ? "SÍ" : "NO"}
          </span>
        </td>
      `;
      body.appendChild(tr);
    });
    highlightBestRow();
  }

  function highlightBestRow() {
    const body = $("#comparison-body");
    if (!body) return;
    const rows = Array.from(body.querySelectorAll("tr[data-algo]"));
    if (rows.length === 0) return;
    const values = rows.map((r) => parseFloat(r.children[1].textContent));
    const min = Math.min(...values);
    rows.forEach((r, i) => r.classList.toggle("row-best", values[i] === min));
  }

  /* ═══════════════════════════════════════════════════════════════
   * CHART
   * ═══════════════════════════════════════════════════════════════ */
  function initChart() {
    const cv = $("#cpu-chart");
    if (!cv || typeof Chart === "undefined") return;
    const colors = {
      FCFS: "#00f3ff",
      SJF: "#39ff14",
      SRTF: "#ffb300",
      RR: "#a855f7",
      PRIORITY: "#ff0055",
    };

    chart = new Chart(cv.getContext("2d"), {
      type: "line",
      data: {
        labels: [],
        datasets: ALGO_KEYS.map((algo) => ({
          label: algo,
          data: [],
          borderColor: colors[algo],
          backgroundColor: colors[algo] + "22",
          tension: 0.35,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              color: "#8896a8",
              font: { size: 9, family: "JetBrains Mono" },
              boxWidth: 10,
              boxHeight: 10,
            },
          },
          tooltip: {
            backgroundColor: "rgba(11,15,25,0.95)",
            borderColor: "#00f3ff",
            borderWidth: 1,
            titleColor: "#00f3ff",
            bodyColor: "#cbd5e1",
          },
        },
        scales: {
          x: {
            grid: { color: "rgba(30,42,58,0.5)" },
            ticks: { color: "#556377", font: { size: 9 }, maxTicksLimit: 12 },
          },
          y: {
            grid: { color: "rgba(30,42,58,0.5)" },
            ticks: { color: "#556377", font: { size: 9 } },
          },
        },
      },
    });
  }

  function resetChartSeries() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets.forEach((ds) => (ds.data = []));
    chart.update("none");
  }

  function pushChartPointAll() {
    if (!chart) return;
    chart.data.labels.push(String(sim.currentTick));
    ALGO_KEYS.forEach((algo, i) => {
      const p = sim.panels[algo];
      if (!p) {
        chart.data.datasets[i].data.push(null);
        return;
      }
      const m = computeLiveMetrics(p);
      chart.data.datasets[i].data.push(m.avgWT);
    });
    const MAX = 300;
    if (chart.data.labels.length > MAX) {
      chart.data.labels.shift();
      chart.data.datasets.forEach((ds) => ds.data.shift());
    }
    chart.update("none");
  }

  /* ═══════════════════════════════════════════════════════════════
   * MODOS
   * ═══════════════════════════════════════════════════════════════ */
  function setMode(mode) {
    sim.mode = mode;
    $$(".mode-btn").forEach((btn) =>
      btn.classList.toggle("is-active", btn.dataset.mode === mode),
    );
    pauseSimulation();
    resetSimulation();

    const ov = $("#starvation-overlay");
    if (ov) ov.classList.remove("is-visible");
    document
      .querySelectorAll(".is-starving")
      .forEach((el) => el.classList.remove("is-starving"));

    switch (mode) {
      case "sim":
        if (global.GameAPI) {
          global.GameAPI.stopChallenge();
          global.GameAPI.stopStarvation();
          global.GameAPI.stopTrivia();
        }
        break;
      case "challenge":
        if (global.GameAPI) global.GameAPI.startChallenge();
        break;
      case "starvation":
        if (global.GameAPI) global.GameAPI.startStarvation();
        break;
      case "trivia":
        if (global.GameAPI) global.GameAPI.startTrivia();
        break;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * BUTTONS
   * ═══════════════════════════════════════════════════════════════ */
  function updateButtons() {
    const run = $("#btn-run"),
      pause = $("#btn-pause"),
      step = $("#btn-step"),
      reset = $("#btn-reset");
    if (run) run.disabled = sim.running;
    if (pause) pause.disabled = !sim.running;
    if (step) step.disabled = sim.running;
    if (reset) reset.disabled = false;
  }

  /* ═══════════════════════════════════════════════════════════════
   * WIRING
   * ═══════════════════════════════════════════════════════════════ */
  function wireEvents() {
    const runBtn = $("#btn-run");
    if (runBtn) runBtn.addEventListener("click", playSimulation);
    const pauseBtn = $("#btn-pause");
    if (pauseBtn) pauseBtn.addEventListener("click", pauseSimulation);
    const stepBtn = $("#btn-step");
    if (stepBtn) stepBtn.addEventListener("click", stepSimulation);
    const resetBtn = $("#btn-reset");
    if (resetBtn) resetBtn.addEventListener("click", resetSimulation);

    const speed = $("#speed-range");
    const speedLbl = $("#speed-label");
    if (speed) {
      speed.addEventListener("input", () => {
        sim.speed = parseInt(speed.value, 10) || 5;
        if (speedLbl) speedLbl.textContent = sim.speed + "x";
      });
    }

    $$(".mode-btn").forEach((btn) =>
      btn.addEventListener("click", () => setMode(btn.dataset.mode)),
    );

    const addBtn = $("#btn-add-process");
    if (addBtn) addBtn.addEventListener("click", addRow);
    const randBtn = $("#btn-randomize");
    if (randBtn) randBtn.addEventListener("click", randomize);
    const scenBtn = $("#btn-load-scenario");
    if (scenBtn) scenBtn.addEventListener("click", () => setMode("starvation"));

    const q = $("#quantum-input");
    if (q) {
      q.addEventListener("change", () => {
        sim.quantum = Math.max(1, Math.min(10, parseInt(q.value, 10) || 2));
        q.value = sim.quantum;
        resetSimulation();
      });
    }

    const cmpBtn = $("#btn-compare-all");
    if (cmpBtn)
      cmpBtn.addEventListener("click", () => {
        if (!prepareAll()) return;
        ALGO_KEYS.forEach((algo) => {
          const p = sim.panels[algo];
          if (!p) return;
          p.tick = p.result.timeline.length;
          p.busyTicks = Math.round(
            p.result.metrics.cpuUtilization * p.result.timeline.length,
          );
          freezePanel(algo);
        });
        sim.currentTick = sim.maxTimelineLen;
        updateClock(sim.currentTick);
        populateComparisonTable();
        showToast("Comparativa recalculada.", "success");
      });

    const list = $("#process-list");
    if (list) {
      list.addEventListener("change", () => {
        if (!sim.running) resetSimulation();
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * BOOTSTRAP
   * ═══════════════════════════════════════════════════════════════ */
  function bootstrap() {
    if (getRows().length === 0) {
      setProcesses([
        { pid: "P1", arrival: 0, burst: 7, priority: 2 },
        { pid: "P2", arrival: 2, burst: 4, priority: 4 },
        { pid: "P3", arrival: 4, burst: 1, priority: 1 },
        { pid: "P4", arrival: 5, burst: 4, priority: 3 },
      ]);
    }

    if (global.Render3D) global.Render3D.init();

    ALGO_KEYS.forEach((algo) => {
      const container = document.querySelector(`[data-canvas="${algo}"]`);
      if (container && global.Render3D)
        global.Render3D.createScene(algo, container);
    });

    initChart();
    wireEvents();

    const sp = $("#speed-range");
    if (sp) sim.speed = parseInt(sp.value, 10) || 5;
    const spl = $("#speed-label");
    if (spl) spl.textContent = sim.speed + "x";

    setRunState("idle");
    updateButtons();
    updateCount();
    updateClock(0);

    setTimeout(
      () => showToast("5 simulaciones listas · Pulsa RUN ALL", "info"),
      500,
    );

    window.addEventListener("resize", () => {
      if (global.Render3D) global.Render3D.resize();
    });
  }

  global.MainAPI = {
    playSimulation,
    pauseSimulation,
    stepSimulation,
    resetSimulation,
    setProcesses,
    readProcesses,
    setMode,
    getState: () => sim,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})(typeof window !== "undefined" ? window : globalThis);
