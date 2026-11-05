/* ============================================================
   TFT-FX.JS — efeitos da qualidade Alto do Mudae TFT
   ------------------------------------------------------------
   Só desenha: lê os eventos do combate e nunca muda o resultado.
   Na qualidade Baixo nada aqui roda e nenhum canvas é criado.
   ============================================================ */
const TFTFx = (() => {
  'use strict';

  const E = TFTEngine;
  const QUALITY_KEY = 'mudaeTft_quality';
  const FPS_KEY = 'mudaeTft_showFps';
  const MAX_EFFECTS = 400;
  const MAX_PARTICLES = 5000;
  const MAX_DPR = 2;
  const TAU = Math.PI * 2;
  const COLOR = { p: '#ff9b4a', m: '#6ea8ff', t: '#f4f0ff', heal: '#5ee0a0', shield: '#f5d76e' };

  /* Visual de cada etapa do golpe, na mesma ordem de ABILITIES[nome].steps */
  const STEP_FX = {
    'Alistar': [{ kind: 'slam', color: '#f5c542' }],
    'Mordekaiser': [{ kind: 'beam', color: '#8ef0b0', width: 0.75, dur: 0.3, slam: true }],
    'Leona': [{ kind: 'sunburst', color: '#ffd66b' }],
    'Gragas': [{ kind: 'throw', obj: 'barrel', color: '#d9a05b', blast: 1 }],
    'Brand': [{ kind: 'throw', obj: 'inkBomb', color: '#c86bff', blast: 1 }, { kind: 'darts', color: '#c86bff', n: 4 }],
    'Aphelios': [{ kind: 'throw', obj: 'moon', color: '#b9c6ff', blast: 2, flat: true }],
    'Ziggs': [{ kind: 'throw', obj: 'bomb', color: '#ffb347', blast: 1, plus: true }],
    'Sejuani': [{ kind: 'charge', color: '#7fd4ff' }],
    'Galio': [{ kind: 'whirl', color: '#cfe3ff' }],
    'Poppy': [{ kind: 'shot', obj: 'shield', color: '#f5d76e', blast: 1 }],
    'Twisted Fate': [{ kind: 'shot', obj: 'card', color: '#e0526b' }, { kind: 'shot', obj: 'card', color: '#5f8bff', toNearest: true }],
    'Kindred': [{ kind: 'shot', obj: 'wolf', color: '#9fb4ff' }],
    'Annie': [{ kind: 'shot', obj: 'fireball', color: '#ff7a2f', blast: 0.6 }, { kind: 'darts', color: '#ff7a2f', n: 2 }],
    'Zyra': [{ kind: 'vine', color: '#5fd16b' }, { kind: 'vine', color: '#8fe08f', toNearest: true }],
    'Senna': [{ kind: 'beam', color: '#a8f5e8', width: 0.42, dur: 0.32 }],
    'Draven': [{ kind: 'axe', color: '#e8574f' }, { kind: 'axe', color: '#e8574f', back: true }],
    'Seraphine': [{ kind: 'wave', color: '#ff8ad8', arcs: 4 }],
    'Garen': [{ kind: 'slam', color: '#ffe08a' }, { kind: 'wave', color: '#ffe08a', arcs: 3 }],
    'Vex': [{ kind: 'beam', color: '#7a5cff', width: 0.5, dur: 0.3 }, { kind: 'blast', color: '#a07bff', radius: 1 }],
    "Cho'Gath": [{ kind: 'cone', color: '#b06bff', len: 3 }],
    'Graves': [{ kind: 'cone', color: '#ffb347', len: 3, pellets: true }],
  };

  let enabled = false;
  let reduced = false;
  let ctx = null, canvas = null, board = null;
  let cfg = null;                  // { flip, els, metas }
  let W = 0, H = 0, dpr = 1;
  let effects = [], particles = [];
  let raf = 0, last = 0, observer = null;
  const fps = { show: false, el: null, frames: 0, sum: 0, worst: 0, draw: 0, drawWorst: 0, peakFx: 0, peakParticles: 0, since: 0, last: null };

  function readStore(key) { try { return localStorage.getItem(key); } catch (err) { return null; } }
  function writeStore(key, value) { try { localStorage.setItem(key, value); } catch (err) { /* sem armazenamento */ } }

  /* ---------- Posições: frações do tabuleiro, para valer em qualquer tamanho ---------- */
  const BOARD_W = 7.5, BOARD_H = 7.2169;
  function cellPos(c, r) {
    const [dc, dr] = cfg && cfg.flip ? [6 - c, 7 - r] : [c, r];
    const left = (dc + (dr & 1 ? 0.5 : 0)) / BOARD_W;
    const bottom = (dr * 0.866) / BOARD_H;
    return { x: left + 0.0667, y: 1 - bottom - 0.08 };
  }
  function unitPos(id) {
    const el = cfg && cfg.els.get(id);
    if (!el) return null;
    return { x: parseFloat(el.style.left) / 100 + 0.0667, y: 1 - parseFloat(el.style.bottom) / 100 - 0.08 };
  }
  const px = p => ({ x: p.x * W, y: p.y * H });
  const cellSize = () => W * 0.1333;

  /* ---------- Motor de desenho ---------- */
  function add(effect) {
    if (effects.length >= MAX_EFFECTS) return;
    effect.t = -(effect.delay || 0);
    effects.push(effect);
    wake();
  }

  function burst(p, color, n, speed = 1) {
    if (reduced) return;
    const at = px(p);
    const room = Math.min(n, MAX_PARTICLES - particles.length);
    for (let i = 0; i < room; i++) {
      const a = Math.random() * TAU, v = (0.3 + Math.random()) * cellSize() * 1.7 * speed;
      particles.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.25 + Math.random() * 0.3, color });
    }
    wake();
  }

  function shake(power) {
    if (reduced || !board || !board.animate) return;
    const d = power * 4;
    board.animate([
      { transform: 'translate(0, 0)' }, { transform: `translate(${d}px, ${-d}px)` }, { transform: `translate(${-d}px, ${d * 0.6}px)` },
      { transform: `translate(${d * 0.5}px, ${d * 0.4}px)` }, { transform: 'translate(0, 0)' },
    ], { duration: 240, easing: 'ease-out' });
  }

  function wake() {
    if (!raf && enabled && ctx) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  function frame(now) {
    raf = 0;
    if (!ctx) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (const fx of effects) {
      fx.t += dt;
      if (fx.t < 0) continue;
      const p = Math.min(1, fx.t / fx.dur);
      if (fx.update) fx.update(p, dt);
      ctx.save();
      fx.draw(p);
      ctx.restore();
      if (p >= 1) {
        fx.done = true;
        if (fx.onEnd) fx.onEnd();
      }
    }
    effects = effects.filter(fx => !fx.done);

    if (particles.length) {
      for (const pt of particles) {
        pt.life += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 0.93;
        pt.vy *= 0.93;
        ctx.globalAlpha = Math.max(0, 1 - pt.life / pt.max);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;
      particles = particles.filter(pt => pt.life < pt.max);
    }

    const drawMs = performance.now() - t0;
    fps.draw += drawMs;
    fps.drawWorst = Math.max(fps.drawWorst, drawMs);
    fps.peakFx = Math.max(fps.peakFx, effects.length);
    fps.peakParticles = Math.max(fps.peakParticles, particles.length);
    if (effects.length || particles.length) raf = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, W, H);
  }

  /* ---------- Objetos desenhados ---------- */
  const DRAW = {
    card(s, color) {
      ctx.fillStyle = '#f7f1e3';
      ctx.strokeStyle = color;
      ctx.lineWidth = s * 0.14;
      ctx.beginPath();
      ctx.roundRect(-s * 0.55, -s * 0.8, s * 1.1, s * 1.6, s * 0.14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.4);
      ctx.lineTo(s * 0.3, 0);
      ctx.lineTo(0, s * 0.4);
      ctx.lineTo(-s * 0.3, 0);
      ctx.fill();
    },
    barrel(s) {
      ctx.fillStyle = '#a56a32';
      ctx.beginPath();
      ctx.roundRect(-s * 0.8, -s, s * 1.6, s * 2, s * 0.4);
      ctx.fill();
      ctx.fillStyle = '#5b3a1c';
      ctx.fillRect(-s * 0.85, -s * 0.55, s * 1.7, s * 0.25);
      ctx.fillRect(-s * 0.85, s * 0.3, s * 1.7, s * 0.25);
    },
    bomb(s, color) {
      ctx.fillStyle = '#24283b';
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = s * 0.25;
      ctx.beginPath();
      ctx.moveTo(s * 0.5, -s * 0.8);
      ctx.quadraticCurveTo(s, -s * 1.5, s * 1.5, -s * 1.2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s * 1.5, -s * 1.2, s * 0.35, 0, TAU);
      ctx.fill();
    },
    inkBomb(s, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, TAU);
      ctx.fill();
    },
    moon(s, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0.6, TAU - 0.6);
      ctx.arc(s * 0.45, 0, s * 0.72, TAU - 1, 1, true);
      ctx.fill();
    },
    shield(s, color) {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#7a5a1c';
      ctx.lineWidth = s * 0.15;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.9, -s * 0.6);
      ctx.quadraticCurveTo(s * 0.9, s * 0.5, 0, s);
      ctx.quadraticCurveTo(-s * 0.9, s * 0.5, -s * 0.9, -s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
    wolf(s, color) {
      ctx.fillStyle = '#e8ecff';
      ctx.beginPath();
      ctx.moveTo(s * 1.2, 0);
      ctx.lineTo(s * 0.2, -s * 0.55);
      ctx.lineTo(-s * 0.1, -s);
      ctx.lineTo(-s * 0.35, -s * 0.5);
      ctx.lineTo(-s, -s * 0.2);
      ctx.lineTo(-s * 0.7, s * 0.5);
      ctx.lineTo(s * 0.2, s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(s * 0.3, -s * 0.2, s * 0.13, 0, TAU);
      ctx.fill();
    },
    fireball(s, color) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.4);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.45, color);
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, s * 1.4, 0, TAU);
      ctx.fill();
    },
    axe(s, color) {
      ctx.strokeStyle = '#6b4a2a';
      ctx.lineWidth = s * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, s * 1.1);
      ctx.lineTo(0, -s * 0.8);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.1);
      ctx.quadraticCurveTo(s * 1.4, -s * 0.9, s * 1.1, s * 0.2);
      ctx.quadraticCurveTo(s * 0.6, -s * 0.4, 0, -s * 0.2);
      ctx.quadraticCurveTo(-s * 0.6, -s * 0.4, -s * 1.1, s * 0.2);
      ctx.quadraticCurveTo(-s * 1.4, -s * 0.9, 0, -s * 1.1);
      ctx.fill();
    },
    star(s, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? s * 0.4 : s;
        const a = i * Math.PI / 4;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    },
  };

  /* ---------- Famílias de efeito ---------- */
  function fxRing(p0, opts) {
    const { color, radius = 1, dur = 0.4, delay = 0, fill = 0.18, width = 4 } = opts;
    add({
      dur, delay,
      draw(p) {
        const at = px(p0);
        const r = cellSize() * (0.25 + radius * Math.sqrt(p));
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = color;
        ctx.lineWidth = width * (1 - p * 0.6);
        ctx.beginPath();
        ctx.ellipse(at.x, at.y, r, r * 0.86, 0, 0, TAU);
        ctx.stroke();
        if (fill) {
          ctx.globalAlpha = (1 - p) * fill;
          ctx.fillStyle = color;
          ctx.fill();
        }
      },
    });
  }

  function fxBlast(p0, color, radius, delay = 0) {
    fxRing(p0, { color, radius: radius + 0.3, dur: 0.42, delay });
    fxRing(p0, { color: '#ffffff', radius: (radius + 0.3) * 0.55, dur: 0.26, delay, fill: 0.35, width: 3 });
    const t = setTimeout(() => {
      burst(p0, color, 18 + Math.round(radius * 14));
      if (radius >= 1) shake(Math.min(1.4, radius * 0.7));
    }, delay * 1000);
    timers.push(t);
  }

  function fxProjectile(from, to, opts) {
    const { obj, color, dur, arc = 0, spin = 0, size = 0.16, onEnd, flat = false } = opts;
    add({
      dur,
      draw(p) {
        const a = px(from), b = px(to);
        const x = a.x + (b.x - a.x) * p;
        const lift = arc * Math.sin(p * Math.PI) * cellSize();
        const y = a.y + (b.y - a.y) * p - lift;
        if (arc) {
          // sombra no chão: mostra onde o arremesso vai cair
          const gy = a.y + (b.y - a.y) * p;
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.ellipse(x, gy, cellSize() * size * 0.9, cellSize() * size * 0.4, 0, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.translate(x, y);
        ctx.rotate(spin ? spin * p * TAU : flat ? 0 : Math.atan2(b.y - a.y, b.x - a.x));
        DRAW[obj](cellSize() * size, color);
      },
      onEnd,
    });
  }

  function fxBeam(from, to, color, width, dur, extendCells = 0) {
    add({
      dur,
      draw(p) {
        const a = px(from), b = px(to);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = Math.hypot(b.x - a.x, b.y - a.y) + extendCells * cellSize();
        const w = cellSize() * width * (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8);
        ctx.translate(a.x, a.y);
        ctx.rotate(ang);
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = color;
        ctx.fillRect(0, -w / 2, len, w);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, -w / 6, len, w / 3);
      },
    });
  }

  function fxWaveLine(from, to, color, arcs, extendCells) {
    add({
      dur: 0.5,
      draw(p) {
        const a = px(from), b = px(to);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = Math.hypot(b.x - a.x, b.y - a.y) + extendCells * cellSize();
        ctx.translate(a.x, a.y);
        ctx.rotate(ang);
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        for (let i = 0; i < arcs; i++) {
          const q = p - i * 0.1;
          if (q < 0) continue;
          ctx.globalAlpha = Math.max(0, (1 - q) * (1 - i * 0.18));
          ctx.beginPath();
          ctx.arc(q * len, 0, cellSize() * 0.55, -1, 1);
          ctx.stroke();
        }
      },
    });
  }

  function fxCone(from, to, color, lenCells, pellets) {
    add({
      dur: 0.32,
      draw(p) {
        const a = px(from), b = px(to);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = lenCells * cellSize() * (0.35 + 0.65 * p);
        ctx.translate(a.x, a.y);
        ctx.rotate(ang);
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, len, -0.8, 0.8);
        ctx.closePath();
        ctx.fill();
        if (pellets) {
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = '#fff3c4';
          for (let i = -2; i <= 2; i++) {
            ctx.save();
            ctx.rotate(i * 0.3);
            ctx.fillRect(len * 0.72, -1.5, cellSize() * 0.22, 3);
            ctx.restore();
          }
        } else {
          ctx.globalAlpha = 1 - p;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, len, -0.8, 0.8);
          ctx.stroke();
        }
      },
    });
  }

  function fxSlash(p0, color, big = false) {
    const angle = Math.random() * TAU;
    add({
      dur: big ? 0.26 : 0.16,
      draw(p) {
        const at = px(p0);
        const s = cellSize() * (big ? 0.55 : 0.32);
        ctx.translate(at.x, at.y);
        ctx.rotate(angle);
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = color;
        ctx.lineWidth = big ? 6 : 3;
        ctx.beginPath();
        ctx.arc(0, 0, s, -1.2 + p, 1.2 + p);
        ctx.stroke();
      },
    });
  }

  function fxVine(from, to, color) {
    const wob = (Math.random() - 0.5) * 2;
    add({
      dur: 0.42,
      draw(p) {
        const a = px(from), b = px(to);
        const grow = Math.min(1, p * 2.2);
        const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.25 * wob, my = (a.y + b.y) / 2 - (b.x - a.x) * 0.25 * wob;
        ctx.globalAlpha = p > 0.7 ? (1 - p) / 0.3 : 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const steps = 14;
        for (let i = 0; i <= steps * grow; i++) {
          const k = i / steps, u = 1 - k;
          const x = u * u * a.x + 2 * u * k * mx + k * k * b.x;
          const y = u * u * a.y + 2 * u * k * my + k * k * b.y;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      },
    });
  }

  function fxWhirl(from, to, color) {
    add({
      dur: 0.5,
      draw(p) {
        const a = px(from), b = px(to);
        const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;
        const s = cellSize() * 0.5;
        ctx.translate(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(0, -i * s * 0.32, s * (0.3 + i * 0.22), s * (0.1 + i * 0.05), p * 8 + i, 0, TAU);
          ctx.stroke();
        }
      },
    });
  }

  function fxAura(id, color, dur, radius = 0.6) {
    add({
      dur,
      draw(p) {
        const pos = unitPos(id);
        if (!pos) return;
        const at = px(pos);
        const pulse = 1 + Math.sin(p * dur * 8) * 0.06;
        ctx.globalAlpha = 0.55 * (p > 0.8 ? (1 - p) / 0.2 : 1);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(at.x, at.y, cellSize() * radius * pulse, cellSize() * radius * 0.92 * pulse, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha *= 0.3;
        ctx.fillStyle = color;
        ctx.fill();
      },
    });
  }

  // Tontura: estrelas girando sobre a cabeça, enquanto o stun durar.
  function fxStun(id, dur) {
    add({
      dur,
      draw(p) {
        const pos = unitPos(id);
        if (!pos) return;
        const at = px(pos);
        const y = at.y - cellSize() * 0.58;
        for (let i = 0; i < 3; i++) {
          const a = p * dur * 6 + i * TAU / 3;
          ctx.save();
          ctx.translate(at.x + Math.cos(a) * cellSize() * 0.27, y + Math.sin(a) * cellSize() * 0.08);
          DRAW.star(cellSize() * 0.085, '#ffe36e');
          ctx.restore();
        }
      },
    });
  }

  // Aviso no chão enquanto a onda carrega, antes de explodir.
  function fxWarning(p0, color, radius, dur) {
    add({
      dur,
      draw(p) {
        const at = px(p0);
        const r = cellSize() * (radius + 0.3);
        ctx.globalAlpha = 0.14 + p * 0.2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(at.x, at.y, r, r * 0.86, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -p * 60;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(at.x, at.y, r * p, r * p * 0.86, 0, 0, TAU);
        ctx.stroke();
      },
    });
  }

  function endOfLine(from, to, cells) {
    const a = px(from), b = px(to);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = cells * cellSize();
    return { x: (a.x + Math.cos(ang) * len) / W, y: (a.y + Math.sin(ang) * len) / H };
  }

  /* ---------- Etapa do golpe (evento 'fx') ---------- */
  function playStep(ev) {
    const [, casterId, idx, targetId, c, r, delay] = ev;
    const meta = cfg.metas.get(casterId);
    if (!meta || !meta.champ) return;
    const name = E.CH[meta.champ].name;
    const visual = (STEP_FX[name] || [])[idx];
    const step = (E.ABILITIES[name].steps || [])[idx];
    if (!visual || !step) return;
    const from = unitPos(casterId);
    if (!from) return;
    const aim = cellPos(c, r);
    const wait = (step.delay || 0);
    const after = (ms, fn) => timers.push(setTimeout(fn, ms * 1000));
    const travel = Math.max(0.1, delay - wait);
    const nearestTo = () => {
      // o segundo projétil vai ao inimigo mais perto do alvo, como na regra
      let best = null, bd = Infinity;
      for (const m of cfg.metas.values()) {
        if (m.side === meta.side || m.id === targetId) continue;
        const pos = unitPos(m.id);
        const el = cfg.els.get(m.id);
        if (!pos || !el || el.classList.contains('dead')) continue;
        const d = Math.hypot(pos.x - aim.x, pos.y - aim.y);
        if (d < bd) { best = pos; bd = d; }
      }
      return best || aim;
    };

    switch (visual.kind) {
      case 'slam':
        fxBlast(aim, visual.color, 0.45, wait);
        fxSlash(aim, visual.color, true);
        break;
      case 'sunburst':
        add({
          dur: 0.45,
          draw(p) {
            const at = px(aim);
            ctx.translate(at.x, at.y);
            ctx.globalAlpha = 1 - p;
            ctx.fillStyle = visual.color;
            const top = H * (1 - p);
            ctx.fillRect(-cellSize() * 0.2 * (1 - p), -top, cellSize() * 0.4 * (1 - p), top);
          },
        });
        fxBlast(aim, visual.color, step.radius || 1);
        break;
      case 'charge':
        fxWarning(aim, visual.color, step.radius || 1, wait);
        fxBlast(aim, visual.color, step.radius || 1, wait);
        break;
      case 'whirl':
        fxWhirl(from, endOfLine(from, aim, step.len || 3), visual.color);
        break;
      case 'throw':
        fxProjectile(from, aim, {
          obj: visual.obj, color: visual.color, dur: travel, arc: 1.2, spin: visual.flat ? 0 : 1.5, size: 0.2, flat: visual.flat,
          onEnd() {
            fxBlast(aim, visual.color, visual.blast || 1);
            if (visual.plus) {
              fxBeam({ x: 0, y: aim.y }, { x: 1, y: aim.y }, visual.color, 0.3, 0.3);
              fxBeam({ x: aim.x, y: 0 }, { x: aim.x, y: 1 }, visual.color, 0.3, 0.3);
            }
          },
        });
        break;
      case 'shot': {
        const to = visual.toNearest ? nearestTo() : aim;
        const isCard = visual.obj === 'card';
        fxProjectile(from, to, {
          obj: visual.obj, color: visual.color, dur: travel, spin: isCard ? 2.5 : visual.obj === 'shield' ? 2 : 0, size: visual.obj === 'wolf' ? 0.26 : 0.17,
          onEnd() {
            if (visual.blast) fxBlast(to, visual.color, visual.blast);
            else { fxRing(to, { color: visual.color, radius: 0.35, dur: 0.22 }); burst(to, visual.color, 10); }
          },
        });
        break;
      }
      case 'darts': {
        const n = visual.n || 2;
        for (let i = 0; i < n; i++) {
          after(wait + i * 0.05, () => {
            const to = nearestTo();
            fxProjectile(aim, to, { obj: 'fireball', color: visual.color, dur: 0.16, size: 0.08, onEnd() { burst(to, visual.color, 5); } });
          });
        }
        break;
      }
      case 'vine': {
        const to = visual.toNearest ? nearestTo() : aim;
        fxVine(from, to, visual.color);
        after(travel, () => fxRing(to, { color: visual.color, radius: 0.4, dur: 0.25 }));
        break;
      }
      case 'beam': {
        const extend = step.beyond || (step.len === 'edge' ? 10 : 0);
        const target = step.len && step.len !== 'edge' ? endOfLine(from, aim, step.len) : aim;
        fxBeam(from, target, visual.color, visual.width, visual.dur, extend);
        if (visual.slam) fxSlash(aim, visual.color, true);
        break;
      }
      case 'axe': {
        const edge = endOfLine(from, aim, 8);
        fxProjectile(visual.back ? edge : from, visual.back ? from : edge, { obj: 'axe', color: visual.color, dur: 0.48, spin: 3, size: 0.22 });
        break;
      }
      case 'wave':
        after(wait, () => fxWaveLine(from, aim, visual.color, visual.arcs || 3, 10));
        break;
      case 'blast':
        fxBlast(aim, visual.color, visual.radius || 1, wait);
        break;
      case 'cone':
        fxCone(from, aim, visual.color, visual.len || 3, visual.pellets);
        break;
      default:
        break;
    }
  }

  /* ---------- Conjuração (evento 'c'): os golpes das próximas etapas usam isto ---------- */
  function playCast(casterId, targetId) {
    const meta = cfg.metas.get(casterId);
    if (!meta || !meta.champ) return;
    const name = E.CH[meta.champ].name;
    const spec = E.ABILITIES[name];
    if (!spec) return;
    const star = meta.star || 1;
    if (spec.durable) fxAura(casterId, '#cfe3ff', spec.durableDur, 0.62);
    if (spec.shield) fxAura(casterId, COLOR.shield, Math.min(spec.shieldDur || 2, 3), 0.6);
    if (spec.heal) fxRing(unitPos(casterId), { color: COLOR.heal, radius: 0.4, dur: 0.4 });
    if (spec.hpGain) fxRing(unitPos(casterId), { color: COLOR.heal, radius: 0.55, dur: 0.5 });
    if (spec.buffAS) fxAura(casterId, '#ffcf6b', spec.buffDur, 0.55);
    if (spec.aura) fxAura(casterId, '#ff7a2f', Math.min(spec.auraDur, 6), 0.6 + (spec.auraRadius || 1) * 0.5);
    if (spec.steps) return; // o resto vem dos eventos 'fx'

    const from = unitPos(casterId), to = unitPos(targetId);
    if (!from || !to) return;
    const color = COLOR[spec.type || 'm'];
    const shots = Math.max(1, Math.min(10, spec.volley || 1));
    for (let i = 0; i < shots; i++) {
      timers.push(setTimeout(() => {
        const landing = unitPos(targetId) || to;
        fxProjectile(from, landing, { obj: 'fireball', color, dur: 0.14, size: spec.volley ? 0.08 : 0.13, onEnd() { burst(landing, color, 6); } });
      }, i * 150));
    }
    if (spec.radius) fxBlast(to, color, spec.radius);
    void star;
  }

  function playAttack(ev) {
    const [, id, targetId, kind] = ev;
    const from = unitPos(id), to = unitPos(targetId);
    if (!from || !to) return;
    const meta = cfg.metas.get(id);
    const ranged = meta && meta.champ && E.CH[meta.champ].range > 2;
    if (kind === 'boom' || kind === 'anima') {
      const color = kind === 'boom' ? '#ec2f9c' : '#22d3ee';
      fxProjectile(from, to, { obj: 'fireball', color, dur: 0.2, size: 0.09 });
    } else if (ranged) {
      add({
        dur: 0.14,
        draw(p) {
          const a = px(from), b = px(to);
          const x = a.x + (b.x - a.x) * p, y = a.y + (b.y - a.y) * p;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.fillStyle = '#fde68a';
          ctx.fillRect(-cellSize() * 0.12, -1.5, cellSize() * 0.24, 3);
        },
      });
    } else {
      fxSlash(to, '#ffffff');
    }
  }

  /* ---------- Interface com tft.js ---------- */
  let timers = [];

  function event(ev) {
    if (!enabled || !ctx || !cfg) return;
    const kind = ev[0];
    if (kind === 'fx') playStep(ev);
    else if (kind === 'c') playCast(ev[1], ev[2]);
    else if (kind === 'a') playAttack(ev);
    else if (kind === 'st') { if (ev[2] > 0.1) fxStun(ev[1], ev[2]); }
    else if (kind === 'd' && ev[4]) { const p = unitPos(ev[1]); if (p) burst(p, '#ffe36e', 6); }
    else if (kind === 'x') { const p = unitPos(ev[1]); if (p) burst(p, '#cbd5e1', 16); }
  }

  function resize() {
    if (!canvas || !board) return;
    const rect = board.getBoundingClientRect();
    dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }

  /* Chamado ao iniciar a reprodução de uma luta. Devolve false se não puder desenhar. */
  function begin(boardEl, config) {
    end();
    if (!enabled) return false;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    ctx = canvas.getContext('2d');
    if (!ctx || !ctx.roundRect) {
      canvas = null;
      ctx = null;
      setQuality('low');
      return false;
    }
    board = boardEl;
    cfg = config;
    board.appendChild(canvas);
    resize();
    observer = new ResizeObserver(resize);
    observer.observe(board);
    return true;
  }

  function end() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    timers.forEach(clearTimeout);
    timers = [];
    if (observer) observer.disconnect();
    observer = null;
    if (canvas) canvas.remove();
    canvas = null;
    ctx = null;
    board = null;
    cfg = null;
    effects = [];
    particles = [];
  }

  /* ---------- Qualidade e contador de FPS ---------- */
  function setQuality(value, persist = true) {
    enabled = value === 'high';
    if (!enabled) end();
    if (persist) writeStore(QUALITY_KEY, enabled ? 'high' : 'low');
    updateFpsVisibility();
  }
  const getQuality = () => (enabled ? 'high' : 'low');

  function fpsLoop(now) {
    if (!fps.show) { fps.loop = 0; return; }
    const prev = fps.prev || now;
    fps.prev = now;
    const dt = now - prev;
    fps.frames++;
    fps.sum += dt;
    fps.worst = Math.max(fps.worst, dt);
    if (now - fps.since >= 1000) {
      const stat = {
        fps: Math.round(fps.frames * 1000 / Math.max(1, fps.sum)),
        worstMs: Math.round(fps.worst * 10) / 10,
        drawMs: Math.round((fps.draw / Math.max(1, fps.frames)) * 100) / 100,
        drawWorstMs: Math.round(fps.drawWorst * 100) / 100,
        peakFx: fps.peakFx,
        peakParticles: fps.peakParticles,
      };
      fps.last = stat;
      if (fps.el) fps.el.textContent = `${stat.fps} FPS · pior quadro ${stat.worstMs} ms · efeitos ${stat.drawMs} ms`;
      Object.assign(fps, { frames: 0, sum: 0, worst: 0, draw: 0, drawWorst: 0, peakFx: 0, peakParticles: 0, since: now });
    }
    fps.loop = requestAnimationFrame(fpsLoop);
  }

  function updateFpsVisibility() {
    if (!fps.el) fps.el = document.getElementById('fxFps');
    const show = fps.show && enabled;
    if (fps.el) fps.el.hidden = !show;
    if (show && !fps.loop) { fps.since = performance.now(); fps.prev = 0; fps.loop = requestAnimationFrame(fpsLoop); }
  }

  function setFps(on, persist = true) {
    fps.show = !!on;
    if (persist) writeStore(FPS_KEY, on ? '1' : '0');
    updateFpsVisibility();
  }

  function init() {
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (err) { reduced = false; }
    enabled = readStore(QUALITY_KEY) === 'high';
    fps.show = readStore(FPS_KEY) === '1';
    updateFpsVisibility();
  }

  return {
    init, begin, end, event, setQuality, getQuality, setFps,
    isOn: () => enabled && Boolean(ctx),
    showsFps: () => fps.show,
    stats: () => fps.last,
    STEP_FX,
  };
})();
