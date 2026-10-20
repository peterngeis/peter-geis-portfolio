/*
 * hero.js
 * The landing screen: the loader counter, sizing the giant name to fit the screen,
 * the lavender text reveal that follows the cursor, and the ASCII radar's pulses.
 */
(function (S) {
  "use strict";
  var clamp = S.clamp, ease = S.ease, motion = S.motion;
  var doc = document.documentElement;

  /* ---------- Settings you can tweak ---------- */

  var RADAR = {
    pulseSpeed: 6,       // how fast a pulse travels, in pixels per millisecond
    pulseLength: 44,     // length of each pulse, in pixels
    echoPause: 40,       // milliseconds to wait after an echo returns before the next pulse
    pingDuration: 380,   // milliseconds the ring at the target takes to fade
    // Which character of the ASCII drawing the beam leaves from, counting from 1.
    // Line 7, column 35 is the middle "#" of the main array.
    emitterLine: 7,
    emitterColumn: 35
  };

  var REVEAL = {
    radiusOfWidth: 0.1,  // circle radius as a fraction of the screen width
    minRadius: 96,
    maxRadius: 170
  };

  var LOADER_MS = 1350;  // how long the "°C Liquid" counter takes to reach 30

  /* ---------- Loader counter (first visit per session only) ---------- */

  var ldNum = document.getElementById("ld-num");
  if (motion && !doc.classList.contains("booted")) {
    var l0 = performance.now();
    var ldTick = function (now) {
      var k = clamp((now - l0) / LOADER_MS, 0, 1);
      ldNum.textContent = String(Math.round(18 + 12 * ease(k)));
      if (k < 1) {
        requestAnimationFrame(ldTick);
      }
    };
    requestAnimationFrame(ldTick);
    document.querySelector(".loader").addEventListener("click", function () { doc.classList.add("booted"); });
  }

  /* ---------- Fit the name to the screen ---------- */

  var heroEl = document.querySelector(".hero");
  var heroMeta = heroEl.querySelector(".hero-meta");
  var giant = heroEl.querySelector(".giant");
  var lines = giant.querySelectorAll(".gi");   // "PETER" and "GEIS"
  var radar = document.getElementById("radar");

  // Sizes the name as large as possible without overflowing the width or the screen height.
  function fitName() {
    giant.style.fontSize = "100px";
    var w = Math.max(lines[0].getBoundingClientRect().width, lines[1].getBoundingClientRect().width);
    var cs = getComputedStyle(heroEl);
    var availW = heroEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var availH = S.vh - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      - heroMeta.offsetHeight - parseFloat(getComputedStyle(giant).marginBottom) - 8;
    if (heroEl.classList.contains("radar-stacked")) {
      availH -= radar.offsetHeight + 14;
    }
    var fs = Math.min(100 * availW / w, 100 * availH / giant.offsetHeight);
    giant.style.fontSize = Math.max(40, fs) + "px";
    var clone = document.querySelector(".hero-x .giant");
    if (clone) {
      clone.style.fontSize = giant.style.fontSize;
    }
  }

  /* ---------- Cursor reveal and radar ---------- */

  var hx = document.getElementById("hero-x");          // the lavender copy of the name, clipped to a circle
  var rRead = document.getElementById("radar-read");   // "TRK 01  RNG 642 px"
  var artEl = radar.querySelector(".radar-art");
  var beam = document.getElementById("beam");          // track line and pulses
  var beamX = document.getElementById("beam-x");       // target box, label, and ping (inverts over letters)
  var bPath = beam.querySelector(".path"), pOut = beam.querySelector(".p-out"), pBack = beam.querySelector(".p-back");
  var ping = beamX.querySelector(".ping"), tgt = beamX.querySelector(".tgt"), tLabel = beamX.querySelector(".tlabel");

  // The ASCII drawing's size is read from the text itself, so you can redraw it freely (spaces only, no tabs).
  var artLines = artEl.textContent.split("\n");
  if (artLines[artLines.length - 1] === "") {
    artLines.pop();
  }
  var ART_ROWS = artLines.length;
  var ART_COLS = Math.max.apply(null, artLines.map(function (l) { return l.length; }));
  radar.style.width = ART_COLS + "ch";
  artEl.style.width = ART_COLS + "ch";

  // Build the reveal layer: an identical copy of the name and role line, plus a spacer used on phones.
  [giant, heroMeta].forEach(function (n) {
    var c = n.cloneNode(true); c.removeAttribute("id"); c.removeAttribute("aria-label"); hx.appendChild(c);
  });
  var hxSpacer = document.createElement("div");
  hxSpacer.className = "hx-spacer";
  hx.insertBefore(hxSpacer, hx.lastChild);
  heroEl.insertBefore(radar, heroMeta);   // lets the radar join the layout above the rule on phones

  var hW = 1, hH = 1;                // hero size
  var ex = 0, ey = 0;                // where the beam starts (main array)
  var tx = 0, ty = 0, cx = 0, cy = 0; // target position and its smoothed position
  var rad = 0, radT = 0, R0 = 150;   // reveal circle radius, its target, and full size
  var mode = "scan";                 // "scan" (idle), "track" (cursor), or "lock" (tap on phones)
  var phase = "out", ph0 = performance.now(), hitT = -1e9, hFrame = 0, t0h = performance.now();

  // Places the radar just above the rule over "Senior Systems Engineer":
  // beside "GEIS" when there's room, below it otherwise, or in the layout on phones.
  function placeRadar() {
    radar.style.display = ""; beam.style.display = ""; beamX.style.display = "";
    heroEl.classList.remove("radar-stacked"); hxSpacer.style.height = "0px";
    radar.style.left = ""; radar.style.top = "";
    fitName();

    var g1 = lines[0].getBoundingClientRect(), g2 = lines[1].getBoundingClientRect();
    var hr = heroEl.getBoundingClientRect(), mr = heroMeta.getBoundingClientRect();
    var fsz = parseFloat(giant.style.fontSize) || 100, csH = getComputedStyle(heroEl);
    var gl = parseFloat(csH.paddingLeft), contentW = heroEl.clientWidth - gl - parseFloat(csH.paddingRight);
    var floor = mr.top - hr.top - 14;
    var peterBottom = g1.bottom - hr.top - fsz * 0.12 + 10, geisBottom = g2.bottom - hr.top - fsz * 0.12 + 10;

    var base = clamp(S.vw * 0.007, 7.5, 12);
    radar.style.fontSize = base + "px";
    var rw0 = radar.offsetWidth || 1, rh0 = radar.offsetHeight || 1;
    var sBeside = Math.min(1, (g2.left - hr.left - gl - 28) / rw0, (floor - peterBottom) / rh0);
    var sBelow = Math.min(1, contentW / rw0, (floor - geisBottom) / rh0);
    var sc = Math.max(sBeside, sBelow), fsR = base * sc;

    if (fsR >= 6) {
      radar.style.fontSize = fsR + "px";
      if (radar.offsetHeight > (sc === sBelow ? floor - geisBottom : floor - peterBottom)) {
        fsR *= 0.92; radar.style.fontSize = fsR + "px";
      }
      radar.style.left = gl + "px";
      radar.style.top = (floor - radar.offsetHeight) + "px";
    } else {
      fsR = Math.min(base, base * contentW / rw0);
      radar.style.fontSize = fsR + "px";
      heroEl.classList.add("radar-stacked");
      fitName();
      if (parseFloat(giant.style.fontSize) < 48) {
        // Too short for both the name and the radar (phones in landscape): hide the radar.
        heroEl.classList.remove("radar-stacked"); fitName();
        radar.style.display = "none"; beam.style.display = "none"; beamX.style.display = "none";
      } else {
        hxSpacer.style.height = (radar.offsetHeight + 14) + "px";
      }
    }
    radar.classList.add("placed");

    var art = artEl.getBoundingClientRect();
    var cw = art.width / ART_COLS, lh = art.height / ART_ROWS;
    ex = art.left - hr.left + cw * (RADAR.emitterColumn - 0.5);
    ey = art.top - hr.top + lh * (RADAR.emitterLine - 0.5);
  }

  function measureHero() {
    hW = heroEl.clientWidth; hH = heroEl.clientHeight;
    beam.setAttribute("viewBox", "0 0 " + hW + " " + hH);
    beamX.setAttribute("viewBox", "0 0 " + hW + " " + hH);
    R0 = clamp(S.vw * REVEAL.radiusOfWidth, REVEAL.minRadius, REVEAL.maxRadius);
    placeRadar();
    if (!cx && !cy) {
      cx = hW * 0.6;
      cy = hH * 0.3;
    }
  }

  heroEl.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") {
      return;
    }
    var r = heroEl.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top; mode = "track"; radT = R0;
  });
  heroEl.addEventListener("pointerleave", function (e) {
    if (e.pointerType !== "touch") {
      mode = "scan";
      radT = 0;
    }
  });
  heroEl.addEventListener("pointerdown", function (e) {
    if (e.pointerType !== "touch") {
      return;
    }
    var r = heroEl.getBoundingClientRect();
    tx = e.clientX - r.left; ty = e.clientY - r.top; mode = "lock"; radT = R0;
  });

  // Phones: keep tracking the finger while it drags to scroll, not just on a tap.
  // Passive listeners never block scrolling. The last position stays locked after the finger lifts.
  function followTouch(e) {
    var t = e.touches && e.touches[0];
    if (!t) {
      return;
    }
    var r = heroEl.getBoundingClientRect();
    tx = clamp(t.clientX - r.left, 0, r.width);
    ty = clamp(t.clientY - r.top, 0, r.height);
    mode = "lock"; radT = R0;
  }
  heroEl.addEventListener("touchstart", followTouch, { passive: true });
  heroEl.addEventListener("touchmove", followTouch, { passive: true });

  // Moves a line segment along the beam: from distance `tail` to `head` measured from the radar.
  function setSegment(line, tail, head, ux, uy) {
    line.setAttribute("x1", (ex + ux * tail).toFixed(1)); line.setAttribute("y1", (ey + uy * tail).toFixed(1));
    line.setAttribute("x2", (ex + ux * head).toFixed(1)); line.setAttribute("y2", (ey + uy * head).toFixed(1));
  }

  function updateHero(now) {
    if (heroEl.getBoundingClientRect().bottom < 0) {
      return; // scrolled away: skip the work
    }

    // While idle, the target wanders slowly across the top of the screen.
    if (mode === "scan" && motion) {
      var t = (now - t0h) / 1000;
      tx = hW * (0.58 + 0.28 * Math.sin(t * 0.33));
      ty = hH * (0.26 + 0.14 * Math.sin(t * 0.51 + 1.1));
    }
    var idle = !motion && mode === "scan";
    beam.classList.toggle("idle", idle);
    beamX.classList.toggle("idle", idle);
    beamX.classList.toggle("scan", mode === "scan");

    var follow = motion ? 0.18 : 1;
    cx += (tx - cx) * follow; cy += (ty - cy) * follow;
    rad += (radT - rad) * (motion ? 0.14 : 1);
    hx.style.clipPath = "circle(" + rad.toFixed(1) + "px at " + cx.toFixed(1) + "px " + cy.toFixed(1) + "px)";

    var dx = cx - ex, dy = cy - ey, L = Math.max(1, Math.sqrt(dx * dx + dy * dy)), ux = dx / L, uy = dy / L;
    bPath.setAttribute("x1", ex); bPath.setAttribute("y1", ey);
    bPath.setAttribute("x2", cx.toFixed(1)); bPath.setAttribute("y2", cy.toFixed(1));
    tgt.setAttribute("transform", "translate(" + cx.toFixed(1) + " " + cy.toFixed(1) + ")");

    if (motion && !idle) {
      // One pulse out, a ping at the target, one echo back, a short pause, repeat.
      var dur = L / RADAR.pulseSpeed, el = now - ph0;
      if (phase === "out" && el >= dur) {
        phase = "back";
        ph0 = now;
        el = 0;
        hitT = now;
      } else if (phase === "back" && el >= dur) {
        phase = "gap";
        ph0 = now;
        el = 0;
      } else if (phase === "gap" && el >= RADAR.echoPause) {
        phase = "out";
        ph0 = now;
        el = 0;
      }

      var d = Math.min(L, el * RADAR.pulseSpeed);
      if (phase === "out") {
        setSegment(pOut, Math.max(0, d - RADAR.pulseLength), d, ux, uy);
        pOut.style.opacity = 1; pBack.style.opacity = 0;
      } else if (phase === "back") {
        var head = L - d;
        setSegment(pBack, Math.min(L, head + RADAR.pulseLength), head, ux, uy);
        pBack.style.opacity = 0.9; pOut.style.opacity = 0;
      } else {
        pOut.style.opacity = 0; pBack.style.opacity = 0;
      }

      var k = (now - hitT) / RADAR.pingDuration;
      if (k >= 0 && k <= 1) {
        ping.setAttribute("r", (8 + 22 * k).toFixed(1));
        ping.style.opacity = (1 - k).toFixed(2);
      } else {
        ping.style.opacity = 0;
      }
    } else {
      pOut.style.opacity = 0; pBack.style.opacity = 0; ping.style.opacity = 0;
    }

    // The readout only needs to change a few times a second.
    if (++hFrame % 6 === 0) {
      rRead.textContent = (mode === "scan" ? "SCAN    " : "TRACK 01") + " RANGE " + Math.round(L) + " PIXELS";
      tLabel.textContent = mode === "scan" ? "SCAN" : "TRK 01";
    }
  }

  S.onMeasure(measureHero);
  S.onFrame(updateHero);
})(window.Site);
