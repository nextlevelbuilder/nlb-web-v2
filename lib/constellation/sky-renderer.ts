import {
  CONSTELLATION_ANCHORS as CA, CONSTELLATION_EDGES as CE, CONSTELLATION_MAGNITUDES as CM,
  CONSTELLATION_WIDTH as CW, HERO_STAR as HERO, SKY_SEED, seededRandom,
} from './geometry';
import type { SceneState } from './scene-state';
import { BACKGROUND_FRAGMENT, BACKGROUND_VERTEX, LINE_FRAGMENT, LINE_VERTEX, POINT_FRAGMENT, POINT_VERTEX } from './sky-shaders';

export interface SkyOptions {
  canvas: HTMLCanvasElement;
  state: SceneState;
  /** In-flow slot the constellation is drawn into. */
  constellationBox: HTMLElement;
  /** Finale anchor every star gathers into. */
  igniteAnchor: HTMLElement;
  reducedMotion: boolean;
  /** Fine pointer (mouse): enables the cursor gravity well. */
  finePointer: boolean;
  /** Called when WebGL is unavailable or the context is lost, so the SVG chart can take over. */
  onFallback: () => void;
}

export interface SkyHandle {
  /** First frame, fade in, then run the loop (no loop under reduced motion). */
  start: () => void;
  /** Draw a single frame (reduced motion repaints on chapter changes). */
  redraw: () => void;
  setTheme: (light: boolean) => void;
  layout: () => void;
  destroy: () => void;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** expo out: the "snap". */
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const smooth = (x: number) => {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
};

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('createShader failed');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader compile failed');
  return shader;
}

function link(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'program link failed');
  return program;
}

/**
 * The home sky: raw WebGL particles. One point of light splits into a field, snaps into the "NLB"
 * constellation, dissolves, then gathers into a single star at the finale. Returns null (after calling
 * onFallback) when WebGL is unavailable.
 */
