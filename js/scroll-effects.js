/*
 * scroll-effects.js
 * The smaller scroll-driven pieces:
 *   1. the introduction statement that fills in word by word
 *   2. the "Field photos" strip that scrolls sideways
 *   3. the experience timeline's rolling year and progress rail
 *   4. the toolkit ticker
 *   5. the solid top bar on phones while the experience timeline is on screen
 */
(function (S) {
  "use strict";
  var clamp = S.clamp, motion = S.motion;

  /* ---------- Settings you can tweak ---------- */

  var STATEMENT = {
    dimOpacity: 0.16,    // opacity of words that haven't filled in yet
    startAt: 0.82,       // words start filling when the statement's top reaches this fraction of the screen
    span: 0.32,          // extra scroll (in screen heights) over which the fill completes
    dwellStartAt: 0.4,   // when the intro pauses on screen: words start filling as the frame's top rises to this fraction of the screen height...
    dwellFinishAt: 0.85  // ...and finish this far (0 to 1) through the pause, so most of the filling happens while it holds
  };

  var TICKER = {
    speed: 0.9,          // base speed, in pixels per frame
    scrollBoost: 0.35,   // extra speed per pixel of scroll movement
    maxBoost: 18
  };

  /* ---------- 1. Statement word fill ---------- */

  var stmt = document.getElementById("stmt");
  var words = [], wordOpacity = [], sTop = 0, sH = 1;
  if (motion) {
    var txt = stmt.textContent.trim().split(/\s+/);
    stmt.textContent = "";
    txt.forEach(function (w, i) {
      var s = document.createElement("span"); s.className = "w"; s.textContent = w;
      stmt.appendChild(s);
      if (i < txt.length - 1) {
        stmt.appendChild(document.createTextNode(" "));
      }
      words.push(s); wordOpacity.push(-1);
    });
  }
  // Scales the introduction photo (never crops it) so the statement, photo, and caption fit on one
  // screen together. The figure gets an explicit width, so the caption wraps to the photo's width.
  var MIN_PHOTO_H = 220;   // smallest the photo may shrink to, in pixels tall
  function fitStmtPhoto() {
    var fig = document.querySelector(".stmt-fig");
    if (!fig) {
      return;
    }
    var img = fig.querySelector("img"), cap = fig.querySelector("figcaption"), grid = fig.parentNode;
    fig.style.width = "";
    var colW = fig.offsetWidth;
    var ratio = parseFloat(img.getAttribute("width")) / parseFloat(img.getAttribute("height"));
    var navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 64;
    var gap = parseFloat(getComputedStyle(grid).marginTop) || 0;
    // Two passes: narrowing the photo can wrap the caption onto a second line, which needs room too.
    for (var pass = 0; pass < 2; pass++) {
      var capH = cap ? cap.offsetHeight + parseFloat(getComputedStyle(cap).marginTop) : 0;
      var availH = S.vh - navH - stmt.offsetHeight - gap - capH - 24;
      var w = Math.min(colW, Math.max(MIN_PHOTO_H, availH) * ratio);
      fig.style.width = Math.floor(w) + "px";
    }
  }

  function measureStmt() { sTop = S.absTop(stmt); sH = stmt.offsetHeight; }

  // 0 to 1: how much of the statement has filled in.
  function stmtProgress() {
    var f = S.frames.intro;
    if (f && f.active) {
      // The intro pauses on screen (js/dwell.js), so tie the fill to that pause: it starts as the frame
      // rises and finishes partway through the hold.
      var start = f.wrapTop - S.vh * STATEMENT.dwellStartAt;
      var end = f.pinStart + (f.pinEnd - f.pinStart) * STATEMENT.dwellFinishAt;
      return clamp((S.scrollY - start) / Math.max(1, end - start), 0, 1);
    }
    return clamp((S.scrollY + S.vh * STATEMENT.startAt - sTop) / (sH + S.vh * STATEMENT.span), 0, 1);
  }
  function updateStmt() {
    var p = stmtProgress();
    var c = p * words.length * 1.08;
    for (var i = 0; i < words.length; i++) {
      var o = Math.round((STATEMENT.dimOpacity + (1 - STATEMENT.dimOpacity) * clamp(c - i, 0, 1)) * 100) / 100;
      if (o !== wordOpacity[i]) {
        words[i].style.opacity = o;
        wordOpacity[i] = o;
      }
    }
  }

  /* ---------- 2. Field photos sideways strip ---------- */

  var notes = document.querySelector(".notes"), strip = document.getElementById("strip");
  var nProg = notes.querySelector(".notes-prog i"), nTop = 0, nDist = 1;
  var lastStrip = "", lastProgVis = "";

  // Decode every photo up front so none pops in (or flashes) while swiping.
  Array.prototype.forEach.call(strip.querySelectorAll("img"), function (img) {
    if (img.decode) {
      img.decode().catch(function () {});
    }
  });

  // The section is made exactly tall enough that scrolling down moves the strip across once.
  // The strip's transform is left alone while measuring: clearing it (even briefly) showed up as a
  // one-frame flash back to the first photo whenever a phone's address bar caused a resize mid-scroll.
  function measureNotes() {
    nDist = Math.max(1, strip.scrollWidth - S.vw);
    notes.style.height = (nDist + S.vh) + "px";
    nTop = S.absTop(notes);
    lastStrip = "";
  }
  function updateNotes() {
    var y = S.scrollY;
    var p = clamp((y - nTop) / nDist, 0, 1);
    var tr = "translate3d(" + (-p * nDist).toFixed(1) + "px,0,0)";
    if (tr !== lastStrip) {
      strip.style.transform = tr;
      nProg.style.transform = "scaleX(" + p.toFixed(4) + ")";
      lastStrip = tr;
    }
    var vis = (y - nTop > nDist + 4) ? "0" : "1";   // hide the progress line once the section scrolls away
    if (vis !== lastProgVis) {
      nProg.parentNode.style.opacity = vis;
      lastProgVis = vis;
    }
  }

  // Sideways input moves the strip too: trackpad swipes, Shift+wheel, touch swipes, and arrow keys.
  // Each is turned into ordinary page scroll, so right/down move forward and left/up move back,
  // and the same animation plays. Past either end, the page simply keeps scrolling.
  var SWIPE = {
    keyStep: 0.45,    // arrow keys move this fraction of a screen height
    glideDecay: 0.94  // how quickly a touch flick slows down after the finger lifts (closer to 1 = longer glide)
  };

  function stripActive() {
    var r = notes.getBoundingClientRect();
    return r.top < S.vh * 0.5 && r.bottom > S.vh * 0.5;
  }

  function scrollPage(dy, smooth) {
    window.scrollBy({ top: dy, behavior: smooth ? "smooth" : "instant" });
  }

  if (motion) {
    // Trackpads and Shift+wheel: horizontal wheel movement scrolls the page.
    window.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || !stripActive()) {
        return;
      }
      e.preventDefault();   // also stops the browser's swipe-to-go-back gesture here
      var unit = e.deltaMode === 1 ? 16 : (e.deltaMode === 2 ? S.vh : 1);
      scrollPage(e.deltaX * unit, false);
    }, { passive: false });

    // Touch: vertical swipes scroll natively (touch-action: pan-y in css/sections.css);
    // horizontal swipes come here, and the photos follow the finger.
    var stage = notes.querySelector(".notes-stage");
    var touchId = null, startX = 0, startY = 0, lastX = 0, lastT = 0, speed = 0, glide = 0, axis = "";
    var AXIS_LOCK = 8;   // pixels a finger must move before the swipe is called horizontal or vertical

    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") {
        return;
      }
      cancelAnimationFrame(glide);
      touchId = e.pointerId;
      startX = lastX = e.clientX;
      startY = e.clientY;
      lastT = e.timeStamp;
      speed = 0;
      axis = "";
    });

    stage.addEventListener("pointermove", function (e) {
      if (e.pointerId !== touchId) {
        return;
      }
      if (axis === "") {
        // Decide once, then stick with it: clearly sideways swipes move the photos; anything else
        // (vertical or diagonal) is left to the browser's own scrolling so the two never fight.
        var mx = Math.abs(e.clientX - startX), my = Math.abs(e.clientY - startY);
        if (mx < AXIS_LOCK && my < AXIS_LOCK) {
          return;
        }
        axis = mx > my * 1.25 ? "x" : "y";
        lastX = e.clientX;
        lastT = e.timeStamp;
        return;
      }
      if (axis !== "x") {
        return;
      }
      var dx = e.clientX - lastX, dt = Math.max(1, e.timeStamp - lastT);
      lastX = e.clientX;
      lastT = e.timeStamp;
      scrollPage(-dx, false);   // finger moving left = forward
      speed = 0.75 * speed + 0.25 * (-dx / dt);
    });

    function endTouch(e, cancelled) {
      if (e.pointerId !== touchId) {
        return;
      }
      touchId = null;
      var wasSideways = axis === "x";
      axis = "";
      // No glide after a vertical or diagonal swipe, or when the browser took over the gesture.
      if (!wasSideways || cancelled) {
        return;
      }
      var v = speed, prev = performance.now();
      // Let a quick flick keep gliding and ease to a stop.
      function step(now) {
        var dt = Math.min(48, now - prev);
        prev = now;
        scrollPage(v * dt, false);
        v *= Math.pow(SWIPE.glideDecay, dt / 16.667);
        if (Math.abs(v) > 0.03) {
          glide = requestAnimationFrame(step);
        }
      }
      if (Math.abs(v) > 0.1) {
        glide = requestAnimationFrame(step);
      }
    }
    stage.addEventListener("pointerup", function (e) { endTouch(e, false); });
    stage.addEventListener("pointercancel", function (e) { endTouch(e, true); });

    // Keyboard: Right and Left arrows step through the photos.
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || !stripActive()) {
        return;
      }
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
        return;
      }
      e.preventDefault();
      var step = S.vh * SWIPE.keyStep;
      scrollPage(e.key === "ArrowRight" ? step : -step, true);
    });
  }

  /* ---------- 3. Experience: rolling year and rail ---------- */

  var stops = Array.prototype.slice.call(document.querySelectorAll(".stop"));
  var reels = Array.prototype.slice.call(document.querySelectorAll(".reel"));
  var railDots = Array.prototype.slice.call(document.querySelectorAll(".rail li"));
  var roleEl = document.getElementById("dial-role");
  var odo = document.querySelector(".odo"), dialEl = document.querySelector(".dial");

  // Each digit of the year is a column of 0–9 that slides to the right digit.
  reels.forEach(function (r) {
    for (var d = 0; d < 10; d++) {
      var s = document.createElement("span");
      s.textContent = String(d);
      r.appendChild(s);
    }
  });

  var current = -1;
  function setStop(i) {
    if (i === current) {
      return;
    }
    current = i;
    var year = stops[i].getAttribute("data-year");   // from data-year on each .stop in index.html
    reels.forEach(function (r, k) { r.style.transform = "translateY(-" + year.charAt(k) + "em)"; });
    railDots.forEach(function (li, k) { li.classList.toggle("done", k <= i); });
    stops.forEach(function (s, k) { s.classList.toggle("is-current", k === i); });
    roleEl.textContent = stops[i].querySelector("h3").textContent;
  }
  // The current entry is the last one whose top has passed the middle of the screen.
  function updateDial() {
    var line = S.vh * 0.5, idx = 0;
    for (var i = 0; i < stops.length; i++) {
      if (stops[i].getBoundingClientRect().top < line) {
        idx = i;
      }
    }
    setStop(idx);
  }

  // Sizes the big year to fit its column on desktop.
  function fitOdo() {
    odo.style.fontSize = "";
    if (S.vw <= 760) {
      return;
    }
    odo.style.fontSize = "100px";
    var w = odo.scrollWidth, avail = dialEl.clientWidth;
    odo.style.fontSize = Math.min(200, 100 * avail / w * 0.97) + "px";
  }

  /* ---------- 4. Toolkit ticker ---------- */

  var kit = document.querySelector(".kit");
  var rows = Array.prototype.slice.call(document.querySelectorAll(".mq-row")).map(function (row) {
    var track = row.querySelector(".mq-track");
    if (motion) {
      var c = track.cloneNode(true);
      c.setAttribute("aria-hidden", "true");
      row.appendChild(c);
    }
    return { row: row, track: track, dir: parseFloat(row.getAttribute("data-dir")), x: 0, w: 1 };
  });
  function measureKit() { rows.forEach(function (r) { r.w = r.track.offsetWidth || 1; }); }
  function updateKit(dt) {
    var rect = kit.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > S.vh) {
      return; // off screen: skip
    }
    var boost = Math.min(Math.abs(S.velocity) * TICKER.scrollBoost, TICKER.maxBoost);
    rows.forEach(function (r) {
      r.x += r.dir * (TICKER.speed + boost) * dt;
      if (r.x <= -r.w) {
        r.x += r.w;
      }
      if (r.x > 0) {
        r.x -= r.w;
      }
      r.row.style.transform = "translate3d(" + r.x.toFixed(1) + "px,0,0)";
    });
  }

  /* ---------- 5. Solid top bar on phones during the experience timeline ---------- */

  // Elsewhere the top bar inverts the colors underneath it. Over the timeline, whose text scrolls right
  // under the bar, a solid background reads better. css/responsive.css styles .nav-solid on phones only.
  var navEl = document.querySelector(".nav");
  var solidZones = Array.prototype.slice.call(document.querySelectorAll(".exp"));
  var navH = 56, lastSolid = false;
  function updateNav() {
    var solid = false;
    if (S.vw <= 760) {
      for (var i = 0; i < solidZones.length; i++) {
        var r = solidZones[i].getBoundingClientRect();
        if (r.top <= navH && r.bottom > navH) {
          solid = true;
        }
      }
    }
    if (solid !== lastSolid) {
      navEl.classList.toggle("nav-solid", solid);
      lastSolid = solid;
    }
  }

  /* ---------- Hook into the loop ---------- */

  S.onMeasure(fitStmtPhoto, 10);   // runs before the scroll pauses (js/dwell.js), which depend on its result
  S.onMeasure(function () {
    navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 56;
    fitOdo();
    if (motion) {
      measureStmt();
      measureNotes();
      measureKit();
    }
  });
  S.onFrame(function (now, dt) {
    if (motion) {
      updateStmt();
      updateNotes();
      updateKit(dt);
    }
    updateDial();
    updateNav();
  });
})(window.Site);
