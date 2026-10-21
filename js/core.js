/*
 * core.js
 * Shared helpers and the single animation loop that drives every scroll effect.
 *
 * Other scripts plug in through two hooks:
 *   Site.onMeasure(measureFunction, order)
 *       Layout work. Runs on load, on a real resize, and when the web font arrives.
 *       A lower "order" runs first (default 50). Scripts that change the layout
 *       (photo sizing = 10, scroll pauses = 20) run before scripts that read positions.
 *   Site.onFrame(frameFunction)
 *       Animation work. Runs every frame as frameFunction(now, framesElapsed).
 * Functions with the same order run in the order the scripts are listed in index.html.
 */
window.Site = (function () {
  "use strict";

  // Desktop and trackpad: how quickly the smoothed scroll position catches up to the real one (0 to 1; higher = snappier).
  const SCROLL_SMOOTHING = 0.16;

  // After the page loads, a link like petergeis.com/#off-the-clock is re-aligned for this many milliseconds,
  // because sections above it finish sizing themselves after the browser first jumps there.
  const HASH_SETTLE_DURATION = 1500;

  const root = document.documentElement;
  const measureSteps = [];
  const frameSteps = [];

  // Touch screens already scroll with native momentum. Smoothing it a second time makes effects driven by
  // script lag behind the native layers, so phones and tablets follow the real scroll position exactly.
  const isTouchScreen = window.matchMedia("(pointer: coarse)").matches;

  // An invisible element as tall as the "small viewport" (100svh). Unlike window.innerHeight, it does not
  // change when a phone's address bar slides in and out, so layout measurements stay stable while scrolling.
  const viewportProbe = document.createElement("div");
  viewportProbe.setAttribute("aria-hidden", "true");
  viewportProbe.style.cssText = "position:fixed;left:0;top:0;width:1px;height:100svh;visibility:hidden;pointer-events:none;";
  document.body.appendChild(viewportProbe);

  function readViewportHeight() {
    const probeHeight = viewportProbe.offsetHeight;
    return probeHeight > 0 ? probeHeight : window.innerHeight;
  }

  const Site = {
    // False when the visitor's device asks for reduced motion (set by the small script in <head>).
    motionEnabled: root.classList.contains("motion-enabled"),

    // Viewport size, refreshed before every measure pass. The height is the small viewport height (see above).
    viewportHeight: readViewportHeight(),
    viewportWidth: window.innerWidth,

    // Smoothed scroll position, and how far it moved since the last frame.
    scrollY: window.scrollY,
    velocity: 0,

    // Scroll-pause frames, filled in by js/scroll-pause.js:
    // { intro: { active, wrapperTop, pinStart, pinEnd, stickTop }, painter: { ... } }
    pauseFrames: {},

    // How many layout passes have run (handy when testing).
    measureCount: 0,

    clamp(value, minimum, maximum) {
      return value < minimum ? minimum : value > maximum ? maximum : value;
    },

    // Ease-out curve used by the photo zoom and the loader. A higher exponent gives a longer, softer finish.
    easeOut(progress) {
      return 1 - Math.pow(1 - progress, 2);
    },

    // Distance from the top of the page to an element. Only trust this inside a measure pass:
    // while one runs, pinned frames are put back at their natural position (see html.is-measuring in css/scroll-pause.css).
    documentTop(element) {
      return element.getBoundingClientRect().top + window.scrollY;
    },

    onMeasure(measureFunction, order) {
      measureSteps.push({
        run: measureFunction,
        order: order === undefined ? 50 : order,
        registrationIndex: measureSteps.length
      });
      measureSteps.sort((first, second) => {
        return first.order - second.order || first.registrationIndex - second.registrationIndex;
      });
    },

    onFrame(frameFunction) {
      frameSteps.push(frameFunction);
    }
  };

  let lastMeasuredWidth = Site.viewportWidth;
  let lastMeasuredHeight = Site.viewportHeight;

  // Runs every animation once, so the first frame painted after a layout pass is already up to date.
  function runEveryFrameFunctionOnce() {
    const now = performance.now();
    for (const frameStep of frameSteps) {
      frameStep(now, 0);
    }
  }

  function measureLayout() {
    Site.viewportHeight = readViewportHeight();
    Site.viewportWidth = window.innerWidth;
    lastMeasuredWidth = Site.viewportWidth;
    lastMeasuredHeight = Site.viewportHeight;

    root.classList.add("is-measuring");
    for (const measureStep of measureSteps) {
      measureStep.run();
    }
    root.classList.remove("is-measuring");

    Site.measureCount++;
    runEveryFrameFunctionOnce();
  }

  // Links such as /#off-the-clock: sections above the target change height while the page settles,
  // so jump to the target again until the visitor takes over with the wheel, a touch, or a key.
  let isSettling = true;
  let visitorHasInteracted = false;
  ["wheel", "touchstart", "keydown", "pointerdown"].forEach((eventName) => {
    window.addEventListener(eventName, () => { visitorHasInteracted = true; }, { passive: true, once: true });
  });

  function realignToLinkTarget() {
    if (!isSettling || visitorHasInteracted || location.hash.length < 2) {
      return;
    }
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) {
      target.scrollIntoView({ behavior: "instant", block: "start" });
      Site.scrollY = window.scrollY;
    }
  }

  let measureIsScheduled = 0;
  function scheduleMeasure() {
    if (measureIsScheduled) {
      return;
    }
    measureIsScheduled = requestAnimationFrame(() => {
      measureIsScheduled = 0;
      measureLayout();
      realignToLinkTarget();
    });
  }

  // Phones fire "resize" while the address bar slides in and out. Layout only uses the width and the small
  // viewport height, so a resize that changes neither is ignored instead of redoing every measurement mid-scroll.
  function handleResize() {
    if (window.innerWidth === lastMeasuredWidth && readViewportHeight() === lastMeasuredHeight) {
      return;
    }
    scheduleMeasure();
  }

  let lastFrameTime = performance.now();
  function animationLoop(now) {
    const framesElapsed = Math.min(3, (now - lastFrameTime) / 16.667);   // 1 = one 60 Hz frame
    lastFrameTime = now;

    const nativeScrollY = window.scrollY;
    const previousScrollY = Site.scrollY;
    const shouldSmooth = Site.motionEnabled && !isTouchScreen;
    Site.scrollY = shouldSmooth
      ? previousScrollY + (nativeScrollY - previousScrollY) * Math.min(1, SCROLL_SMOOTHING * framesElapsed)
      : nativeScrollY;
    if (Math.abs(nativeScrollY - Site.scrollY) < 0.05) {
      Site.scrollY = nativeScrollY;
    }
    Site.velocity = Site.scrollY - previousScrollY;

    for (const frameStep of frameSteps) {
      frameStep(now, framesElapsed);
    }
    requestAnimationFrame(animationLoop);
  }

  // Deferred scripts all run before DOMContentLoaded, so every hook is registered by now.
  document.addEventListener("DOMContentLoaded", () => {
    window.addEventListener("resize", handleResize);
    window.addEventListener("load", () => {
      scheduleMeasure();
      setTimeout(() => { isSettling = false; }, HASH_SETTLE_DURATION);
    });
    if (document.fonts) {
      // The web font usually arrives after the first measurement and changes how much room text takes.
      // "ready" alone is not enough (it can already be resolved before the font starts loading),
      // so also measure again every time a batch of fonts finishes loading.
      document.fonts.ready.then(scheduleMeasure);
      document.fonts.addEventListener("loadingdone", scheduleMeasure);
    }
    measureLayout();
    requestAnimationFrame(animationLoop);
  });

  return Site;
})();
