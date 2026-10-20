/*
 * painter.js
 * The class demo: a browser re-creation of the concurrent canvas painter.
 *
 * It runs the painters once, recording the order every pixel was painted, then plays that
 * recording back at a fixed frame rate. The two render rates only change which recorded
 * moments become frames:
 *   linear      every frame covers an equal share of the painters' work 
 *   non-linear  frames are spaced by pixels painted, slowing near the end 
 */
(function (S) {
  "use strict";
  var clamp = S.clamp, motion = S.motion;

  /* ---------- Settings you can tweak ---------- */

  var PAINTER = {
    size: 240,            // canvas width and height in pixels
    fps: 36,              // playback frame rate
    holdStart: 12,        // frames held on the starting dots
    holdEnd: 20,          // frames held on the finished canvas
    targetFrames: 450,    // TARGET_FRAMES from the C version
    stepLimit: 9e7        // safety cap on painter steps
  };

  /* ---------- Recording, frame schedules, playback ---------- */

  var cv = document.getElementById("pt"); if (!cv) {
    return;
  }
  var ctx = cv.getContext("2d");
  var W = PAINTER.size, H = PAINTER.size, N = W * H;
  var img = ctx.createImageData(W, H), px = img.data;
  var K = Math.max(4, Math.min(16, navigator.hardwareConcurrency || 8));
  var BASE = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255]];
  var MX = [-1, -1, 0, 1, 1, 1, 0, -1], MY = [0, 1, 1, 1, 0, -1, -1, -1];
  var FPS = PAINTER.fps, INIT = PAINTER.holdStart, END = PAINTER.holdEnd, TARGET = PAINTER.targetFrames, LIMIT = PAINTER.stepLimit;
  var baseIdx = 3, firstRun = true, rec = null, computing = false, wantPlay = false;
  var frames = { linear: null, nonlinear: null }, mode = "nonlinear";
  var idx = 0, curT = 0, playing = false, t0 = 0, startIdx = 0;
  var btn = document.getElementById("pt-play"), status = document.getElementById("pt-status");
  var chart = document.getElementById("pt-chart"), cCur = chart.querySelector(".c-cur"), cAlt = chart.querySelector(".c-alt"), ph = chart.querySelector(".ph");
  var rFrame = document.getElementById("r-frame"), rPct = document.getElementById("r-pct"), rTail = document.getElementById("r-tail");
  document.getElementById("r-k").textContent = String(K);

  function clearPx() {
    for (var i = 0; i < px.length; i++) {
      px[i] = 255;
    }
    curT = 0;
  }
  clearPx(); ctx.putImageData(img, 0, 0);

  function startRun() {
    if (!firstRun) {
      baseIdx = (Math.random() * BASE.length) | 0;
    }
    firstRun = false;
    var base = BASE[baseIdx], cols = [];
    for (var a = 0; a < K; a++) {
      var sh = 0.1 + 0.85 * (a / K);
      cols.push([(base[0] * sh) | 0, (base[1] * sh) | 0, (base[2] * sh) | 0]);
    }
    var own = new Int16Array(N); own.fill(-1);
    var order = new Int32Array(N), who = new Uint8Array(N), stepsAt = new Float64Array(N);
    var n = Math.ceil(Math.sqrt(K)), m = Math.ceil(K / n), sx = Math.floor(W / (n + 1)), sy2 = Math.floor(H / (m + 1));
    var P = [], painted = 0, steps = 0, ord = [0, 1, 2, 3, 4, 5, 6, 7];
    function paint(k, id) {
      if (own[k] < 0) {
        order[painted] = k;
        who[painted] = id;
        stepsAt[painted] = steps;
        painted++;
      }
      own[k] = id;
    }
    for (var b = 0; b < K; b++) {
      var x = sx + (b % n) * sx, y = sy2 + Math.floor(b / n) * sy2, k0 = y * W + x;
      P.push({ x: x, y: y, t: [k0] });
      paint(k0, b);
    }
    function adj(tx, ty, id) {
      for (var d = 0; d < 8; d++) {
        var nx = tx + MX[d], ny = ty + MY[d];
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && own[ny * W + nx] === id) {
          return true;
        }
      }
      return false;
    }
    function tryMove(p, id, d) {
      var tx = p.x + MX[d], ty = p.y + MY[d];
      if (tx < 0 || tx >= W || ty < 0 || ty >= H) {
        return false;
      }
      var k = ty * W + tx, o = own[k];
      if (!(o < 0 || o === id)) {
        return false;
      }
      if (p.t.length > 1 && !adj(tx, ty, id)) {
        return false;
      }
      paint(k, id); p.x = tx; p.y = ty; p.t.push(k); return true;
    }
    function step(p, id) {
      steps++;
      var roll = (Math.random() * 8) | 0;
      if (tryMove(p, id, roll)) {
        return;
      }
      for (var s = 7; s > 0; s--) {
        var j = (Math.random() * (s + 1)) | 0, tmp = ord[s];
        ord[s] = ord[j];
        ord[j] = tmp;
      }
      for (var q = 0; q < 8; q++) {
        if (ord[q] !== roll && tryMove(p, id, ord[q])) {
          return;
        }
      }
      if (p.t.length > 1) {
        p.t.pop();
        var kk = p.t[p.t.length - 1];
        p.x = kk % W;
        p.y = (kk / W) | 0;
      }
    }
    rec = { order: order, who: who, stepsAt: stepsAt, cols: cols, done: false, count: 0, total: 0,
      slice: function (budget) {
        var t = performance.now();
        while (painted < N && steps < LIMIT) {
          for (var r = 0; r < 1024 && painted < N; r++) {
            for (var i = 0; i < K; i++) {
              step(P[i], i);
            }
          }
          if (performance.now() - t > budget) {
            break;
          }
        }
        this.count = painted; this.total = steps;
        return painted >= N || steps >= LIMIT;
      } };
  }

  function buildFrames() {
    var Np = rec.count, f, i, S = N / 1166400;
    f = []; for (i = 0; i < INIT; i++) {
      f.push(K);
    }
    var thr = K;
    while (thr < Np) {
      f.push(thr);
      var pct = thr / N, rem = N - thr, rf = TARGET * (1 - pct) + 12;
      var st = Math.floor(rem / rf);
      var cap = pct > 0.97 ? 200 : pct > 0.9 ? 600 : 2500;
      st = Math.min(st, Math.max(1, Math.round(cap * S * 4)));
      st = Math.max(st, 1);
      thr += st;
    }
    for (i = 0; i < END + 1; i++) {
      f.push(Np);
    }
    frames.nonlinear = f;
    f = []; for (i = 0; i < INIT; i++) {
      f.push(K);
    }
    var sa = rec.stepsAt, total = rec.total;
    for (var k = 1; k <= TARGET; k++) {
      var target = total * k / TARGET, lo = 0, hi = Np;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (sa[mid] <= target) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      f.push(lo);
    }
    for (i = 0; i < END; i++) {
      f.push(Np);
    }
    frames.linear = f;
    var i99 = Math.floor(Np * 0.99);
    rTail.textContent = Math.round(100 * (1 - sa[i99] / total)) + "%";
  }

  function pathFor(f) {
    var L = f.length - 1, d = "", stepI = Math.max(1, Math.floor(L / 400));
    for (var i = 0; i <= L; i += stepI) {
      d += (i ? "L" : "M") + (i / L * 600).toFixed(1) + " " + (100 - f[i] / N * 100).toFixed(2);
    }
    return d + "L600 " + (100 - f[L] / N * 100).toFixed(2);
  }
  function renderChart() {
    if (!frames.linear) {
      return;
    }
    cCur.setAttribute("d", pathFor(frames[mode]));
    cAlt.setAttribute("d", pathFor(frames[mode === "linear" ? "nonlinear" : "linear"]));
  }
  function drawTo(t) {
    if (t < curT) {
      clearPx();
    }
    var o = rec.order, w = rec.who, c = rec.cols;
    for (var i = curT; i < t; i++) { 
      var j = o[i] * 4, cc = c[w[i]];
      px[j] = cc[0]; px[j + 1] = cc[1];
      px[j + 2] = cc[2]; 
    }
    curT = t;
    ctx.putImageData(img, 0, 0);
  }
  function showFrame(i) {
    var f = frames[mode], L = f.length - 1;
    idx = clamp(i, 0, L);
    drawTo(f[idx]);
    var x = (idx / L * 600).toFixed(1);
    ph.setAttribute("x1", x); ph.setAttribute("x2", x);
    var pct = Math.floor(f[idx] / N * 100);
    rFrame.textContent = String(idx + 1).padStart(3, "0") + " / " + f.length;
    rPct.textContent = pct + "%";
    chart.setAttribute("aria-valuenow", String(Math.round(idx / L * 100)));
    chart.setAttribute("aria-valuetext", "Frame " + (idx + 1) + " of " + f.length + ", " + pct + "% painted");
  }
  function ensureRun(thenPlay) {
    if (thenPlay) {
      wantPlay = true;
    }
    if (rec && rec.done) {
      if (wantPlay) {
        wantPlay = false;
        play();
      }
      return;
    }
    if (computing) {
      return;
    }
    computing = true; startRun();
    status.hidden = false;
    (function work() {
      var done = rec.slice(14);
      status.textContent = "Running " + K + " painters… " + Math.floor(rec.count / N * 100) + "%";
      if (!done) {
        setTimeout(work, 0);
        return;
      }
      computing = false; rec.done = true; status.hidden = true;
      buildFrames(); renderChart(); clearPx(); showFrame(0);
      if (wantPlay) {
        wantPlay = false;
        play();
      } else {
        btn.textContent = "Play";
      }
    })();
  }
  function tick(now) {
    if (!playing) {
      return;
    }
    var f = frames[mode], L = f.length - 1;
    var i = startIdx + Math.floor((now - t0) * FPS / 1000);
    if (i >= L) {
      showFrame(L);
      playing = false;
      btn.textContent = "Replay";
      return;
    }
    if (i !== idx) {
      showFrame(i);
    }
    requestAnimationFrame(tick);
  }
  function play() {
    if (!rec || !rec.done) {
      ensureRun(true);
      return;
    }
    var L = frames[mode].length - 1;
    if (idx >= L) {
      idx = 0;
    }
    playing = true; startIdx = idx; t0 = performance.now();
    btn.textContent = "Pause";
    requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    btn.textContent = (frames[mode] && idx >= frames[mode].length - 1) ? "Replay" : "Play";
  }
  btn.addEventListener("click", function () { 
    if (playing) {
      pause();
    } else {
      play();
    }
    });
  document.getElementById("pt-new").addEventListener("click", function () {
    playing = false; rec = null; frames.linear = frames.nonlinear = null; idx = 0;
    cCur.removeAttribute("d");
    cAlt.removeAttribute("d");
    rTail.textContent = "–";
    clearPx();
    ctx.putImageData(img, 0, 0); ensureRun(true);
  });
  document.getElementById("pt-rate").addEventListener("change", function (e) {
    mode = e.target.value; renderChart();
    if (rec && rec.done) {
      playing = false;
      idx = 0;
      showFrame(0);
      play();
    }
  });
  function seekFromX(clientX) {
    if (!rec || !rec.done) {
      return;
    }
    var r = chart.getBoundingClientRect(), L = frames[mode].length - 1;
    if (playing) {
      pause();
    }
    showFrame(Math.round(clamp((clientX - r.left) / r.width, 0, 1) * L));
    btn.textContent = idx >= L ? "Replay" : "Play";
  }
  chart.addEventListener("pointerdown", function (e) { chart.setPointerCapture(e.pointerId); seekFromX(e.clientX); });
  chart.addEventListener("pointermove", function (e) {
    if (chart.hasPointerCapture(e.pointerId)) {
      seekFromX(e.clientX);
    }
  });
  chart.addEventListener("keydown", function (e) {
    if (!rec || !rec.done) {
      return;
    }
    var L = frames[mode].length - 1, step = e.shiftKey ? 20 : 1, ni = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      ni = idx + step;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      ni = idx - step;
    } else if (e.key === "Home") {
      ni = 0;
    } else if (e.key === "End") {
      ni = L;
    }
    if (ni === null) {
      return;
    }
    e.preventDefault(); if (playing) {
      pause();
    } showFrame(ni);
    btn.textContent = idx >= L ? "Replay" : "Play";
  });

  if ("IntersectionObserver" in window) {
    var pre = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) {
          ensureRun(false);
          pre.disconnect();
        }
      });
    }, { rootMargin: "900px 0px" });
    pre.observe(cv);
    if (motion) {
      var auto = new IntersectionObserver(function (es) {
        es.forEach(function (en) {
          if (en.isIntersecting) {
            ensureRun(true);
            auto.disconnect();
          }
        });
      }, { threshold: 0.4 });
      auto.observe(cv);
    }
  }
})(window.Site);
