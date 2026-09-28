/* ═══════════════════════════════════════════════════════
   ALGORITMOS · Lógica pura, sin DOM
   ═══════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  const clone = (procs) => procs.map(p => ({ ...p }));

  function computeStats(procs, timeline) {
    const stats = {};
    procs.forEach(p => stats[p.pid] = { start: -1, finish: 0, wt: 0, tat: 0 });
    for (const seg of timeline) {
      const s = stats[seg.pid];
      if (s.start === -1) s.start = seg.start;
      s.finish = Math.max(s.finish, seg.end);
    }
    for (const p of procs) {
      const s = stats[p.pid];
      s.tat = s.finish - p.arrival;
      s.wt  = s.tat - p.burst;
    }
    const avgWT  = procs.reduce((a, p) => a + stats[p.pid].wt, 0) / procs.length;
    const avgTAT = procs.reduce((a, p) => a + stats[p.pid].tat, 0) / procs.length;
    return { stats, avgWT, avgTAT };
  }

  function packResult(name, procs, timeline) {
    const { stats, avgWT, avgTAT } = computeStats(procs, timeline);
    const totalTime = timeline.length ? timeline[timeline.length - 1].end : 0;
    const busy = procs.reduce((a, p) => a + p.burst, 0);
    return {
      algorithm: name,
      timeline,
      processes: procs.map(p => ({ ...p, ...stats[p.pid] })),
      contextSwitches: Math.max(0, timeline.length - 1),
      cpuUsage: totalTime ? Math.round((busy / totalTime) * 100) : 0,
      avgWT, avgTAT, totalTime
    };
  }

  // ─── FCFS ───
  function runFCFS(procs) {
    const list = clone(procs).sort((a, b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
    const timeline = [];
    let t = 0;
    for (const p of list) {
      if (t < p.arrival) t = p.arrival;
      timeline.push({ pid: p.pid, start: t, end: t + p.burst });
      t += p.burst;
    }
    return packResult('FCFS', list, timeline);
  }

  // ─── SJF (no apropiativo) ───
  function runSJF(procs) {
    const list = clone(procs);
    const done = new Set();
    const timeline = [];
    let t = 0;
    while (done.size < list.length) {
      const avail = list.filter(p => !done.has(p.pid) && p.arrival <= t);
      if (!avail.length) {
        const next = list.filter(p => !done.has(p.pid))
                         .reduce((a, b) => a.arrival < b.arrival ? a : b);
        t = next.arrival;
        continue;
      }
      avail.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival);
      const p = avail[0];
      timeline.push({ pid: p.pid, start: t, end: t + p.burst });
      t += p.burst;
      done.add(p.pid);
    }
    return packResult('SJF', list, timeline);
  }

  // ─── SRTF (apropiativo, tick a tick) ───
  function runSRTF(procs) {
    const list = clone(procs);
    const rem = {};
    list.forEach(p => rem[p.pid] = p.burst);
    const raw = [];
    let t = 0;
    let guard = 0;
    while (Object.values(rem).some(v => v > 0) && guard++ < 10000) {
      const avail = list.filter(p => rem[p.pid] > 0 && p.arrival <= t);
      if (!avail.length) {
        const next = list.filter(p => rem[p.pid] > 0)
                         .reduce((a, b) => a.arrival < b.arrival ? a : b);
        t = next.arrival;
        continue;
      }
      avail.sort((a, b) => rem[a.pid] - rem[b.pid] || a.arrival - b.arrival);
      const p = avail[0];
      raw.push({ pid: p.pid, start: t, end: t + 1 });
      rem[p.pid]--;
      t++;
    }
    const timeline = [];
    for (const seg of raw) {
      const last = timeline[timeline.length - 1];
      if (last && last.pid === seg.pid && last.end === seg.start) last.end = seg.end;
      else timeline.push({ ...seg });
    }
    return packResult('SRTF', list, timeline);
  }

  // ─── Round Robin ───
  function runRR(procs, quantum) {
    const list = clone(procs).sort((a, b) => a.arrival - b.arrival || a.pid.localeCompare(b.pid));
    const rem = {};
    list.forEach(p => rem[p.pid] = p.burst);
    const timeline = [];
    const arrived = new Set();
    const queue = [];
    let t = 0;
    let guard = 0;

    const enqueueArrivals = (upto) => {
      for (const p of list) {
        if (p.arrival <= upto && !arrived.has(p.pid)) {
          arrived.add(p.pid);
          queue.push(p.pid);
        }
      }
    };

    enqueueArrivals(0);
    if (!queue.length) {
      t = Math.min(...list.map(p => p.arrival));
      enqueueArrivals(t);
    }

    while (queue.length && guard++ < 10000) {
      const pid = queue.shift();
      const slice = Math.min(quantum, rem[pid]);
      timeline.push({ pid, start: t, end: t + slice });
      rem[pid] -= slice;
      t += slice;
      enqueueArrivals(t);
      if (rem[pid] > 0) queue.push(pid);

      if (!queue.length) {
        const pending = list.filter(p => rem[p.pid] > 0 && !arrived.has(p.pid));
        if (pending.length) {
          t = Math.min(...pending.map(p => p.arrival));
          enqueueArrivals(t);
        }
      }
    }
    return packResult('RR', list, timeline);
  }

  // ─── Prioridades (no apropiativo, MAYOR número = MAYOR prioridad) ───
  function runPriority(procs) {
    const list = clone(procs);
    const done = new Set();
    const timeline = [];
    let t = 0;
    while (done.size < list.length) {
      const avail = list.filter(p => !done.has(p.pid) && p.arrival <= t);
      if (!avail.length) {
        const next = list.filter(p => !done.has(p.pid))
                         .reduce((a, b) => a.arrival < b.arrival ? a : b);
        t = next.arrival;
        continue;
      }
      avail.sort((a, b) => b.priority - a.priority || a.arrival - b.arrival);
      const p = avail[0];
      timeline.push({ pid: p.pid, start: t, end: t + p.burst });
      t += p.burst;
      done.add(p.pid);
    }
    return packResult('PRIORITY', list, timeline);
  }

  // ═══ MEMORIA ═══
  function runFIFO(pages, frames) {
    const mem = [], steps = [];
    let hits = 0, faults = 0;
    for (const page of pages) {
      if (mem.includes(page)) {
        hits++;
        steps.push({ page, mem: [...mem], event: 'hit', removed: null });
      } else {
        faults++;
        const removed = mem.length >= frames ? mem.shift() : null;
        mem.push(page);
        steps.push({ page, mem: [...mem], event: 'fault', removed });
      }
    }
    return { algorithm: 'FIFO', steps, hits, faults, total: pages.length };
  }

  function runLRU(pages, frames) {
    const mem = [], steps = [];
    let hits = 0, faults = 0;
    for (const page of pages) {
      const idx = mem.indexOf(page);
      if (idx !== -1) {
        hits++;
        mem.splice(idx, 1);
        mem.push(page);
        steps.push({ page, mem: [...mem], event: 'hit', removed: null });
      } else {
        faults++;
        const removed = mem.length >= frames ? mem.shift() : null;
        mem.push(page);
        steps.push({ page, mem: [...mem], event: 'fault', removed });
      }
    }
    return { algorithm: 'LRU', steps, hits, faults, total: pages.length };
  }

  function runOptimo(pages, frames) {
    const mem = [], steps = [];
    let hits = 0, faults = 0;
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (mem.includes(page)) {
        hits++;
        steps.push({ page, mem: [...mem], event: 'hit', removed: null });
        continue;
      }
      faults++;
      let removed = null;
      if (mem.length >= frames) {
        let farthest = -1;
        let victim = mem[0];
        for (const m of mem) {
          let nextUse = -1;
          for (let j = i + 1; j < pages.length; j++) {
            if (pages[j] === m) { nextUse = j; break; }
          }
          if (nextUse === -1) { victim = m; break; }
          if (nextUse > farthest) { farthest = nextUse; victim = m; }
        }
        removed = victim;
        mem.splice(mem.indexOf(victim), 1);
      }
      mem.push(page);
      steps.push({ page, mem: [...mem], event: 'fault', removed });
    }
    return { algorithm: 'OPTIMO', steps, hits, faults, total: pages.length };
  }

  global.Algorithms = {
    runFCFS, runSJF, runSRTF, runRR, runPriority,
    runFIFO, runLRU, runOptimo
  };
})(window);