export function createSky(options: SkyOptions): SkyHandle | null {
  const { canvas, state: S, constellationBox, igniteAnchor, reducedMotion: REDUCE, finePointer: FINE, onFallback } = options;
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance' });
  } catch {
    gl = null;
  }
  if (!gl) {
    onFallback();
    return null;
  }
  const g = gl;

  let pBG: WebGLProgram, pPT: WebGLProgram, pLN: WebGLProgram;
  try {
    pBG = link(g, BACKGROUND_VERTEX, BACKGROUND_FRAGMENT);
    pPT = link(g, POINT_VERTEX, POINT_FRAGMENT);
    pLN = link(g, LINE_VERTEX, LINE_FRAGMENT);
  } catch {
    // A driver that cannot compile the shaders gets the designed SVG chart instead.
    g.getExtension('WEBGL_lose_context')?.loseContext();
    onFallback();
    return null;
  }

  const U = (p: WebGLProgram, n: string) => g.getUniformLocation(p, n);
  const uBG = { res: U(pBG, 'uRes'), time: U(pBG, 'uTime'), light: U(pBG, 'uLight'), scroll: U(pBG, 'uScroll') };
  const uPT = {
    res: U(pPT, 'uRes'), dpr: U(pPT, 'uDpr'), max: U(pPT, 'uMaxPs'), light: U(pPT, 'uLight'),
    sd: U(pPT, 'uStarD'), sl: U(pPT, 'uStarL'), hd: U(pPT, 'uHeroD'), hl: U(pPT, 'uHeroL'),
  };
  const uLN = { res: U(pLN, 'uRes'), light: U(pLN, 'uLight'), ld: U(pLN, 'uLineD'), ll: U(pLN, 'uLineL') };
  const aPT = {
    pos: g.getAttribLocation(pPT, 'aPos'), size: g.getAttribLocation(pPT, 'aSize'),
    alpha: g.getAttribLocation(pPT, 'aAlpha'), kind: g.getAttribLocation(pPT, 'aKind'),
  };
  const aLN = { pos: g.getAttribLocation(pLN, 'aPos'), alpha: g.getAttribLocation(pLN, 'aAlpha') };
  const aBG = g.getAttribLocation(pBG, 'p');
  const pointRange = g.getParameter(g.ALIASED_POINT_SIZE_RANGE) as Float32Array | null;
  const maxPs = (pointRange && pointRange[1]) || 64;

  const bgBuf = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, bgBuf);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  const ptBuf = g.createBuffer();
  const lnBuf = g.createBuffer();

  /* ---- particle population (deterministic) ---- */
  const small = Math.min(window.innerWidth, window.innerHeight) < 600 || window.innerWidth < 760;
  const NM = small ? 240 : 520;
  const NS = small ? 200 : 440;
  const NA = CA.length;
  const ND = Math.round(NM * 0.44);
  const rnd = seededRandom(SKY_SEED);
  const fx = new Float32Array(NM), fy = new Float32Array(NM), tx = new Float32Array(NM), ty = new Float32Array(NM);
  const hasT = new Uint8Array(NM), sz = new Float32Array(NM), ba = new Float32Array(NM), ph = new Float32Array(NM);
  const sp = new Float32Array(NM), dS = new Float32Array(NM), dF = new Float32Array(NM);
  const ox = new Float32Array(NM), oy = new Float32Array(NM), px = new Float32Array(NM), py = new Float32Array(NM);
  const edgeLen = CE.map(([a, b]) => Math.hypot(CA[b][0] - CA[a][0], CA[b][1] - CA[a][1]));
  const totLen = edgeLen.reduce((sum, v) => sum + v, 0);
  for (let i = 0; i < NM; i++) {
    // field: loose two-armed spiral around the centre, normalised to ±1
    const arm = i % 2;
    const r = Math.pow(rnd(), 0.75);
    const ang = arm * Math.PI + r * 4.2 + (rnd() - 0.5) * 1.1;
    fx[i] = Math.cos(ang) * r * 1.05 + (rnd() - 0.5) * 0.25;
    fy[i] = Math.sin(ang) * r * 0.62 + (rnd() - 0.5) * 0.25;
    ph[i] = rnd() * 6.283;
    sp[i] = 0.4 + rnd() * 0.9;
    dS[i] = rnd();
    if (i < NA) {
      tx[i] = CA[i][0]; ty[i] = CA[i][1]; hasT[i] = 1; sz[i] = CM[i]; ba[i] = 1;
    } else if (i < NA + ND) {
      let k = rnd() * totLen;
      let e = 0;
      while (k > edgeLen[e] && e < CE.length - 1) { k -= edgeLen[e]; e++; }
      const A = CA[CE[e][0]], Bv = CA[CE[e][1]];
      const tt = k / edgeLen[e];
      const nx = -(Bv[1] - A[1]) / edgeLen[e], ny = (Bv[0] - A[0]) / edgeLen[e];
      const j = (rnd() + rnd() + rnd() - 1.5) * 0.03;
      tx[i] = lerp(A[0], Bv[0], tt) + nx * j; ty[i] = lerp(A[1], Bv[1], tt) + ny * j;
      hasT[i] = 1; sz[i] = 0.7 + rnd() * 0.9; ba[i] = 0.35 + rnd() * 0.5;
    } else {
      hasT[i] = 0; sz[i] = 0.6 + Math.pow(rnd(), 3) * 1.6; ba[i] = 0.25 + rnd() * 0.55;
    }
    dF[i] = hasT[i] ? (tx[i] / CW) * 0.6 + rnd() * 0.4 : rnd();
  }
  const su = new Float32Array(NS), sv = new Float32Array(NS), ss = new Float32Array(NS), sa = new Float32Array(NS), sph = new Float32Array(NS);
  for (let i = 0; i < NS; i++) {
    su[i] = rnd(); sv[i] = rnd(); ss[i] = 0.5 + Math.pow(rnd(), 4) * 1.6; sa[i] = 0.12 + rnd() * 0.5; sph[i] = rnd() * 6.283;
  }
  const NP = NM + NS;
  const ptData = new Float32Array(NP * 5);
  const MAXL = CE.length + 180;
  const lnData = new Float32Array(MAXL * 6);

  /* ---- layout ---- */
  let vw = 1, vh = 1, dpr = 1, fieldScale = 1;
  let box = { x: 0, y: 0, w: 1, h: 1 };
  let hero = { x: 0, y: 0 };
  const ignite = { x: 0, y: 0 };
  function readBox() {
    const r = constellationBox.getBoundingClientRect();
    box = { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function layout() {
    vw = window.innerWidth; vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    g.viewport(0, 0, canvas.width, canvas.height);
    readBox();
    const cs = getComputedStyle(document.documentElement);
    hero = { x: (vw * (parseFloat(cs.getPropertyValue('--px')) || 66)) / 100, y: (vh * (parseFloat(cs.getPropertyValue('--py')) || 38)) / 100 };
    fieldScale = Math.max(vw, vh) * 0.55;
  }

  /* ---- palette crossfade ---- */
  let light = document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0;
  let lightT = light;

  function frame(t: number) {
    const time = t * 0.001;
    light += (lightT - light) * 0.08;
    if (Math.abs(lightT - light) < 0.002) light = lightT;
    S.ignite += (S.igniteT - S.ignite) * 0.08;
    if (S.gather > 0) {
      const rc = igniteAnchor.getBoundingClientRect();
      ignite.x = rc.left + rc.width / 2; ignite.y = rc.top + rc.height / 2;
    }
    const { split, form, settle, gather, intro } = S;
    if (form > 0 && settle < 1) readBox(); // the constellation rides with its in-flow slot (pinned or not)
    const darkDim = 1 - 0.45 * smooth(S.dark) * (1 - form);
    let mult = lerp(darkDim, small ? 0.42 : 0.36, smooth(settle));
    mult = lerp(mult, 1, smooth(gather));
    const lightBoost = lerp(1, 1.25, light);
    const mOn = S.mOn && FINE && !REDUCE;
    const mx = S.mx, my = S.my, RAD = 170;
    const wob = REDUCE ? 0 : 1;
    let o = 0;
    for (let i = 0; i < NM; i++) {
      const fxp = vw * 0.5 + (fx[i] + Math.sin(time * 0.06 * sp[i] + ph[i]) * 0.018 * wob) * fieldScale;
      const fyp = vh * 0.5 + (fy[i] + Math.cos(time * 0.05 * sp[i] + ph[i] * 1.3) * 0.018 * wob) * fieldScale;
      const ls = ease(clamp(split * 1.3 - dS[i] * 0.3, 0, 1));
      let x = lerp(hero.x, fxp, ls), y = lerp(hero.y, fyp, ls);
      let a = ba[i] * Math.min(1, ls * 2.5);
      let s = sz[i];
      if (hasT[i]) {
        const lf = ease(clamp(form * 1.45 - dF[i] * 0.45, 0, 1));
        x = lerp(x, box.x + (tx[i] / CW) * box.w, lf); y = lerp(y, box.y + ty[i] * box.h, lf);
        a = lerp(a, ba[i] * (i < NA ? 1 : 0.9), lf);
      } else a *= 1 - 0.45 * form;
      const st = smooth(settle);
      if (st > 0 && hasT[i]) { x = lerp(x, fxp, st); y = lerp(y, fyp, st); }
      let kind = i < NA ? 1 : 0;
      if (i === HERO) {
        const pulse = 1 + Math.sin(time * 2.2) * 0.12 * wob;
        const hs = 7.5 * intro * pulse;
        s = lerp(hs, CM[HERO], smooth(split * 1.6)); a = 1; kind = split < 0.45 ? 2 : 1;
      }
      const lg = ease(clamp(gather * 1.35 - dS[i] * 0.35, 0, 1));
      if (lg > 0) { x = lerp(x, ignite.x, lg); y = lerp(y, ignite.y, lg); if (i !== HERO) a *= 1 - smooth(lg); }
      if (i === HERO && gather > 0.4) {
        kind = 2;
        s = lerp(s, 7.5 * (1 + S.ignite * 0.55) * (1 + Math.sin(time * 2.2) * 0.08 * wob), smooth((gather - 0.4) / 0.6)); a = 1;
      }
      // cursor gravity well: lean toward the pointer, brighten nearby stars
      let gx = 0, gy = 0;
      if (mOn) {
        const dx = mx - x, dy = my - y, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < RAD && dd > 0.01) { let f = 1 - dd / RAD; f *= f; gx = (dx / dd) * f * 26; gy = (dy / dd) * f * 26; a = Math.min(1, a + f * 0.45); }
      }
      ox[i] += (gx - ox[i]) * 0.08; oy[i] += (gy - oy[i]) * 0.08; x += ox[i]; y += oy[i];
      px[i] = x; py[i] = y;
      const am = i === HERO && (split < 0.45 || gather > 0.4) ? 1 : mult;
      ptData[o++] = x; ptData[o++] = y; ptData[o++] = s; ptData[o++] = clamp(a * am * (kind === 0 ? lightBoost : 1), 0, 1); ptData[o++] = kind;
    }
    const stars = REDUCE
      ? 0.25 + 0.4 * Math.max(split, form)
      : (0.12 + 0.5 * Math.max(split, form * 0.9)) * lerp(1, 0.75, smooth(settle)) + 0.15 * smooth(gather);
    const sOff = (window.scrollY * 0.02) % vh;
    for (let i = 0; i < NS; i++) {
      const yy = (sv[i] * vh - sOff + vh) % vh;
      const tw = REDUCE ? 1 : 0.65 + 0.35 * Math.sin(time * (0.6 + sa[i]) + sph[i]);
      ptData[o++] = su[i] * vw; ptData[o++] = yy; ptData[o++] = ss[i]; ptData[o++] = sa[i] * tw * stars * lightBoost; ptData[o++] = 0;
    }
    // lines: constellation edges (gapped at stars, drawn in sequence) + cursor web
    let nl = 0;
    const lineA = 0.5 * smooth(clamp((form - 0.45) / 0.5, 0, 1)) * (1 - smooth(settle)) * (1 - smooth(gather));
    if (lineA > 0.003) {
      for (let e = 0; e < CE.length; e++) {
        const ep = smooth(clamp((form - 0.5 - e * 0.018) / 0.3, 0, 1));
        if (ep <= 0) continue;
        const ia = CE[e][0], ib = CE[e][1];
        const ax = px[ia], ay = py[ia], bx = px[ib], by = py[ib];
        const L = Math.hypot(bx - ax, by - ay) || 1, gap = Math.min(8, L * 0.2), ux = (bx - ax) / L, uy = (by - ay) / L;
        const sx = ax + ux * gap, sy = ay + uy * gap, ex = sx + (bx - ux * gap - sx) * ep, ey = sy + (by - uy * gap - sy) * ep;
        const la = lineA * lerp(1, 1.5, light);
        lnData.set([sx, sy, la, ex, ey, la], nl * 6); nl++;
      }
    }
    if (mOn && split > 0.2) {
      const near: number[] = [];
      for (let i = 0; i < NM && near.length < 46; i++) { const qx = px[i] - mx, qy = py[i] - my; if (qx * qx + qy * qy < RAD * RAD * 0.8) near.push(i); }
      for (let p = 0; p < near.length && nl < MAXL; p++) {
        for (let q = p + 1; q < near.length && nl < MAXL; q++) {
          const A = near[p], B = near[q], ddx = px[A] - px[B], ddy = py[A] - py[B], d2 = ddx * ddx + ddy * ddy;
          if (d2 > 100 * 100) continue;
          const md = Math.hypot((px[A] + px[B]) * 0.5 - mx, (py[A] + py[B]) * 0.5 - my);
          const al = (1 - Math.sqrt(d2) / 100) * (1 - md / RAD) * 0.4 * lerp(1, 1.4, light) * mult;
          if (al <= 0.01) continue;
          lnData.set([px[A], py[A], al, px[B], py[B], al], nl * 6); nl++;
        }
      }
    }
    // draw
    g.disable(g.BLEND); g.useProgram(pBG); g.bindBuffer(g.ARRAY_BUFFER, bgBuf);
    g.enableVertexAttribArray(aBG); g.vertexAttribPointer(aBG, 2, g.FLOAT, false, 0, 0);
    g.uniform2f(uBG.res, canvas.width, canvas.height); g.uniform1f(uBG.time, REDUCE ? 40 : time);
    g.uniform1f(uBG.light, light); g.uniform1f(uBG.scroll, window.scrollY / Math.max(vh, 1));
    g.drawArrays(g.TRIANGLES, 0, 3); g.disableVertexAttribArray(aBG);
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    if (nl) {
      g.useProgram(pLN); g.bindBuffer(g.ARRAY_BUFFER, lnBuf); g.bufferData(g.ARRAY_BUFFER, lnData.subarray(0, nl * 6), g.DYNAMIC_DRAW);
      g.enableVertexAttribArray(aLN.pos); g.vertexAttribPointer(aLN.pos, 2, g.FLOAT, false, 12, 0);
      g.enableVertexAttribArray(aLN.alpha); g.vertexAttribPointer(aLN.alpha, 1, g.FLOAT, false, 12, 8);
      g.uniform2f(uLN.res, vw, vh); g.uniform1f(uLN.light, light); g.uniform3f(uLN.ld, 0.93, 0.89, 0.8); g.uniform3f(uLN.ll, 0.11, 0.16, 0.28);
      g.drawArrays(g.LINES, 0, nl * 2); g.disableVertexAttribArray(aLN.pos); g.disableVertexAttribArray(aLN.alpha);
    }
    g.useProgram(pPT); g.bindBuffer(g.ARRAY_BUFFER, ptBuf); g.bufferData(g.ARRAY_BUFFER, ptData, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(aPT.pos); g.vertexAttribPointer(aPT.pos, 2, g.FLOAT, false, 20, 0);
    g.enableVertexAttribArray(aPT.size); g.vertexAttribPointer(aPT.size, 1, g.FLOAT, false, 20, 8);
    g.enableVertexAttribArray(aPT.alpha); g.vertexAttribPointer(aPT.alpha, 1, g.FLOAT, false, 20, 12);
    g.enableVertexAttribArray(aPT.kind); g.vertexAttribPointer(aPT.kind, 1, g.FLOAT, false, 20, 16);
    g.uniform2f(uPT.res, vw, vh); g.uniform1f(uPT.dpr, dpr); g.uniform1f(uPT.max, maxPs); g.uniform1f(uPT.light, light);
    g.uniform3f(uPT.sd, 1, 0.96, 0.88); g.uniform3f(uPT.sl, 0.11, 0.16, 0.29); g.uniform3f(uPT.hd, 1, 0.86, 0.6); g.uniform3f(uPT.hl, 0.64, 0.22, 0.12);
    g.drawArrays(g.POINTS, 0, NP);
  }

  let running = false, raf = 0, lastT = 0, destroyed = false, wanted = false;
  const loop = (t: number) => { lastT = t; frame(t); raf = requestAnimationFrame(loop); };
  const run = () => { if (running || REDUCE || destroyed || document.hidden) return; running = true; raf = requestAnimationFrame(loop); };
  const halt = () => { running = false; cancelAnimationFrame(raf); };
  // Pause the loop while the tab is hidden.
  const onVisibility = () => { if (document.hidden) halt(); else if (wanted) run(); };
  const onContextLost = (event: Event) => { event.preventDefault(); halt(); onFallback(); };
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); if (REDUCE) frame(lastT); }, 120);
  };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  window.addEventListener('resize', onResize);
  layout();

  return {
    start() { wanted = true; frame(0); canvas.classList.add('on'); run(); },
    redraw() { if (REDUCE) frame(lastT || 1); },
    setTheme(isLight) { lightT = isLight ? 1 : 0; if (REDUCE) { light = lightT; frame(lastT || 1); } },
    layout,
    destroy() {
      destroyed = true; halt(); clearTimeout(resizeTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      window.removeEventListener('resize', onResize);
      canvas.classList.remove('on');
      [bgBuf, ptBuf, lnBuf].forEach((b) => b && g.deleteBuffer(b));
      [pBG, pPT, pLN].forEach((p) => g.deleteProgram(p));
      g.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
