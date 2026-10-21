/*
 * field-photos.js
 * The "Field photos" strip. Scrolling down moves it sideways, and sideways input moves it too:
 * trackpad swipes, Shift + wheel, touch swipes, and the left and right arrow keys.
 */
(function (Site) {
  "use strict";
  const { clamp } = Site;

  /* ---------- Settings you can tweak ---------- */

  const SIDEWAYS_INPUT = {
    arrowKeyStep: 0.45,        // arrow keys move this fraction of a screen height
    glideDecay: 0.94,          // how quickly a touch flick slows down after the finger lifts (closer to 1 = longer glide)
    axisDecisionDistance: 8    // pixels a finger must move before the swipe is called horizontal or vertical
  };

  const fieldPhotos = document.querySelector(".field-photos");
  const photoStrip = document.getElementById("photo-strip");
  const progressFill = fieldPhotos.querySelector(".field-photos-progress-fill");

  let fieldPhotosTop = 0;
  let stripTravel = 1;          // how far the strip moves sideways in total, in pixels
  let lastStripTransform = "";
  let lastProgressVisibility = "";

  // Decode every photo up front so none pops in (or flashes) while swiping.
  photoStrip.querySelectorAll("img").forEach((image) => {
    if (image.decode) {
      image.decode().catch(() => {});
    }
  });

  /* ---------- Scroll position to strip position ---------- */

  // The section is made exactly tall enough that scrolling down moves the strip across once.
  // The strip's transform is left alone while measuring: clearing it (even briefly) showed up as a
  // one-frame flash back to the first photo whenever a phone's address bar caused a resize mid-scroll.
  function measureFieldPhotos() {
    stripTravel = Math.max(1, photoStrip.scrollWidth - Site.viewportWidth);
    fieldPhotos.style.height = (stripTravel + Site.viewportHeight) + "px";
    fieldPhotosTop = Site.documentTop(fieldPhotos);
    lastStripTransform = "";
  }

  function updateFieldPhotos() {
    const scrolledIntoSection = Site.scrollY - fieldPhotosTop;
    const progress = clamp(scrolledIntoSection / stripTravel, 0, 1);

    const stripTransform = "translate3d(" + (-progress * stripTravel).toFixed(1) + "px,0,0)";
    if (stripTransform !== lastStripTransform) {
      photoStrip.style.transform = stripTransform;
      progressFill.style.transform = "scaleX(" + progress.toFixed(4) + ")";
      lastStripTransform = stripTransform;
    }

    // Hide the progress line once the section scrolls away.
    const progressVisibility = scrolledIntoSection > stripTravel + 4 ? "0" : "1";
    if (progressVisibility !== lastProgressVisibility) {
      progressFill.parentNode.style.opacity = progressVisibility;
      lastProgressVisibility = progressVisibility;
    }
  }

  /* ---------- Sideways input becomes page scroll ---------- */

  // Each kind of sideways input is turned into ordinary page scroll, so right/down move forward and
  // left/up move back, and the same animation plays. Past either end, the page simply keeps scrolling.

  function isStripOnScreen() {
    const sectionBox = fieldPhotos.getBoundingClientRect();
    return sectionBox.top < Site.viewportHeight * 0.5 && sectionBox.bottom > Site.viewportHeight * 0.5;
  }

  function scrollPage(distance, isSmooth) {
    window.scrollBy({ top: distance, behavior: isSmooth ? "smooth" : "instant" });
  }

  function setUpSidewaysInput() {
    // Trackpads and Shift + wheel: horizontal wheel movement scrolls the page.
    window.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || !isStripOnScreen()) {
        return;
      }
      event.preventDefault();   // also stops the browser's swipe-to-go-back gesture here
      const pixelsPerUnit = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? Site.viewportHeight : 1);
      scrollPage(event.deltaX * pixelsPerUnit, false);
    }, { passive: false });

    setUpTouchSwipes();

    // Keyboard: Right and Left arrows step through the photos.
    document.addEventListener("keydown", (event) => {
      if ((event.key !== "ArrowRight" && event.key !== "ArrowLeft") || !isStripOnScreen()) {
        return;
      }
      const target = event.target;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return;
      }
      event.preventDefault();
      const stepDistance = Site.viewportHeight * SIDEWAYS_INPUT.arrowKeyStep;
      scrollPage(event.key === "ArrowRight" ? stepDistance : -stepDistance, true);
    });
  }

  // Touch: vertical swipes scroll natively (touch-action: pan-y in css/field-photos.css);
  // horizontal swipes come here, and the photos follow the finger.
  function setUpTouchSwipes() {
    const stage = fieldPhotos.querySelector(".field-photos-stage");
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastTime = 0;
    let flickSpeed = 0;
    let glideFrame = 0;
    let swipeAxis = "";   // "" until decided, then "x" (sideways) or "y" (vertical or diagonal)

    stage.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") {
        return;
      }
      cancelAnimationFrame(glideFrame);
      activePointerId = event.pointerId;
      startX = event.clientX;
      lastX = event.clientX;
      startY = event.clientY;
      lastTime = event.timeStamp;
      flickSpeed = 0;
      swipeAxis = "";
    });

    stage.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activePointerId) {
        return;
      }
      if (swipeAxis === "") {
        // Decide once, then stick with it: clearly sideways swipes move the photos; anything else
        // (vertical or diagonal) is left to the browser's own scrolling so the two never fight.
        const movedX = Math.abs(event.clientX - startX);
        const movedY = Math.abs(event.clientY - startY);
        if (movedX < SIDEWAYS_INPUT.axisDecisionDistance && movedY < SIDEWAYS_INPUT.axisDecisionDistance) {
          return;
        }
        swipeAxis = movedX > movedY * 1.25 ? "x" : "y";
        lastX = event.clientX;
        lastTime = event.timeStamp;
        return;
      }
      if (swipeAxis !== "x") {
        return;
      }
      const deltaX = event.clientX - lastX;
      const deltaTime = Math.max(1, event.timeStamp - lastTime);
      lastX = event.clientX;
      lastTime = event.timeStamp;
      scrollPage(-deltaX, false);   // finger moving left = forward
      flickSpeed = 0.75 * flickSpeed + 0.25 * (-deltaX / deltaTime);
    });

    function finishTouch(event, wasCancelled) {
      if (event.pointerId !== activePointerId) {
        return;
      }
      activePointerId = null;
      const wasSideways = swipeAxis === "x";
      swipeAxis = "";
      // No glide after a vertical or diagonal swipe, or when the browser took over the gesture.
      if (!wasSideways || wasCancelled) {
        return;
      }
      let glideSpeed = flickSpeed;
      let previousTime = performance.now();
      // Let a quick flick keep gliding and ease to a stop.
      function glideStep(now) {
        const deltaTime = Math.min(48, now - previousTime);
        previousTime = now;
        scrollPage(glideSpeed * deltaTime, false);
        glideSpeed *= Math.pow(SIDEWAYS_INPUT.glideDecay, deltaTime / 16.667);
        if (Math.abs(glideSpeed) > 0.03) {
          glideFrame = requestAnimationFrame(glideStep);
        }
      }
      if (Math.abs(glideSpeed) > 0.1) {
        glideFrame = requestAnimationFrame(glideStep);
      }
    }
    stage.addEventListener("pointerup", (event) => { finishTouch(event, false); });
    stage.addEventListener("pointercancel", (event) => { finishTouch(event, true); });
  }

  // Without motion the strip is an ordinary scrollable row, so none of this applies.
  if (Site.motionEnabled) {
    Site.onMeasure(measureFieldPhotos);
    Site.onFrame(updateFieldPhotos);
    setUpSidewaysInput();
  }
})(window.Site);
