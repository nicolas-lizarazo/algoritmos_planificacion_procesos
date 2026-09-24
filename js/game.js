/* ═══════════════════════════════════════════════════════════════════════════
 * game.js · Mecánicas de Juego (v3)
 *   • 30 preguntas · selección aleatoria de 5
 *   • Drag & Drop con botón #btn-evaluar-orden funcional
 *   • Modal de resultados con podio comparativo
 *   • Banner de inanición con X + click-outside
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
  function randInt(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
  }
  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[m],
    );
  }

  const state = {
    activeMode: null,
    challenge: { active: false, processes: [], userOrder: [], dragId: null },
    trivia: {
      active: false,
      order: [],
      index: 0,
      score: 0,
      current: null,
      answered: false,
      usedIds: [],
    },
  };

  /* ═══════════════════════════════════════════════════════════════
   * BANCO DE 30 PREGUNTAS
   * ═══════════════════════════════════════════════════════════════ */
  const TRIVIA_BANK = [
    {
      q: "¿Qué algoritmo de planificación atiende a los procesos en estricto orden de llegada?",
      options: ["SJF", "FCFS", "Round Robin", "SRTF"],
      correct: 1,
      tip: "FCFS (First Come First Served) es el más simple y no apropiativo.",
    },
    {
      q: "¿Qué efecto negativo caracteriza a FCFS cuando un proceso largo llega primero?",
      options: ["Inanición", "Efecto convoy", "Deadlock", "Fragmentación"],
      correct: 1,
      tip: "El efecto convoy ocurre porque los procesos cortos esperan tras uno largo.",
    },
    {
      q: "¿Cuál es el principal inconveniente del algoritmo FCFS?",
      options: [
        "Alto overhead",
        "Tiempo de espera promedio elevado",
        "Requiere quantum",
        "No es determinista",
      ],
      correct: 1,
      tip: "FCFS puede dar esperas muy altas si los procesos largos llegan antes que los cortos.",
    },
    {
      q: "SJF es óptimo cuando se busca minimizar...",
      options: [
        "Tiempo de respuesta",
        "Tiempo de espera promedio",
        "Uso de CPU",
        "Cambios de contexto",
      ],
      correct: 1,
      tip: "SJF minimiza el tiempo de espera promedio de todos los procesos.",
    },
    {
      q: "¿Qué problema puede causar SJF con procesos de ráfaga muy larga?",
      options: ["Deadlock", "Inanición", "Fallo de página", "Paginación"],
      correct: 1,
      tip: "Los procesos largos pueden no ejecutarse nunca si siempre llegan cortos.",
    },
    {
      q: "¿Cómo se desempata en SJF cuando dos procesos tienen la misma ráfaga?",
      options: [
        "Por prioridad",
        "Por orden de llegada",
        "Aleatorio",
        "Por PID",
      ],
      correct: 1,
      tip: "El desempate estándar es el orden de llegada (FCFS).",
    },
    {
      q: "¿Qué caracteriza a SRTF respecto a SJF?",
      options: [
        "No apropiativo",
        "Apropiativo por tiempo restante",
        "Usa quantum",
        "Ignora arrivals",
      ],
      correct: 1,
      tip: "SRTF es la variante apropiativa de SJF: compara en cada tick el tiempo restante.",
    },
    {
      q: "¿Cuándo se produce un desalojo en SRTF?",
      options: [
        "Al terminar",
        "Al expirar el quantum",
        "Cuando llega uno con menor tiempo restante",
        "Nunca",
      ],
      correct: 2,
      tip: "SRTF desaloja si un proceso recién llegado tiene menor tiempo restante.",
    },
    {
      q: "¿Qué algoritmo garantiza que todo proceso reciba CPU en un tiempo acotado?",
      options: ["FCFS", "SJF", "Round Robin", "Prioridades"],
      correct: 2,
      tip: "Round Robin garantiza CPU a todos los procesos mediante rotación de quantum.",
    },
    {
      q: "¿Qué ocurre en Round Robin con un quantum muy pequeño?",
      options: [
        "Mejor throughput",
        "Overhead por cambios de contexto",
        "Inanición",
        "Menos equidad",
      ],
      correct: 1,
      tip: "Muchos cambios de contexto degradan el rendimiento global.",
    },
    {
      q: "¿Qué ocurre en Round Robin con un quantum muy grande?",
      options: ["Más equidad", "Degenera en FCFS", "Inanición", "Apropiativo"],
      correct: 1,
      tip: "Con quantum grande RR se comporta como FCFS.",
    },
    {
      q: "En Round Robin, el quantum define...",
      options: [
        "La prioridad",
        "El tiempo máximo en CPU por turno",
        "El burst total",
        "El TAT",
      ],
      correct: 1,
      tip: "Es el tiempo máximo que un proceso puede ocupar la CPU antes de ser desalojado.",
    },
    {
      q: "¿Qué algoritmo puede causar inanición en procesos de baja prioridad?",
      options: ["FCFS", "Round Robin", "Prioridades", "SRTF y Prioridades"],
      correct: 3,
      tip: "Tanto SRTF como Prioridades pueden dejar sin CPU a ciertos procesos indefinidamente.",
    },
    {
      q: "¿Qué técnica mitiga la inanición aumentando la prioridad con el tiempo de espera?",
      options: [
        "Compaction",
        "Aging (envejecimiento)",
        "Thrashing",
        "Swapping",
      ],
      correct: 1,
      tip: "Aging incrementa gradualmente la prioridad de procesos en espera.",
    },
    {
      q: "En prioridades, si el número mayor indica mayor prioridad, ¿qué proceso corre primero?",
      options: [
        "El de menor número",
        "El de mayor número",
        "El de menor arrival",
        "El de mayor burst",
      ],
      correct: 1,
      tip: "El proceso con la prioridad numérica más alta gana la CPU.",
    },
    {
      q: "¿Qué mide el Turnaround Time (TAT)?",
      options: [
        "Tiempo en CPU",
        "Tiempo total desde llegada hasta finalización",
        "Tiempo en cola",
        "Tiempo de respuesta",
      ],
      correct: 1,
      tip: "TAT = completion − arrival.",
    },
    {
      q: "¿Qué mide el Waiting Time (WT)?",
      options: [
        "Tiempo en CPU",
        "Tiempo total en cola de listos",
        "Tiempo de E/S",
        "Tiempo de burst",
      ],
      correct: 1,
      tip: "WT = TAT − Burst (tiempo total esperando sin ejecutar).",
    },
    {
      q: "¿Qué mide el Response Time (RT)?",
      options: [
        "Tiempo hasta la primera ejecución",
        "Tiempo total",
        "Tiempo en CPU",
        "Tiempo de llegada",
      ],
      correct: 0,
      tip: "RT = tiempo desde arrival hasta que el proceso empieza por primera vez.",
    },
    {
      q: "¿Qué mide el Throughput?",
      options: [
        "Tiempo total",
        "Procesos completados por unidad de tiempo",
        "% CPU ociosa",
        "Cambios de contexto",
      ],
      correct: 1,
      tip: "Throughput = procesos / tiempo total.",
    },
    {
      q: "¿Qué mide la CPU Utilization?",
      options: [
        "% de tiempo con CPU activa",
        "Nº procesos",
        "Prioridad media",
        "Burst total",
      ],
      correct: 0,
      tip: "Es el porcentaje del tiempo que la CPU ejecuta procesos.",
    },
    {
      q: "¿Qué tipo de algoritmo es FCFS?",
      options: [
        "Apropiativo",
        "No apropiativo",
        "Apropiativo con aging",
        "Preemptive",
      ],
      correct: 1,
      tip: "FCFS no puede desalojar un proceso en ejecución.",
    },
    {
      q: "¿Qué tipo de algoritmo es Round Robin?",
      options: [
        "No apropiativo",
        "Apropiativo",
        "Con prioridades",
        "Aleatorio",
      ],
      correct: 1,
      tip: "Round Robin es apropiativo por expiración de quantum.",
    },
    {
      q: "¿Qué tipo de algoritmo es SJF clásico?",
      options: [
        "Apropiativo",
        "No apropiativo",
        "Apropiativo por aging",
        "Con quantum",
      ],
      correct: 1,
      tip: "SJF clásico espera a que un proceso termine antes de elegir el siguiente.",
    },
    {
      q: "Un quantum extremadamente grande en Round Robin produce un comportamiento similar a...",
      options: ["SJF", "FCFS", "SRTF", "Prioridades"],
      correct: 1,
      tip: "Con quantum ≥ burst máximo, RR se degenera en FCFS.",
    },
    {
      q: "Si dos algoritmos tienen el mismo WT promedio pero diferente nº de cambios de contexto, ¿cuál elegir?",
      options: [
        "El de más ctx switches",
        "El de menos ctx switches",
        "Da igual",
        "El de más prioridades",
      ],
      correct: 1,
      tip: "Menos cambios de contexto = menos overhead.",
    },
    {
      q: "¿Qué es la inversión de prioridades?",
      options: [
        "Cuando un proceso de alta prioridad espera por uno de baja que tiene un recurso",
        "Cuando cambia la prioridad",
        "Cuando hay inanición",
        "Cuando ocurre un deadlock",
      ],
      correct: 0,
      tip: "Clásico en sistemas de tiempo real con mutex.",
    },
    {
      q: "¿Qué algoritmo es más adecuado para sistemas de tiempo compartido interactivos?",
      options: ["FCFS", "Round Robin", "SJF", "SRTF"],
      correct: 1,
      tip: "RR da respuesta ágil a usuarios interactivos.",
    },
    {
      q: "¿Qué algoritmo es más adecuado para sistemas batch con prioridad de rendimiento?",
      options: ["Round Robin", "SJF / SRTF", "FCFS", "Multilevel"],
      correct: 1,
      tip: "SJF/SRTF minimizan la espera media en entornos batch.",
    },
    {
      q: "¿Qué es HRRN?",
      options: [
        "High Response Ratio Next",
        "Heap Round Robin Normal",
        "Hard Real-time Response Network",
        "Higher Rate Recursion Node",
      ],
      correct: 0,
      tip: "HRRN combina prioridad y espera para evitar inanición.",
    },
    {
      q: "¿Qué ocurre si el quantum es demasiado pequeño respecto a la duración de un cambio de contexto?",
      options: [
        "Mejor throughput",
        "Overhead inaceptable",
        "Inanición",
        "Deadlock",
      ],
      correct: 1,
      tip: "El overhead de cambio de contexto puede superar el tiempo útil.",
    },
  ];

  const TRIVIA_LEN = 5;

  /* ═══════════════════════════════════════════════════════════════
   * STARVATION SCENARIO
   * ═══════════════════════════════════════════════════════════════ */
  const STARVATION_SCENARIO = [
    { pid: "P1", arrival: 0, burst: 3, priority: 5 },
    { pid: "P2", arrival: 0, burst: 14, priority: 1 },
    { pid: "P3", arrival: 1, burst: 2, priority: 4 },
    { pid: "P4", arrival: 2, burst: 3, priority: 3 },
    { pid: "P5", arrival: 3, burst: 2, priority: 5 },
    { pid: "P6", arrival: 5, burst: 3, priority: 4 },
  ];

  /* ═══════════════════════════════════════════════════════════════
   * TRIVIA
   * ═══════════════════════════════════════════════════════════════ */
  function pickRandomQuestions(n) {
    const pool = shuffle(TRIVIA_BANK.map((_, i) => i));
    return pool.slice(0, n).map((idx) => TRIVIA_BANK[idx]);
  }

  function startTrivia() {
    stopChallenge();
    stopStarvation();
    state.activeMode = "trivia";
    state.trivia = {
      active: true,
      order: pickRandomQuestions(TRIVIA_LEN),
      index: 0,
      score: 0,
      current: null,
      answered: false,
      usedIds: [],
    };
    state.trivia.current = state.trivia.order[0];

    const modal = $("#trivia-modal");
    if (!modal) return;
    modal.classList.add("is-visible");
    modal.classList.remove("hidden");
    modal.style.display = "flex";

    wireTriviaOnce();
    /* Reconstruir la estructura original del body si fue reemplazada */
    resetTriviaBody();
    renderTrivia();
  }

  function stopTrivia() {
    state.trivia.active = false;
    if (state.activeMode === "trivia") state.activeMode = null;
    const modal = $("#trivia-modal");
    if (modal) {
      modal.classList.remove("is-visible");
      modal.style.display = "none";
    }
  }

  function resetTriviaBody() {
    const modal = $("#trivia-modal");
    if (!modal) return;
    const shell = modal.querySelector(".challenge-shell");
    if (!shell) return;
    /* Si ya tiene la estructura esperada, no tocar */
    if (shell.querySelector("#trivia-question")) return;
    /* Reconstruir */
    shell.innerHTML = `
      <header class="challenge-header">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-circle-question text-neon"></i>
          <span class="font-display text-xs font-bold tracking-[0.2em] text-neon">TRIVIA · PLANIFICACIÓN</span>
        </div>
        <button id="trivia-close" class="text-slate-500 hover:text-danger">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <div class="p-5">
        <div class="mb-3 flex items-center justify-between text-[10px] uppercase tracking-widest text-slate-500">
          <span>Pregunta <span id="trivia-index">1</span>/<span id="trivia-total">5</span></span>
          <span class="text-lime">Score: <span id="trivia-score" class="font-bold tabular-nums">0</span></span>
        </div>
        <p id="trivia-question" class="mb-4 text-sm leading-relaxed text-slate-200"></p>
        <div id="trivia-options" class="space-y-2"></div>
        <div id="trivia-feedback" class="mt-4 hidden rounded-md border px-3 py-2 text-[11px]"></div>
        <button id="trivia-next"
                class="mt-4 hidden w-full rounded-md border border-neon/40 bg-neon/10 py-2 text-[11px]
                       font-bold uppercase tracking-widest text-neon hover:bg-neon/20">
          Siguiente <i class="fa-solid fa-arrow-right ml-1"></i>
        </button>
      </div>
    `;
    wireTriviaOnce();
  }

  function wireTriviaOnce() {
    const close = $("#trivia-close");
    if (close && !close._wired) {
      close.addEventListener("click", stopTrivia);
      close._wired = true;
    }
    const next = $("#trivia-next");
    if (next && !next._wired) {
      next.addEventListener("click", onTriviaNext);
      next._wired = true;
    }
  }

  function renderTrivia() {
    const t = state.trivia;
    if (!t.current) return;
    $("#trivia-index").textContent = String(t.index + 1);
    $("#trivia-total").textContent = String(t.order.length);
    $("#trivia-score").textContent = String(t.score);
    $("#trivia-question").textContent = t.current.q;

    const fb = $("#trivia-feedback");
    if (fb) {
      fb.className = "mt-4 hidden rounded-md border px-3 py-2 text-[11px]";
      fb.textContent = "";
    }
    const next = $("#trivia-next");
    if (next) {
      next.classList.add("hidden");
      next.textContent = "Siguiente →";
    }

    const cont = $("#trivia-options");
    if (!cont) return;
    cont.innerHTML = "";
    const letters = ["A", "B", "C", "D"];
    t.current.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "trivia-option";
      btn.innerHTML = `<span class="opt-marker">${letters[i]}</span><span>${escapeHtml(opt)}</span>`;
      btn.dataset.index = String(i);
      btn.addEventListener("click", () => onTriviaAnswer(i));
      cont.appendChild(btn);
    });
    t.answered = false;
  }

  function onTriviaAnswer(idx) {
    const t = state.trivia;
    if (!t.current || t.answered) return;
    t.answered = true;
    const correct = idx === t.current.correct;
    $$("#trivia-options .trivia-option").forEach((el) => {
      el.disabled = true;
      const i = parseInt(el.dataset.index, 10);
      if (i === t.current.correct) el.classList.add("is-correct");
      else if (i === idx) el.classList.add("is-wrong");
    });
    if (correct) t.score += 10;
    $("#trivia-score").textContent = String(t.score);

    const fb = $("#trivia-feedback");
    if (fb) {
      fb.className =
        "mt-4 rounded-md border px-3 py-2 text-[11px] " +
        (correct ? "is-correct" : "is-wrong");
      fb.textContent =
        (correct ? "✓ Correcto · " : "✗ Incorrecto · ") + t.current.tip;
    }
    const next = $("#trivia-next");
    if (next) {
      next.classList.remove("hidden");
      next.textContent =
        t.index + 1 >= t.order.length ? "Finalizar" : "Siguiente →";
    }
  }

  function onTriviaNext() {
    const t = state.trivia;
    if (!t.active) return;
    t.index++;
    if (t.index >= t.order.length) return finishTrivia();
    t.current = t.order[t.index];
    renderTrivia();
  }

  function finishTrivia() {
    const t = state.trivia;
    const total = t.order.length;
    const maxScore = total * 10;
    const pct = Math.round((t.score / maxScore) * 100);

    const modal = $("#trivia-modal");
    if (!modal) return;
    const shell = modal.querySelector(".challenge-shell");
    if (!shell) return;

    shell.innerHTML = `
      <header class="challenge-header">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-award text-lime"></i>
          <span class="font-display text-xs font-bold tracking-[0.2em] text-lime">RESULTADO · TRIVIA</span>
        </div>
        <button id="trivia-close" class="text-slate-500 hover:text-danger">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </header>
      <div class="p-6 text-center">
        <div class="font-display text-4xl font-black text-neon">${t.score}</div>
        <div class="mt-1 text-[10px] uppercase tracking-widest text-slate-500">
          puntos de ${maxScore} · ${pct}%
        </div>
        <p class="mt-4 text-xs leading-relaxed text-slate-400">
          ${
            pct >= 80
              ? "Excelente dominio de los algoritmos de planificación."
              : pct >= 50
                ? "Buen desempeño. Repasa los detalles de SJF y Round Robin."
                : "Necesitas repasar los fundamentos de planificación de CPU."
          }
        </p>
        <div class="challenge-actions mt-6">
          <button id="trivia-retry" class="btn-evaluate">
            <i class="fa-solid fa-rotate mr-1"></i>Reintentar con nuevas preguntas
          </button>
          <button id="trivia-exit" class="btn-clear">
            <i class="fa-solid fa-xmark mr-1"></i>Salir
          </button>
        </div>
      </div>
    `;

    /* Re-wire */
    const close = $("#trivia-close");
    if (close) close.addEventListener("click", stopTrivia);
    const retry = $("#trivia-retry");
    if (retry)
      retry.addEventListener("click", () => {
        stopTrivia();
        startTrivia();
      });
    const exit = $("#trivia-exit");
    if (exit)
      exit.addEventListener("click", () => {
        stopTrivia();
        if (global.MainAPI) global.MainAPI.setMode("sim");
      });
  }

  /* ═══════════════════════════════════════════════════════════════
   * CHALLENGE · HUMANO vs CPU
   * ═══════════════════════════════════════════════════════════════ */
  function generateChallengeProcesses() {
    return [
      { pid: "P1", arrival: 0, burst: randInt(3, 7), priority: randInt(1, 5) },
      { pid: "P2", arrival: 0, burst: randInt(4, 8), priority: randInt(1, 5) },
      { pid: "P3", arrival: 0, burst: randInt(2, 6), priority: randInt(1, 5) },
      { pid: "P4", arrival: 0, burst: randInt(3, 7), priority: randInt(1, 5) },
    ];
  }

  function startChallenge() {
    stopTrivia();
    stopStarvation();
    state.activeMode = "challenge";
    if (global.MainAPI) global.MainAPI.pauseSimulation();

    const processes = generateChallengeProcesses();
    state.challenge = { active: true, processes, userOrder: [], dragId: null };

    const modal = $("#challenge-modal");
    if (!modal) return;
    modal.classList.add("is-visible");
    modal.classList.remove("hidden");
    modal.style.display = "flex";

    wireChallengeOnce();
    renderChallengeDnD();
  }

  function stopChallenge() {
    state.challenge.active = false;
    if (state.activeMode === "challenge") state.activeMode = null;
    const modal = $("#challenge-modal");
    if (modal) {
      modal.classList.remove("is-visible");
      modal.style.display = "none";
    }
  }

  function wireChallengeOnce() {
    const close = $("#challenge-close");
    if (close && !close._wired) {
      close.addEventListener("click", () => {
        stopChallenge();
        if (global.MainAPI) global.MainAPI.setMode("sim");
      });
      close._wired = true;
    }
  }

  function renderChallengeDnD() {
    const body = $("#challenge-body");
    if (!body) return;

    body.innerHTML = `
      <div class="challenge-instructions">
        <i class="fa-solid fa-hand-pointer"></i>
        <strong>Arrastra los procesos en el orden que creas más eficiente para minimizar el tiempo de espera.</strong>
        <br>
        <span class="text-slate-400">
          Arrastra las tarjetas desde la bandeja hacia la zona de orden. Puedes reordenar dentro de la lista.
        </span>
      </div>

      <div class="mb-3">
        <div class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
          <i class="fa-solid fa-inbox mr-1"></i>Bandeja de procesos
        </div>
        <div id="challenge-pool" class="dnd-pool"></div>
      </div>

      <div class="mb-4">
        <div class="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
          <i class="fa-solid fa-list-ol mr-1"></i>Orden de ejecución (arrastra aquí)
        </div>
        <div id="challenge-slots" class="dnd-slot-list"></div>
      </div>

      <div class="challenge-actions">
        <button id="btn-evaluar-orden" class="btn-evaluate" disabled>
          <i class="fa-solid fa-check mr-1"></i>Evaluar mi orden
        </button>
        <button id="challenge-clear" class="btn-clear">
          <i class="fa-solid fa-rotate-left mr-1"></i>Limpiar
        </button>
      </div>
    `;

    renderChallengePool();
    renderChallengeSlots();

    /* ─── FIX #1 · Listener funcional del botón EVALUAR ─── */
    const evalBtn = body.querySelector("#btn-evaluar-orden");
    if (evalBtn) {
      evalBtn.addEventListener("click", evaluateUserOrder);
    }
    const clearBtn = body.querySelector("#challenge-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.challenge.userOrder = [];
        renderChallengePool();
        renderChallengeSlots();
        updateEvaluateButton();
      });
    }
  }

  function renderChallengePool() {
    const pool = $("#challenge-pool");
    if (!pool) return;
    pool.innerHTML = "";

    const placed = new Set(state.challenge.userOrder);
    const remaining = state.challenge.processes.filter(
      (p) => !placed.has(p.pid),
    );

    if (remaining.length === 0) {
      pool.classList.add("empty");
      return;
    }
    pool.classList.remove("empty");
    remaining.forEach((p) => pool.appendChild(makeDndCard(p, "pool")));
  }

  function renderChallengeSlots() {
    const slots = $("#challenge-slots");
    if (!slots) return;
    slots.innerHTML = "";

    if (state.challenge.userOrder.length === 0) {
      slots.innerHTML = `<div class="text-center text-[10px] text-slate-500 italic py-6">
        Arrastra aquí las tarjetas en el orden deseado
      </div>`;
    } else {
      state.challenge.userOrder.forEach((pid, i) => {
        const p = state.challenge.processes.find((x) => x.pid === pid);
        if (!p) return;
        const card = makeDndCard(p, "slot", i + 1);
        card.classList.add("dnd-card-in-slot");
        slots.appendChild(card);
      });
    }

    if (!slots._wiredDrop) {
      slots.addEventListener("dragover", (e) => {
        e.preventDefault();
        slots.classList.add("drag-over");
      });
      slots.addEventListener("dragleave", () =>
        slots.classList.remove("drag-over"),
      );
      slots.addEventListener("drop", (e) => {
        e.preventDefault();
        slots.classList.remove("drag-over");
        const pid =
          e.dataTransfer.getData("text/pid") || state.challenge.dragId;
        if (!pid) return;
        if (!state.challenge.userOrder.includes(pid)) {
          state.challenge.userOrder.push(pid);
        }
        renderChallengePool();
        renderChallengeSlots();
        updateEvaluateButton();
      });
      slots._wiredDrop = true;
    }
  }

  function makeDndCard(proc, origin, rank) {
    const card = document.createElement("div");
    card.className = "dnd-card";
    card.draggable = true;
    card.dataset.pid = proc.pid;

    card.innerHTML = `
      ${rank != null ? `<span class="dnd-card-rank">${rank}</span>` : ""}
      <span class="pid-badge">${proc.pid}</span>
      <span class="dnd-card-info">
        <span class="dnd-card-pid">${proc.pid}</span>
        <span class="dnd-card-meta">Burst ${proc.burst} · Prio ${proc.priority}</span>
      </span>
    `;

    card.addEventListener("dragstart", (e) => {
      state.challenge.dragId = proc.pid;
      card.classList.add("dragging");
      try {
        e.dataTransfer.setData("text/pid", proc.pid);
      } catch (_) {}
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      state.challenge.dragId = null;
    });
    if (origin === "slot") {
      card.addEventListener("dragstart", () => {
        const ix = state.challenge.userOrder.indexOf(proc.pid);
        if (ix >= 0) state.challenge.userOrder.splice(ix, 1);
      });
    }
    return card;
  }

  function updateEvaluateButton() {
    const btn = $("#btn-evaluar-orden");
    if (!btn) return;
    btn.disabled =
      state.challenge.userOrder.length !== state.challenge.processes.length;
  }

  /* ─── FIX #1 · Evaluación del orden manual ─── */
  function evaluateUserOrder() {
    const c = state.challenge;
    if (c.userOrder.length !== c.processes.length) {
      alert(
        "Debes colocar TODOS los procesos en el orden de ejecución antes de evaluar.",
      );
      return;
    }

    /* 1 · Calcular WT del orden manual */
    const manual = global.Algorithms.simulateManualOrder(
      c.userOrder,
      c.processes,
    );

    /* 2 · Comparar contra los 5 algoritmos */
    const comparison = global.Algorithms.compareAll(c.processes, {
      quantum: 2,
    });
    const ranking = Object.entries(comparison)
      .filter(([, r]) => r && r.metrics)
      .map(([algo, r]) => ({
        algorithm: algo,
        label:
          algo === "RR"
            ? "Round Robin"
            : algo === "PRIORITY"
              ? "Prioridades"
              : algo,
        avgWT: r.metrics.avgWaiting,
        avgTAT: r.metrics.avgTurnaround,
        isUser: false,
      }));

    const userEntry = {
      algorithm: "USER",
      label: "Tu Orden",
      avgWT: manual.avgWaiting,
      avgTAT: manual.avgTurnaround,
      isUser: true,
    };

    ranking.push(userEntry);
    ranking.sort((a, b) => a.avgWT - b.avgWT);
    ranking.forEach((r, i) => (r.rank = i + 1));

    const bestAlgo = ranking.filter((r) => !r.isUser)[0];
    const userRank = ranking.find((r) => r.isUser);
    const won = userRank.rank === 1;

    const delta = manual.avgWaiting - bestAlgo.avgWT;
    const pctDelta = bestAlgo.avgWT > 0 ? (delta / bestAlgo.avgWT) * 100 : 0;

    /* 3 · Render del modal de resultados con podio */
    renderChallengeResult(
      ranking,
      userEntry,
      bestAlgo,
      won,
      pctDelta,
      c.userOrder,
    );
  }

  function renderChallengeResult(
    ranking,
    userEntry,
    bestAlgo,
    won,
    pctDelta,
    userOrder,
  ) {
    const body = $("#challenge-body");
    if (!body) return;

    const top5 = ranking.slice(0, 5);
    const order = [];
    if (top5[1]) order.push(top5[1]);
    if (top5[0]) order.push(top5[0]);
    if (top5[2]) order.push(top5[2]);
    if (top5[3]) order.push(top5[3]);
    if (top5[4]) order.push(top5[4]);

    const medalFor = (r) =>
      r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`;

    const podiumHtml = order
      .map((r) => {
        const d = r.isUser ? 0 : r.avgWT - userEntry.avgWT;
        const deltaStr = r.isUser
          ? "TÚ"
          : d > 0
            ? `+${d.toFixed(2)}`
            : d.toFixed(2);
        return `
        <div class="podium-step rank-${r.rank} ${r.isUser ? "is-user" : ""}">
          <div class="podium-medal">${medalFor(r.rank)}</div>
          <div class="podium-name">${escapeHtml(r.label)}</div>
          <div class="podium-value">${r.avgWT.toFixed(2)}</div>
          <div class="podium-delta">${deltaStr}</div>
        </div>
      `;
      })
      .join("");

    /* Feedback textual */
    let feedback;
    if (won) {
      feedback = `🏆 ¡Ganaste! Tu orden superó a los 5 algoritmos clásicos.`;
    } else if (pctDelta <= 10) {
      feedback = `¡Casi perfecto! El procesador (${bestAlgo.label}) fue ${pctDelta.toFixed(1)}% más eficiente que tu orden.`;
    } else if (pctDelta <= 35) {
      feedback = `Buen intento. El procesador (${bestAlgo.label}) fue ${pctDelta.toFixed(1)}% más eficiente que tu orden.`;
    } else {
      feedback = `El procesador (${bestAlgo.label}) fue ${pctDelta.toFixed(1)}% más eficiente que tu orden. Prueba con ráfagas cortas primero.`;
    }

    body.innerHTML = `
      <div class="podium-wrap">
        <div class="podium-title ${won ? "win" : "lose"}">
          ${won ? "🏆 ¡VICTORIA!" : "💻 GANA LA CPU"}
        </div>
        <div class="podium-subtitle">${feedback}</div>

        <div class="podium">${podiumHtml}</div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <div class="rounded-md border border-line bg-panel-2 p-3 text-center">
            <div class="text-[9px] uppercase tracking-widest text-slate-500">Tu Tiempo de Espera Promedio</div>
            <div class="font-display text-lg font-bold text-neon">${userEntry.avgWT.toFixed(2)} <span class="text-xs text-slate-500">ticks</span></div>
          </div>
          <div class="rounded-md border border-lime/30 bg-lime/5 p-3 text-center">
            <div class="text-[9px] uppercase tracking-widest text-slate-500">Mejor Algoritmo (${bestAlgo.label})</div>
            <div class="font-display text-lg font-bold text-lime">${bestAlgo.avgWT.toFixed(2)} <span class="text-xs text-slate-500">ticks</span></div>
          </div>
        </div>

        <div class="mt-4 rounded-md border border-line bg-panel-2 p-3 text-[10px] text-slate-400">
          <div class="mb-1 uppercase tracking-widest text-slate-500">Tu orden elegido</div>
          <div class="font-mono text-slate-200">
            ${userOrder.map((pid) => `<span class="pid-badge" style="margin-right:4px">${pid}</span>`).join("→")}
          </div>
        </div>

        <div class="challenge-actions mt-5">
          <button id="challenge-retry" class="btn-evaluate">
            <i class="fa-solid fa-rotate mr-1"></i>Reintentar
          </button>
          <button id="challenge-exit-final" class="btn-clear">
            <i class="fa-solid fa-xmark mr-1"></i>Salir
          </button>
        </div>
      </div>
    `;

    const retry = body.querySelector("#challenge-retry");
    if (retry)
      retry.addEventListener("click", () => {
        state.challenge.userOrder = [];
        renderChallengeDnD();
      });
    const exit = body.querySelector("#challenge-exit-final");
    if (exit)
      exit.addEventListener("click", () => {
        stopChallenge();
        if (global.MainAPI) global.MainAPI.setMode("sim");
      });
  }

  /* ═══════════════════════════════════════════════════════════════
   * STARVATION · FIX #4
   * ═══════════════════════════════════════════════════════════════ */
  let starvWired = false;

  function startStarvation() {
    stopTrivia();
    stopChallenge();
    state.activeMode = "starvation";

    if (global.MainAPI && global.MainAPI.setProcesses) {
      global.MainAPI.setProcesses(STARVATION_SCENARIO);
    }
    setTimeout(() => {
      if (global.MainAPI && global.MainAPI.playSimulation) {
        global.MainAPI.playSimulation();
      }
    }, 250);
  }

  function stopStarvation() {
    if (state.activeMode === "starvation") state.activeMode = null;
    hideStarvationAlert();
  }

  function wireStarvationAlertOnce() {
    if (starvWired) return;
    starvWired = true;

    const overlay = $("#starvation-overlay");
    if (!overlay) return;

    /* Cerrar con clic fuera del mensaje */
    overlay.addEventListener("click", (e) => {
      /* Solo si el clic es directamente en el overlay (no en el box) */
      if (e.target === overlay) hideStarvationAlert();
    });

    /* Cerrar con la X */
    const closeBtn = overlay.querySelector("#starvation-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hideStarvationAlert();
      });
    }
  }

  function hideStarvationAlert() {
    const ov = $("#starvation-overlay");
    if (!ov) return;
    ov.classList.add("hidden");
    ov.classList.remove("flex");
    ov.style.display = "none";
  }

  function onSimulationResult(result, mode) {
    if (mode !== "starvation" || state.activeMode !== "starvation") return;

    const ov = $("#starvation-overlay");
    const detail = $("#starvation-detail");
    if (!ov) return;

    const starv = result && result.metrics && result.metrics.starvation;
    if (starv && starv.risk && starv.processes.length > 0) {
      const pidList = starv.processes.join(", ");
      if (detail) {
        detail.innerHTML =
          `<strong class="text-danger">⚠️ RIESGO DE INANICIÓN DETECTADO:</strong><br>` +
          `El proceso <span class="text-amber font-bold">${pidList}</span> ha acumulado más de ` +
          `<span class="text-amber font-bold">${starv.threshold.toFixed(0)} ticks</span> en la cola de espera ` +
          `sin recibir atención en CPU, debido a la llegada constante de procesos con menor ` +
          `ráfaga/mayor prioridad.`;
      }
      ov.classList.remove("hidden");
      ov.classList.add("flex");
      ov.style.display = "flex";
      wireStarvationAlertOnce();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * EXPORT
   * ═══════════════════════════════════════════════════════════════ */
  global.GameAPI = {
    startTrivia,
    stopTrivia,
    startChallenge,
    stopChallenge,
    startStarvation,
    stopStarvation,
    onSimulationResult,
    getActiveMode: () => state.activeMode,
    getState: () => state,
    getStarvationScenario: () => STARVATION_SCENARIO.map((p) => ({ ...p })),
  };
})(typeof window !== "undefined" ? window : globalThis);
