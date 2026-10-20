/*
 * scroll-effects.js
 * The smaller scroll-driven pieces:
 *   1. the introduction statement that fills in word by word
 *   2. the "Field photos" strip that scrolls sideways
 *   3. the experience timeline's rolling year and progress rail
 *   4. the toolkit ticker
 */
(function (S) {
  "use strict";
  var clamp = S.clamp, motion = S.motion;

  /* ---------- Settings you can tweak ---------- */

  var STATEMENT = {
    dimOpacity: 0.16,    // opacity of words that haven't filled in yet
    startAt: 0.82,       // words start filling when the statement's top reaches this fraction of the screen
    span: 0.32           // extra scroll (in screen heights) over which the fill completes
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
  function measureStmt() { sTop = S.absTop(stmt); sH = stmt.offsetHeight; }
  function updateStmt() {
    var p = clamp((S.scrollY + S.vh * STATEMENT.startAt - sTop) / (sH + S.vh * STATEMENT.span), 0, 1);
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

  // The section is made exactly tall enough that scrolling down moves the strip across once.
  function measureNotes() {
    strip.style.transform = "none";
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

  /* ---------- Hook into the loop ---------- */

  S.onMeasure(function () {
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
  });
})(window.Site);
