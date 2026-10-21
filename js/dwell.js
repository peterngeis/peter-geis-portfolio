/*
 * dwell.js
 * Pauses the page on full-screen frames, the way the build photo holds still while you scroll.
 *
 * A frame is marked up in index.html as:
 *
 *   <div class="dwell" data-frame="name">
 *     <div class="the-frame"> ... </div>      (the first child is what gets pinned)
 *   </div>
 *
 * When the frame fits on screen, it sticks in the middle of the screen and the page keeps scrolling
 * for a short "runway" before releasing it. If the same data-frame name appears on a nested wrapper
 * (see the class demo), the outer one is tried first and the inner one is the fallback for small screens.
 * Frames that don't fit, and visitors who prefer reduced motion, just scroll normally.
 *
 * The layout is plain CSS (position: sticky); this script only works out the numbers.
 * Other scripts read Site.frames[name] = { active, wrapTop, pinStart, pinEnd, top } to sync animations.
 */
(function (S) {
  "use strict";

  /* ---------- Settings you can tweak ---------- */

  var DWELL = {
    distance: 0.38,   // how long a frame holds, as a fraction of the screen height (0.38 = a bit over a third of a screen of scrolling)
    minRoom: 16       // a frame only pauses if it fits on screen with at least this many pixels to spare
  };

  var wrappers = Array.prototype.slice.call(document.querySelectorAll(".dwell"));
  var byFrame = {};
  wrappers.forEach(function (w) {
    var name = w.getAttribute("data-frame");
    if (!byFrame[name]) {
      byFrame[name] = [];
    }
    byFrame[name].push(w);
  });

  function release(w) {
    w.classList.remove("is-pinned");
    w.style.minHeight = "";
    w.style.removeProperty("--dwell-top");
  }

  function measureDwell() {
    var navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 64;
    var run = Math.round(S.vh * DWELL.distance);
    var chosen = {};

    wrappers.forEach(release);

    Object.keys(byFrame).forEach(function (name) {
      S.frames[name] = { active: false };
      if (!S.motion) {
        return;
      }
      for (var i = 0; i < byFrame[name].length; i++) {
        var w = byFrame[name][i];
        var h = w.firstElementChild.offsetHeight;
        if (h > S.vh - navH - DWELL.minRoom) {
          continue;
        }
        // Stick centered in the space below the nav bar.
        var top = Math.round(navH + (S.vh - navH - h) / 2);
        w.classList.add("is-pinned");
        w.style.setProperty("--dwell-top", top + "px");
        w.style.minHeight = (h + run) + "px";
        chosen[name] = { wrapper: w, top: top };
        break;
      }
    });

    // Every runway is in place now, so document positions are final.
    Object.keys(chosen).forEach(function (name) {
      var c = chosen[name];
      var wrapTop = S.absTop(c.wrapper);
      var pinStart = wrapTop - c.top;
      S.frames[name] = { active: true, wrapTop: wrapTop, pinStart: pinStart, pinEnd: pinStart + run, top: c.top };
    });
  }

  S.onMeasure(measureDwell, 20);
})(window.Site);
