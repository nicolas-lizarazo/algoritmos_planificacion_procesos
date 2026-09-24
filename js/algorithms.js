/* ═══════════════════════════════════════════════════════════════════════════
 * algorithms.js · Núcleo de Planificación (v3)
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  const ALGORITHMS = Object.freeze({
    FCFS: "FCFS",
    SJF: "SJF",
    SRTF: "SRTF",
    RR: "RR",
    PRIORITY: "PRIORITY",
  });

  const MAX_TICKS = 100000;

  function clampInt(v, min, max, fb) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return fb;
    return Math.max(min, Math.min(max, n));
  }

  function prepareProcesses(processes) {
    if (!Array.isArray(processes)) return [];
    const used = new Set();
    return processes.map((raw, i) => {
      let pid =
        (raw && raw.pid != null ? String(raw.pid) : `P${i + 1}`).trim() ||
        `P${i + 1}`;
      while (used.has(pid)) pid += "_";
      used.add(pid);
      const p = {
        pid,
        order: i,
        arrival: clampInt(raw && raw.arrival, 0, 9999, 0),
        burst: clampInt(raw && raw.burst, 1, 9999, 1),
        priority: clampInt(raw && raw.priority, 0, 9999, 0),
        remaining: 0,
        firstRun: null,
        completion: null,
      };
      p.remaining = p.burst;
      return p;
    });
  }

  function validateProcesses(list) {
    const errs = [];
    if (!Array.isArray(list) || list.length === 0) {
      errs.push("Debe existir al menos un proceso.");
      return errs;
    }
    list.forEach((p, i) => {
      const t = `Proceso ${i + 1}`;
      if (p.arrival == null || Number(p.arrival) < 0)
        errs.push(`${t}: tiempo de llegada inválido.`);
      if (p.burst == null || Number(p.burst) < 1)
        errs.push(`${t}: ráfaga inválida.`);
      if (p.priority == null || Number(p.priority) < 0)
        errs.push(`${t}: prioridad inválida.`);
    });
    return errs;
  }

  function makeNonPreemptivePick(cmp) {
    return function pick(state) {
      if (state.current && state.current.remaining > 0)
        return state.current.pid;
      if (state.readyQueue.length === 0) return null;
      let best = null;
      for (const pid of state.readyQueue) {
        const p = state.procs.find((x) => x.pid === pid);
        if (!p) continue;
        if (best === null || cmp(p, best) < 0) best = p;
      }
      return best ? best.pid : null;
    };
  }

  const cmpFCFS = (a, b) => a.arrival - b.arrival || a.order - b.order;
  const cmpSJF = (a, b) =>
    a.burst - b.burst || a.arrival - b.arrival || a.order - b.order;
  const cmpPriority = (a, b) =>
    b.priority - a.priority || a.arrival - b.arrival || a.order - b.order;

  function srtfPick(state) {
    const cands = state.readyQueue.slice();
    if (state.current && state.current.remaining > 0)
      cands.push(state.current.pid);
    if (cands.length === 0) return null;
    let best = null;
    for (const pid of cands) {
      const p = state.procs.find((x) => x.pid === pid);
      if (!p) continue;
      if (
        best === null ||
        p.remaining < best.remaining ||
        (p.remaining === best.remaining && p.arrival < best.arrival) ||
        (p.remaining === best.remaining &&
          p.arrival === best.arrival &&
          p.order < best.order)
      ) {
        best = p;
      }
    }
    return best ? best.pid : null;
  }

  function runGenericSimulation(procs, pickFn, algorithm, quantum) {
    const n = procs.length;
    if (n === 0) return finalize(procs, [], 0, algorithm, quantum, 0);
    const timeline = [],
      readyQueue = [],
      arrived = new Set(),
      finished = new Set();
    let current = null,
      lastPid = null,
      ctxSw = 0,
      completed = 0,
      time = 0;

    while (completed < n && time < MAX_TICKS) {
      for (let i = 0; i < n; i++) {
        const p = procs[i];
        if (p.arrival === time && !arrived.has(p.pid)) {
          arrived.add(p.pid);
          readyQueue.push(p.pid);
        }
      }
      const cands = readyQueue.slice();
      if (current && current.remaining > 0) cands.push(current.pid);
      const pick = pickFn({
        procs,
        readyQueue,
        candidates: cands,
        current,
        time,
      });
      if (current && current.remaining > 0 && current.pid !== pick) {
        readyQueue.push(current.pid);
        current = null;
      }
      if (pick !== null) {
        const ix = readyQueue.indexOf(pick);
        if (ix >= 0) readyQueue.splice(ix, 1);
      }
      const ctxSwitch = pick !== null && pick !== lastPid;
      if (ctxSwitch) ctxSw++;
      timeline.push({
        tick: time,
        pid: pick,
        ready: readyQueue.slice(),
        completed: Array.from(finished),
        contextSwitch: ctxSwitch,
      });
      if (pick !== null) {
        const p = procs.find((x) => x.pid === pick);
        if (p) {
          if (p.firstRun === null) p.firstRun = time;
          p.remaining--;
          if (p.remaining <= 0) {
            p.completion = time + 1;
            finished.add(p.pid);
            completed++;
            current = null;
          } else current = p;
        }
      } else current = null;
      lastPid = pick;
      time++;
    }
    return finalize(procs, timeline, ctxSw, algorithm, quantum, time);
  }

  function runRoundRobin(procs, quantumInput) {
    const quantum = Math.max(1, clampInt(quantumInput, 1, 9999, 2));
    const n = procs.length;
    if (n === 0) return finalize(procs, [], 0, ALGORITHMS.RR, quantum, 0);
    const timeline = [],
      readyQueue = [],
      arrived = new Set(),
      finished = new Set();
    let current = null,
      quantumUsed = 0,
      lastPid = null,
      ctxSw = 0,
      completed = 0,
      time = 0;

    while (completed < n && time < MAX_TICKS) {
      for (let i = 0; i < n; i++) {
        const p = procs[i];
        if (p.arrival === time && !arrived.has(p.pid)) {
          arrived.add(p.pid);
          readyQueue.push(p.pid);
        }
      }
      if (current && quantumUsed >= quantum) {
        if (readyQueue.length > 0) {
          readyQueue.push(current.pid);
          current = null;
          quantumUsed = 0;
        } else quantumUsed = 0;
      }
      if (!current && readyQueue.length > 0) {
        const pid = readyQueue.shift();
        current = procs.find((x) => x.pid === pid) || null;
        quantumUsed = 0;
      }
      const pick = current ? current.pid : null;
      const ctxSwitch = pick !== null && pick !== lastPid;
      if (ctxSwitch) ctxSw++;
      timeline.push({
        tick: time,
        pid: pick,
        ready: readyQueue.slice(),
        completed: Array.from(finished),
        contextSwitch: ctxSwitch,
      });
      if (current) {
        if (current.firstRun === null) current.firstRun = time;
        current.remaining--;
        quantumUsed++;
        if (current.remaining <= 0) {
          current.completion = time + 1;
          finished.add(current.pid);
          completed++;
          current = null;
          quantumUsed = 0;
        }
      }
      lastPid = pick;
      time++;
    }
    return finalize(procs, timeline, ctxSw, ALGORITHMS.RR, quantum, time);
  }

  function finalize(procs, timeline, ctxSw, algorithm, quantum, totalTime) {
    const n = procs.length;
    const perProcess = procs.map((p) => {
      const completion = p.completion != null ? p.completion : totalTime;
      const firstRun = p.firstRun != null ? p.firstRun : totalTime;
      const turnaround = completion - p.arrival;
      const waiting = turnaround - p.burst;
      const response = firstRun - p.arrival;
      return {
        pid: p.pid,
        arrival: p.arrival,
        burst: p.burst,
        priority: p.priority,
        start: p.firstRun,
        completion: p.completion,
        turnaround,
        waiting,
        response,
        order: p.order,
      };
    });

    const sum = (k) => perProcess.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const avgWaiting = n > 0 ? sum("waiting") / n : 0;
    const avgTurnaround = n > 0 ? sum("turnaround") / n : 0;
    const avgResponse = n > 0 ? sum("response") / n : 0;

    let busy = 0;
    for (const f of timeline) if (f.pid !== null) busy++;
    const cpuUtilization = totalTime > 0 ? busy / totalTime : 0;
    const throughput = totalTime > 0 ? n / totalTime : 0;
    const maxWait = n > 0 ? Math.max(...perProcess.map((p) => p.waiting)) : 0;
    const maxResponse =
      n > 0 ? Math.max(...perProcess.map((p) => p.response)) : 0;

    const threshold = Math.max(avgWaiting * 2.5, 12);
    const starving = perProcess.filter(
      (p) => p.waiting > threshold && p.waiting > 5,
    );

    return {
      algorithm,
      quantum: algorithm === ALGORITHMS.RR ? quantum : null,
      timeline,
      gantt: buildGantt(timeline),
      metrics: {
        perProcess,
        avgWaiting,
        avgTurnaround,
        avgResponse,
        cpuUtilization,
        throughput,
        contextSwitches: ctxSw,
        totalTime,
        processCount: n,
        maxWait,
        maxResponse,
        starvation: {
          risk: starving.length > 0,
          processes: starving.map((p) => p.pid),
          maxWait,
          threshold,
        },
      },
    };
  }

  function buildGantt(timeline) {
    if (!timeline || timeline.length === 0) return [];
    const out = [];
    let start = 0,
      pid = timeline[0].pid;
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].pid !== pid) {
        out.push({ pid, start, end: i, duration: i - start });
        start = i;
        pid = timeline[i].pid;
      }
    }
    out.push({
      pid,
      start,
      end: timeline.length,
      duration: timeline.length - start,
    });
    return out;
  }

  function simulate(algorithm, processes, options) {
    const q = (options && options.quantum) || 2;
    switch (algorithm) {
      case ALGORITHMS.FCFS:
        return runGenericSimulation(
          prepareProcesses(processes),
          makeNonPreemptivePick(cmpFCFS),
          ALGORITHMS.FCFS,
          null,
        );
      case ALGORITHMS.SJF:
        return runGenericSimulation(
          prepareProcesses(processes),
          makeNonPreemptivePick(cmpSJF),
          ALGORITHMS.SJF,
          null,
        );
      case ALGORITHMS.SRTF:
        return runGenericSimulation(
          prepareProcesses(processes),
          srtfPick,
          ALGORITHMS.SRTF,
          null,
        );
      case ALGORITHMS.RR:
        return runRoundRobin(prepareProcesses(processes), q);
      case ALGORITHMS.PRIORITY:
        return runGenericSimulation(
          prepareProcesses(processes),
          makeNonPreemptivePick(cmpPriority),
          ALGORITHMS.PRIORITY,
          null,
        );
      default:
        throw new Error(`Algoritmo desconocido: ${algorithm}`);
    }
  }

  /**
   * Simula el orden manual dado por el usuario (modelo FCFS con arrivals).
   * @param {string[]} orderedPids
   * @param {Array} processes
   */
  function simulateManualOrder(orderedPids, processes) {
    const procs = prepareProcesses(processes);
    const byId = new Map(procs.map((p) => [p.pid, p]));

    const seq = [];
    const seen = new Set();
    for (const pid of orderedPids || []) {
      if (!seen.has(pid) && byId.has(pid)) {
        seq.push(byId.get(pid));
        seen.add(pid);
      }
    }
    procs.forEach((p) => {
      if (!seen.has(p.pid)) seq.push(p);
    });

    let time = 0;
    const perProcess = [];
    for (const p of seq) {
      const start = Math.max(time, p.arrival);
      const completion = start + p.burst;
      const turnaround = completion - p.arrival;
      const waiting = turnaround - p.burst;
      const response = start - p.arrival;
      perProcess.push({
        pid: p.pid,
        arrival: p.arrival,
        burst: p.burst,
        priority: p.priority,
        start,
        completion,
        turnaround,
        waiting,
        response,
      });
      time = completion;
    }

    const n = perProcess.length || 1;
    const totalWait = perProcess.reduce((a, p) => a + p.waiting, 0);
    const totalTAT = perProcess.reduce((a, p) => a + p.turnaround, 0);
    const totalResp = perProcess.reduce((a, p) => a + p.response, 0);

    return {
      algorithm: "MANUAL",
      perProcess,
      avgWaiting: totalWait / n,
      avgTurnaround: totalTAT / n,
      avgResponse: totalResp / n,
      totalTime: time,
    };
  }

  function compareAll(processes, options) {
    const out = {};
    for (const k of Object.values(ALGORITHMS)) {
      try {
        out[k] = simulate(k, processes, options);
      } catch (err) {
        out[k] = { error: err.message, algorithm: k };
      }
    }
    return out;
  }

  function rankAlgorithms(comparison, metric) {
    const key = metric || "avgWaiting";
    return Object.entries(comparison)
      .filter(([, r]) => r && r.metrics)
      .map(([algo, r]) => ({ algorithm: algo, value: r.metrics[key] }))
      .sort((a, b) => a.value - b.value)
      .map((e, i) => ({ ...e, rank: i + 1 }));
  }

  const API = {
    ALGORITHMS,
    simulate,
    compareAll,
    rankAlgorithms,
    simulateManualOrder,
    prepareProcesses,
    validateProcesses,
    buildGantt,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  global.Algorithms = API;
})(typeof window !== "undefined" ? window : globalThis);
