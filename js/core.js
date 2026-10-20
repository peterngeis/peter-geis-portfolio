/*
 * core.js
 * Shared helpers and the single animation loop that drives every scroll effect.
 *
 * Other scripts plug in through two hooks:
 *   Site.onMeasure(fn)  layout work. Runs on load, on resize, and when the web font arrives.
 *   Site.onFrame(fn)    animation work. Runs every frame as fn(now, dt).
 * Hooks run in the order the scripts are listed in index.html.
 */
window.Site = (function () {
  "use strict";

  // How quickly the smoothed scroll position catches up to the real one (0 to 1; higher = snappier).
  var SCROLL_SMOOTHING = 0.16;

  var doc = document.documentElement;
  var measurers = [];
  var frameFns = [];

  var site = {
    // False when the visitor's device asks for reduced motion (set by the small script in <head>).
    motion: doc.classList.contains("motion"),

    // Viewport size, refreshed before every measure pass.
    vh: window.innerHeight,
    vw: window.innerWidth,

    // Smoothed scroll position and how far it moved since the last frame.
    scrollY: window.scrollY,
    velocity: 0,

    clamp: function (v, min, max) { return v < min ? min : v > max ? max : v; },

    // Ease-out curve used by the photo zoom and the loader. A higher exponent gives a longer, softer finish.
    ease: function (t) { return 1 - Math.pow(1 - t, 2); },

    // Distance from the top of the page to an element.
    absTop: function (el) { return el.getBoundingClientRect().top + window.scrollY; },

    onMeasure: function (fn) { measurers.push(fn); },
    onFrame: function (fn) { frameFns.push(fn); }
  };

  function measureAll() {
    site.vh = window.innerHeight;
    site.vw = window.innerWidth;
    for (var i = 0; i < measurers.length; i++) {
      measurers[i]();
    }
  }

  var queued = 0;
  function queueMeasure() {
    if (queued) {
      return;
    }
    queued = requestAnimationFrame(function () { queued = 0; measureAll(); });
  }

  var lastT = performance.now();
  function loop(now) {
    var dt = Math.min(3, (now - lastT) / 16.667);   // 1 = one 60 Hz frame
    lastT = now;

    var target = window.scrollY, prev = site.scrollY;
    site.scrollY = site.motion ? prev + (target - prev) * Math.min(1, SCROLL_SMOOTHING * dt) : target;
    if (Math.abs(target - site.scrollY) < 0.05) {
      site.scrollY = target;
    }
    site.velocity = site.scrollY - prev;

    for (var i = 0; i < frameFns.length; i++) {
      frameFns[i](now, dt);
    }
    requestAnimationFrame(loop);
  }

  // Deferred scripts all run before DOMContentLoaded, so every hook is registered by now.
  document.addEventListener("DOMContentLoaded", function () {
    window.addEventListener("resize", queueMeasure);
    window.addEventListener("load", queueMeasure);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(queueMeasure);
    }
    measureAll();
    requestAnimationFrame(loop);
  });

  return site;
})();
