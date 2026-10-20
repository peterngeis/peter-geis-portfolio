/*
 * build-photo.js
 * "My current build": the photo that grows from a framed window to full screen as you scroll,
 * then the clickable part points on the PC.
 *
 * How long the section stays pinned is set in css/build-photo.css (.reveal height).
 */
(function (S) {
  "use strict";
  var clamp = S.clamp, ease = S.ease;

  /* ---------- Settings you can tweak ---------- */

  var ZOOM = {
    finishAt: 0.5,        // fraction of the pinned scroll where the photo reaches full screen
    pointsAt: 0.55,       // fraction where the part points fade in (keep just above finishAt)
    startWidth: 0.82,     // starting frame width, as a fraction of the screen
    startWidthPhone: 0.9, // same, on screens narrower than 760 px
    startHeight: 0.76,    // starting frame height
    startZoom: 1.2        // starting photo zoom (1.2 = 120%), settling to 100%
  };

  // The photo's pixel size and the point to keep centered when it's cropped to fit the screen.
  var PHOTO = { width: 2200, height: 1650, focusX: 0.47, focusY: 0.57 };

  /* ---------- Zoom ---------- */

  var reveal = document.querySelector(".reveal");
  var stage = reveal.querySelector(".stage");
  var frame = reveal.querySelector(".frame");   // the window that grows
  var cover = reveal.querySelector(".cover");   // the photo and part points inside it
  var points = Array.prototype.slice.call(reveal.querySelectorAll(".hs"));

  var rTop = 0, rLen = 1;
  var lastFrame = "", lastCover = "", lastFull = false, lastHot = false;

  // Sizes the photo to cover the screen around its focus point, and flips the labels of points near the right edge.
  function measureReveal() {
    var cw = stage.clientWidth, ch = stage.clientHeight;
    var s = Math.max(cw / PHOTO.width, ch / PHOTO.height), w = PHOTO.width * s, h = PHOTO.height * s;
    var l = clamp(cw / 2 - PHOTO.focusX * w, cw - w, 0), t = clamp(ch / 2 - PHOTO.focusY * h, ch - h, 0);
    cover.style.left = l + "px"; cover.style.top = t + "px";
    cover.style.width = w + "px"; cover.style.height = h + "px";
    cover.style.transformOrigin = (cw / 2 - l).toFixed(1) + "px " + (ch / 2 - t).toFixed(1) + "px";
    lastFrame = ""; lastCover = "";
    rTop = S.absTop(reveal);
    rLen = Math.max(1, reveal.offsetHeight - S.vh);
    points.forEach(function (el) {
      var x = l + parseFloat(el.style.left) / 100 * w;
      el.classList.toggle("flip", x > cw * 0.55);
    });
  }

  // Uses transforms only, which the graphics card animates without repainting the photo.
  // The frame scales up while the photo inside scales down by the same amount, so it never stretches.
  function updateReveal() {
    var p = clamp((S.scrollY - rTop) / rLen, 0, 1);
    var e = ease(clamp(p / ZOOM.finishAt, 0, 1));
    var startW = S.vw < 760 ? ZOOM.startWidthPhone : ZOOM.startWidth;
    var fx = 1 - (1 - e) * (1 - startW), fy = 1 - (1 - e) * (1 - ZOOM.startHeight);
    var z = 1 + (ZOOM.startZoom - 1) * (1 - e);

    var fr = "scale(" + fx.toFixed(4) + "," + fy.toFixed(4) + ")";
    var cv = "scale(" + (z / fx).toFixed(4) + "," + (z / fy).toFixed(4) + ")";
    if (fr !== lastFrame) {
      frame.style.transform = fr;
      lastFrame = fr;
    }
    if (cv !== lastCover) {
      cover.style.transform = cv;
      lastCover = cv;
    }

    var full = e > 0.995;          // square the corners once it fills the screen
    if (full !== lastFull) {
      reveal.classList.toggle("full", full);
      lastFull = full;
    }
    var hot = p > ZOOM.pointsAt;   // show the part points and caption
    if (hot !== lastHot) {
      reveal.classList.toggle("hot", hot);
      lastHot = hot;
    }
  }

  /* ---------- Part points: hover on desktop, tap on phones ---------- */

  var EDGE = 12;   // minimum gap, in pixels, between a part card and the edge of the screen

  // Keeps a part's card fully on screen. The card normally sits beside its dot; when that
  // would run off an edge (common on phones), it moves below the dot instead, or above it
  // near the bottom, and slides sideways until it fits.
  function placeTip(h) {
    var tip = h.querySelector(".tip");
    var dot = h.getBoundingClientRect();
    var area = stage.getBoundingClientRect();
    var navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 64;
    var minX = Math.max(area.left, 0) + EDGE, maxX = Math.min(area.right, window.innerWidth) - EDGE;
    var minY = Math.max(area.top, 0) + navH + EDGE, maxY = Math.min(area.bottom, window.innerHeight) - EDGE;
    // Stay above the "My current build" caption, which sits under the photo's dark fade.
    var cap = reveal.querySelector(".frame-cap");
    if (cap) {
      maxY = Math.min(maxY, cap.getBoundingClientRect().top - EDGE);
    }
    var w = tip.offsetWidth, ht = tip.offsetHeight;

    // Where the card lands with no adjustment (offsetLeft/Top ignore the fade-in slide).
    var left = dot.left + tip.offsetLeft;
    var top = dot.top + tip.offsetTop - ht / 2;
    var newLeft = left, newTop = top;

    if (left < minX || left + w > maxX) {
      var cx = dot.left + dot.width / 2;
      newLeft = clamp(cx - w / 2, minX, Math.max(minX, maxX - w));
      newTop = dot.bottom + 6;
      if (newTop + ht > maxY) {
        newTop = dot.top - 6 - ht;
      }
    }
    newTop = clamp(newTop, minY, Math.max(minY, maxY - ht));
    h.style.setProperty("--dx", (newLeft - left).toFixed(1) + "px");
    h.style.setProperty("--dy", (newTop - top).toFixed(1) + "px");
  }

  function closePoints(except) {
    points.forEach(function (o) {
      if (o === except) {
        return;
      }
      o.classList.remove("open");
      o.querySelector(".hs-dot").setAttribute("aria-expanded", "false");
    });
  }
  points.forEach(function (h) {
    var b = h.querySelector(".hs-dot");
    b.addEventListener("click", function () {
      var open = !h.classList.contains("open");
      closePoints(h);
      if (open) {
        placeTip(h);
      }
      h.classList.toggle("open", open);
      b.setAttribute("aria-expanded", String(open));
    });
    h.addEventListener("pointerenter", function () {
      placeTip(h);
    });
    h.addEventListener("focusin", function () {
      placeTip(h);
    });
  });
  window.addEventListener("resize", function () {
    points.forEach(function (h) {
      if (h.classList.contains("open")) {
        placeTip(h);
      }
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".hs")) {
      closePoints(null);
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closePoints(null);
    }
  });

  S.onMeasure(measureReveal);
  if (S.motion) {
    S.onFrame(updateReveal);
  }
})(window.Site);
