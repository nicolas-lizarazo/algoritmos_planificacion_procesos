/* ═══════════════════════════════════════════════════════════════════════════
 * render3d.js · Multi-Scene Engine (v3 · CORREGIDO)
 *   • Cámara (0,14,18) → encuadre holgado izquierda→derecha
 *   • ResizeObserver por escena
 *   • markIdle() para vaciar el socket cuando un panel finaliza
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  if (typeof THREE === "undefined") {
    console.error("[Render3D] Three.js no disponible.");
    global.Render3D = makeStub();
    return;
  }

  const PALETTE = [
    0x00f3ff, 0x39ff14, 0xffb300, 0xa855f7, 0xff0055, 0xff6b00, 0x00ffab,
    0xff00c8,
  ];

  /* Escala global para que todo encaje en la vista (0,14,18) */
  const SCALE = 2.2;

  const CFG = {
    blockSize: 0.75 * SCALE,
    queueSlots: 4,
    cpuPos: new THREE.Vector3(0.0, 0.0, 0.0),
    ramPos: new THREE.Vector3(-5.0 * (SCALE / 2), 0.0, 0.0),
    queuePos: new THREE.Vector3(3.5 * (SCALE / 2), 0.0, 0.0),
    queueStep: 1.35 * (SCALE / 1.6),
    smooth: 7.0,
    spin: 1.2,
    cameraPos: new THREE.Vector3(0, 14, 18),
    cameraLookAt: new THREE.Vector3(0, 0, 0),
  };

  function hexToCss(h) {
    return "#" + ("000000" + (h >>> 0).toString(16)).slice(-6);
  }
  function sm(dt, base) {
    return 1 - Math.exp(-dt * base);
  }

  function disposeObj(obj) {
    if (!obj) return;
    obj.traverse((c) => {
      if (c.geometry && c.geometry.dispose) c.geometry.dispose();
      if (c.material) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => {
          if (m.map && m.map.dispose) m.map.dispose();
          if (m.dispose) m.dispose();
        });
      }
    });
  }

  const labelCache = new Map();
  function makeLabel(pid, colorHex) {
    const key = `${pid}-${colorHex}`;
    if (labelCache.has(key)) return labelCache.get(key).clone();

    const cv = document.createElement("canvas");
    cv.width = 256;
    cv.height = 128;
    const ctx = cv.getContext("2d");
    const color = hexToCss(colorHex);
    ctx.clearRect(0, 0, 256, 128);
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.font = 'bold 88px "Orbitron", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pid, 128, 64);
    ctx.shadowBlur = 8;
    ctx.fillText(pid, 128, 64);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeText(pid, 128, 64);

    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.9, 0.45, 1);
    sprite.renderOrder = 999;
    labelCache.set(key, sprite);
    return sprite.clone();
  }

  class MiniBlock {
    constructor(pid, colorHex) {
      this.pid = pid;
      this.colorHex = colorHex;
      this.state = "in-ram";
      this.targetPos = new THREE.Vector3();
      this.targetScale = 1;
      this.targetOpacity = 1;
      this.floatPhase = Math.random() * Math.PI * 2;

      const s = CFG.blockSize;
      const geo = new THREE.BoxGeometry(s, s, s);
      const mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.55,
        metalness: 0.55,
        roughness: 0.35,
        flatShading: true,
        transparent: true,
        opacity: 1,
      });

      this.group = new THREE.Group();
      this.mesh = new THREE.Mesh(geo, mat);
      this.group.add(this.mesh);

      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
      });
      this.outline = new THREE.LineSegments(edges, lineMat);
      this.mesh.add(this.outline);

      this.label = makeLabel(pid, colorHex);
      this.label.position.set(0, s * 1.05, 0);
      this.group.add(this.label);
    }

    setTarget(pos, opts) {
      if (pos) this.targetPos.copy(pos);
      if (opts) {
        if (typeof opts.scale === "number") this.targetScale = opts.scale;
        if (typeof opts.opacity === "number") this.targetOpacity = opts.opacity;
        if (opts.state) this.state = opts.state;
      }
    }

    update(dt, timeMs) {
      const k = sm(dt, CFG.smooth);
      this.group.position.lerp(this.targetPos, k);

      const sc =
        this.group.scale.x + (this.targetScale - this.group.scale.x) * k;
      this.group.scale.setScalar(sc);

      const op = this.mesh.material.opacity;
      const nOp = op + (this.targetOpacity - op) * k;
      this.mesh.material.opacity = nOp;
      this.outline.material.opacity = 0.55 * nOp;
      this.label.material.opacity = nOp;

      if (this.state === "on-cpu") {
        this.group.rotation.y += dt * CFG.spin;
        this.mesh.position.y =
          Math.sin(timeMs * 0.004 + this.floatPhase) * 0.06;
        this.mesh.material.emissiveIntensity =
          0.9 + Math.sin(timeMs * 0.006) * 0.45;
      } else if (this.state === "in-queue") {
        this.mesh.position.y +=
          (Math.sin(timeMs * 0.003 + this.floatPhase) * 0.04 -
            this.mesh.position.y) *
          k;
        this.mesh.material.emissiveIntensity =
          0.5 + Math.sin(timeMs * 0.003) * 0.12;
      } else {
        this.mesh.position.y += (0 - this.mesh.position.y) * k;
        this.mesh.material.emissiveIntensity +=
          (0.5 - this.mesh.material.emissiveIntensity) * k;
      }
    }

    dispose() {
      disposeObj(this.group);
    }
  }

  class MiniScene {
    constructor(id, container) {
      this.id = id;
      this.container = container;
      this.blocks = new Map();
      this.colorMap = new Map();
      this.queueSlots = new Map();
      this.prevRunning = null;
      this.finished = false;

      /* ─── RENDERER NÍTIDO ─── */
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        alpha: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const w0 = container.clientWidth || 300;
      const h0 = container.clientHeight || 200;
      this.renderer.setSize(w0, h0, false);
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.domElement.style.display = "block";
      this.renderer.domElement.style.width = "100%";
      this.renderer.domElement.style.height = "100%";
      container.appendChild(this.renderer.domElement);

      /* ─── ESCENA ─── */
      this.scene = new THREE.Scene();
      this.scene.background = null;
      this.scene.fog = new THREE.FogExp2(0x05070a, 0.022);

      /* ─── CÁMARA FIJA SEGÚN REQUERIMIENTO ─── */
      this.camera = new THREE.PerspectiveCamera(45, w0 / h0, 0.1, 1000);
      this.camera.position.copy(CFG.cameraPos);
      this.camera.lookAt(CFG.cameraLookAt);

      /* ─── LUCES NÍTIDAS ─── */
      this.scene.add(new THREE.AmbientLight(0x2a3446, 0.95));

      const hemi = new THREE.HemisphereLight(0x223040, 0x08080c, 0.55);
      this.scene.add(hemi);

      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(6, 12, 8);
      this.scene.add(key);

      const fill = new THREE.DirectionalLight(0x88a0ff, 0.4);
      fill.position.set(-6, 4, -5);
      this.scene.add(fill);

      const cpuLight = new THREE.PointLight(0x00f3ff, 2.2, 8, 2);
      cpuLight.position.set(0, 2.5, 0);
      this.scene.add(cpuLight);

      const ramLight = new THREE.PointLight(0xa855f7, 1.4, 7, 2);
      ramLight.position.set(CFG.ramPos.x, 2.0, 0);
      this.scene.add(ramLight);

      const rim = new THREE.PointLight(0xff0055, 0.7, 10, 2);
      rim.position.set(-6, 3, -6);
      this.scene.add(rim);

      /* ─── GEOMETRÍA ─── */
      this._buildFloor();
      this._buildCPU();
      this._buildRAM();
      this._buildQueue();

      this._pulseTimer = 0;

      /* ─── ResizeObserver ─── */
      this._ro = null;
      if (typeof ResizeObserver !== "undefined") {
        this._ro = new ResizeObserver(() => this.resize());
        this._ro.observe(container);
      }
    }

    _buildFloor() {
      const grid = new THREE.GridHelper(24, 24, 0x1a2a3a, 0x0d1620);
      grid.material.transparent = true;
      grid.material.opacity = 0.4;
      grid.position.y = -0.01;
      this.scene.add(grid);
    }

    _buildCPU() {
      const grp = new THREE.Group();

      const baseGeo = new THREE.CylinderGeometry(1.6, 1.9, 0.5, 6);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x0d141f,
        metalness: 0.85,
        roughness: 0.28,
        flatShading: true,
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.25;
      grp.add(base);

      const discGeo = new THREE.CircleGeometry(1.45, 32);
      const discMat = new THREE.MeshBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.cpuDisc = new THREE.Mesh(discGeo, discMat);
      this.cpuDisc.rotation.x = -Math.PI / 2;
      this.cpuDisc.position.y = 0.51;
      grp.add(this.cpuDisc);

      const ringGeo = new THREE.TorusGeometry(1.6, 0.06, 6, 48);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f3ff });
      this.cpuRing = new THREE.Mesh(ringGeo, ringMat);
      this.cpuRing.rotation.x = Math.PI / 2;
      this.cpuRing.position.y = 0.52;
      grp.add(this.cpuRing);

      const coreGeo = new THREE.IcosahedronGeometry(0.28, 0);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x00f3ff,
        emissive: 0x00f3ff,
        emissiveIntensity: 1.6,
        metalness: 0.5,
        roughness: 0.2,
        flatShading: true,
      });
      this.cpuCore = new THREE.Mesh(coreGeo, coreMat);
      this.cpuCore.position.y = 1.15;
      grp.add(this.cpuCore);

      const slotGeo = new THREE.RingGeometry(0.65, 0.9, 6);
      const slotMat = new THREE.MeshBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const slot = new THREE.Mesh(slotGeo, slotMat);
      slot.rotation.x = -Math.PI / 2;
      slot.position.y = 0.53;
      grp.add(slot);

      this.scene.add(grp);
      this.cpuGroup = grp;
    }

    _buildRAM() {
      const grp = new THREE.Group();
      grp.position.copy(CFG.ramPos);

      const w = 3.0,
        d = 1.6,
        h = 0.22;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0c1018,
        metalness: 0.85,
        roughness: 0.35,
        flatShading: true,
      });
      const base = new THREE.Mesh(geo, mat);
      base.position.y = h / 2;
      grp.add(base);

      const edgeGeo = new THREE.EdgesGeometry(geo);
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xa855f7 });
      const edge = new THREE.LineSegments(edgeGeo, edgeMat);
      edge.position.y = h / 2;
      grp.add(edge);

      const glowGeo = new THREE.PlaneGeometry(w * 1.05, d * 1.05);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.005;
      grp.add(glow);

      this.scene.add(grp);
      this.ramGroup = grp;
    }

    _buildQueue() {
      this.queuePads = [];
      for (let i = 0; i < CFG.queueSlots; i++) {
        const pad = new THREE.Group();
        pad.position.set(CFG.queuePos.x + i * CFG.queueStep, 0.01, 0);
        const disc = new THREE.Mesh(
          new THREE.RingGeometry(0.4, 0.55, 6),
          new THREE.MeshBasicMaterial({
            color: 0xffb300,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        disc.rotation.x = -Math.PI / 2;
        pad.add(disc);
        this.scene.add(pad);
        this.queuePads.push(pad);
      }
    }

    pickColor(pid) {
      if (this.colorMap.has(pid)) return this.colorMap.get(pid);
      let idx = this.colorMap.size;
      const m = /^P(\d+)$/.exec(pid);
      if (m) idx = (parseInt(m[1], 10) - 1) % PALETTE.length;
      const c = PALETTE[idx];
      this.colorMap.set(pid, c);
      return c;
    }

    registerProcess(spec) {
      const pid = String(spec.pid || "");
      if (!pid || this.blocks.has(pid)) return;
      const color =
        (typeof spec.color === "number" && spec.color) || this.pickColor(pid);
      const blk = new MiniBlock(pid, color);

      const ramPos = this._ramSlotPos(this.blocks.size);
      blk.group.position.copy(ramPos).add(new THREE.Vector3(0, 4.5, 0));
      blk.setTarget(ramPos, { scale: 1, opacity: 1, state: "in-ram" });

      this.scene.add(blk.group);
      this.blocks.set(pid, blk);
    }

    unregisterProcess(pid) {
      const b = this.blocks.get(pid);
      if (!b) return;
      this.scene.remove(b.group);
      b.dispose();
      this.blocks.delete(pid);
      this.queueSlots.delete(pid);
      this.colorMap.delete(pid);
    }

    clear() {
      for (const pid of Array.from(this.blocks.keys()))
        this.unregisterProcess(pid);
      this.queueSlots.clear();
      this.colorMap.clear();
      this.prevRunning = null;
      this.finished = false;
    }

    _ramSlotPos(index) {
      const base = CFG.ramPos.clone();
      const col = index % 3;
      const row = Math.floor(index / 3);
      base.x += (col - 1) * 0.85;
      base.y += 0.55;
      base.z += (row - 0.5) * 0.85;
      return base;
    }

    _queueSlotPos(index) {
      const p = CFG.queuePos.clone();
      p.x += index * CFG.queueStep;
      p.y += 0.75;
      return p;
    }

    _freeQueueSlot() {
      for (let i = 0; i < CFG.queueSlots; i++) {
        let used = false;
        for (const [, s] of this.queueSlots)
          if (s === i) {
            used = true;
            break;
          }
        if (!used) return i;
      }
      return 0;
    }

    syncState(state) {
      if (!state) return;
      if (this.finished) return;

      const running = state.running || null;
      const ready = Array.isArray(state.ready) ? state.ready : [];
      const completed = Array.isArray(state.completed) ? state.completed : [];
      const prev = this.prevRunning;

      if (prev && prev !== running) {
        const b = this.blocks.get(prev);
        if (b && b.state !== "completed") {
          if (completed.indexOf(prev) >= 0) {
            b.setTarget(b.targetPos.clone().add(new THREE.Vector3(0, 5, 0)), {
              scale: 0.2,
              opacity: 0,
              state: "completed",
            });
          } else {
            let slot = this.queueSlots.get(prev);
            if (slot == null || slot < 0) {
              slot = this._freeQueueSlot();
              this.queueSlots.set(prev, slot);
            }
            b.setTarget(this._queueSlotPos(slot), { state: "in-queue" });
            b.group.position.y += 0.5;
          }
        }
      }

      for (const pid of ready) {
        const b = this.blocks.get(pid);
        if (!b) continue;
        let slot = this.queueSlots.get(pid);
        if (slot == null || slot < 0) {
          slot = this._freeQueueSlot();
          this.queueSlots.set(pid, slot);
        }
        if (b.state !== "in-queue") {
          b.setTarget(this._queueSlotPos(slot), {
            state: "in-queue",
            scale: 1,
            opacity: 1,
          });
        }
      }

      if (running) {
        const b = this.blocks.get(running);
        if (b && b.state !== "on-cpu") {
          this.queueSlots.delete(running);
          b.setTarget(CFG.cpuPos.clone().add(new THREE.Vector3(0, 0.9, 0)), {
            state: "on-cpu",
            scale: 1.12,
            opacity: 1,
          });
          this._pulseTimer = 0.8;
        }
      }

      this.prevRunning = running;
    }

    /**
     * Marca la escena como finalizada: vacía el socket de CPU y
     * manda todos los bloques restantes al limbo visual.
     */
    markIdle() {
      this.finished = true;
      /* Enviar todos los bloques al lateral derecho (zona de completados) */
      let i = 0;
      this.blocks.forEach((b) => {
        const target = CFG.queuePos.clone();
        target.x += i * CFG.queueStep;
        target.y = 0.75 + i * 0.05;
        target.z = -1.5;
        b.setTarget(target, { state: "completed", scale: 0.75, opacity: 0.4 });
        i++;
      });
      this.queueSlots.clear();
      this.prevRunning = null;
      if (this.cpuDisc) this.cpuDisc.material.opacity = 0.08;
    }

    reset() {
      this.clear();
      this.finished = false;
      if (this.cpuDisc) this.cpuDisc.material.opacity = 0.3;
    }

    resize() {
      if (!this.container) return;
      const w = this.container.clientWidth || 1;
      const h = this.container.clientHeight || 1;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    render(dt, timeMs) {
      this.blocks.forEach((b) => b.update(dt, timeMs));

      if (this.cpuCore) {
        this.cpuCore.rotation.y += dt * 0.9;
        this.cpuCore.rotation.x += dt * 0.35;
      }
      if (this.cpuRing) this.cpuRing.rotation.z += dt * 0.3;

      if (this._pulseTimer > 0) {
        this._pulseTimer -= dt;
        const t = Math.max(0, this._pulseTimer / 0.8);
        if (this.cpuDisc && !this.finished)
          this.cpuDisc.material.opacity = 0.15 + 0.4 * t;
      } else if (this.cpuDisc && !this.finished) {
        const running = this.prevRunning != null;
        const target = running ? 0.38 : 0.18;
        this.cpuDisc.material.opacity +=
          (target - this.cpuDisc.material.opacity) * 0.08;
      }

      this.renderer.render(this.scene, this.camera);
    }

    dispose() {
      if (this._ro) {
        this._ro.disconnect();
        this._ro = null;
      }
      this.clear();
      disposeObj(this.scene);
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(
            this.renderer.domElement,
          );
        }
      }
      this.renderer = null;
      this.scene = null;
      this.camera = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
   * REGISTRY
   * ═══════════════════════════════════════════════════════════════ */
  const scenes = new Map();
  let running = false;
  let rafId = null;
  let lastTime = 0;
  let autoOrbit = false;

  function createScene(id, container) {
    if (scenes.has(id)) return scenes.get(id);
    if (!container) {
      container = document.querySelector(`[data-canvas="${id}"]`);
      if (!container) return null;
    }
    const sc = new MiniScene(id, container);
    scenes.set(id, sc);
    return sc;
  }

  function getScene(id) {
    return scenes.get(id) || null;
  }
  function destroyScene(id) {
    const sc = scenes.get(id);
    if (!sc) return;
    sc.dispose();
    scenes.delete(id);
  }
  function destroyAll() {
    for (const id of Array.from(scenes.keys())) destroyScene(id);
  }

  function resize() {
    scenes.forEach((sc) => sc.resize());
  }

  function loop(t) {
    rafId = requestAnimationFrame(loop);
    const dt = lastTime ? Math.min((t - lastTime) / 1000, 0.05) : 0;
    lastTime = t;
    scenes.forEach((sc) => sc.render(dt, t));
  }

  function init() {
    if (running) return true;
    running = true;
    lastTime = 0;
    rafId = requestAnimationFrame(loop);
    window.addEventListener("resize", resize);
    return true;
  }

  function start() {
    init();
  }
  function stop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    running = false;
  }
  function dispose() {
    stop();
    destroyAll();
    window.removeEventListener("resize", resize);
  }
  function setAutoOrbit(v) {
    autoOrbit = !!v;
  }
  function isReady() {
    return typeof THREE !== "undefined";
  }

  function makeStub() {
    const noop = () => {};
    return {
      isReady: () => false,
      init: () => false,
      start: noop,
      stop: noop,
      resize: noop,
      dispose: noop,
      createScene: () => null,
      getScene: () => null,
      destroyScene: noop,
      setAutoOrbit: noop,
    };
  }

  global.Render3D = {
    init,
    start,
    stop,
    resize,
    dispose,
    createScene,
    getScene,
    destroyScene,
    setAutoOrbit,
    isReady,
    get sceneCount() {
      return scenes.size;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
