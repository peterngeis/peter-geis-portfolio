/*
 * hero.js
 * The landing screen: the loader counter, sizing the giant name to fit the screen,
 * the lavender text reveal that follows the cursor, and the ASCII radar's pulses.
 */
(function (Site) {
  "use strict";
  const { clamp, easeOut, motionEnabled } = Site;
  const root = document.documentElement;

  /* ---------- Settings you can tweak ---------- */

  const RADAR = {
    pulseSpeed: 6,        // how fast a pulse travels, in pixels per millisecond
    pulseLength: 44,      // length of each pulse, in pixels
    echoPause: 40,        // milliseconds to wait after an echo returns before the next pulse
    pingDuration: 380,    // milliseconds the ring at the target takes to fade
    // Which character of the ASCII drawing the beam leaves from, counting from 1.
    // Line 7, column 35 is the middle "#" of the main array.
    emitterLine: 7,
    emitterColumn: 35
  };

  const CURSOR_REVEAL = {
    radiusAsFractionOfWidth: 0.1,   // circle radius as a fraction of the screen width
    minimumRadius: 96,
    maximumRadius: 170
  };

  const LOADER_COUNT_DURATION = 1350;   // milliseconds the "°C Liquid" counter takes to reach 30

  /* ---------- Loader counter (first visit per session only) ---------- */

  const loaderNumber = document.getElementById("loader-number");
  if (motionEnabled && !root.classList.contains("loader-seen")) {
    const loaderStartTime = performance.now();
    const countUp = (now) => {
      const progress = clamp((now - loaderStartTime) / LOADER_COUNT_DURATION, 0, 1);
      loaderNumber.textContent = String(Math.round(18 + 12 * easeOut(progress)));
      if (progress < 1) {
        requestAnimationFrame(countUp);
      }
    };
    requestAnimationFrame(countUp);
    document.querySelector(".loader").addEventListener("click", () => { root.classList.add("loader-seen"); });
  }

  /* ---------- Fit the name to the screen ---------- */

  const heroElement = document.querySelector(".hero");
  const heroMeta = heroElement.querySelector(".hero-meta");
  const heroName = heroElement.querySelector(".hero-name");
  const nameLines = heroName.querySelectorAll(".name-line-text");   // "PETER" and "GEIS"
  const radar = document.getElementById("radar");

  // Sizes the name as large as possible without overflowing the width or the screen height.
  function fitNameToScreen() {
    heroName.style.fontSize = "100px";
    const widestLineWidth = Math.max(nameLines[0].getBoundingClientRect().width, nameLines[1].getBoundingClientRect().width);
    const heroStyle = getComputedStyle(heroElement);
    const availableWidth = heroElement.clientWidth - parseFloat(heroStyle.paddingLeft) - parseFloat(heroStyle.paddingRight);
    let availableHeight = Site.viewportHeight - parseFloat(heroStyle.paddingTop) - parseFloat(heroStyle.paddingBottom)
      - heroMeta.offsetHeight - parseFloat(getComputedStyle(heroName).marginBottom) - 8;
    if (heroElement.classList.contains("has-radar-in-flow")) {
      availableHeight -= radar.offsetHeight + 14;
    }
    const fontSize = Math.min(100 * availableWidth / widestLineWidth, 100 * availableHeight / heroName.offsetHeight);
    heroName.style.fontSize = Math.max(40, fontSize) + "px";

    // The lavender copy of the name (the cursor reveal) must stay exactly the same size.
    const revealName = document.querySelector(".hero-reveal .hero-name");
    if (revealName) {
      revealName.style.fontSize = heroName.style.fontSize;
    }
  }

  /* ---------- Cursor reveal and radar ---------- */

  const heroReveal = document.getElementById("hero-reveal");               // the lavender copy of the name, clipped to a circle
  const radarReadout = document.getElementById("radar-readout");           // "TRACK 01 RANGE 642 PIXELS"
  const radarArt = radar.querySelector(".radar-art");
  const radarBeams = document.getElementById("radar-beams");               // track line and pulses
  const radarTargetLayer = document.getElementById("radar-target-layer");  // target box, label, and ping (inverts over letters)
  const beamTrack = radarBeams.querySelector(".beam-track");
  const pulseOut = radarBeams.querySelector(".beam-pulse-out");
  const pulseReturn = radarBeams.querySelector(".beam-pulse-return");
  const targetPing = radarTargetLayer.querySelector(".target-ping");
  const target = radarTargetLayer.querySelector(".target");
  const targetLabel = radarTargetLayer.querySelector(".target-label");

  // The ASCII drawing's size is read from the text itself, so you can redraw it freely (spaces only, no tabs).
  const artLines = radarArt.textContent.split("\n");
  if (artLines[artLines.length - 1] === "") {
    artLines.pop();
  }
  const ART_ROW_COUNT = artLines.length;
  const ART_COLUMN_COUNT = Math.max(...artLines.map((line) => line.length));
  radar.style.width = ART_COLUMN_COUNT + "ch";
  radarArt.style.width = ART_COLUMN_COUNT + "ch";

  // Build the reveal layer: an identical copy of the name and role line, plus a spacer used on phones.
  [heroName, heroMeta].forEach((original) => {
    const copy = original.cloneNode(true);
    copy.removeAttribute("id");
    copy.removeAttribute("aria-label");
    heroReveal.appendChild(copy);
  });
  const revealSpacer = document.createElement("div");
  revealSpacer.className = "hero-reveal-spacer";
  heroReveal.insertBefore(revealSpacer, heroReveal.lastChild);
  heroElement.insertBefore(radar, heroMeta);   // lets the radar join the layout above the rule on phones

  let heroWidth = 1;
  let heroHeight = 1;
  let emitterX = 0;                  // where the beam starts (the main array)
  let emitterY = 0;
  let targetX = 0;                   // where the target should be...
  let targetY = 0;
  let currentX = 0;                  // ...and where it is now, easing toward it
  let currentY = 0;
  let revealRadius = 0;              // reveal circle: current radius, the radius it's easing toward, and its full size
  let revealRadiusGoal = 0;
  let revealRadiusFull = 150;
  let mode = "scan";                 // "scan" (idle), "track" (cursor), or "lock" (finger down on phones)
  let pulsePhase = "out";            // "out", "back", or "gap" (the pause after an echo returns)
  let phaseStartTime = performance.now();
  let echoArrivedTime = -1e9;
  let frameCount = 0;
  const scanStartTime = performance.now();

  // Places the radar just above the rule over "Senior Systems Engineer":
  // beside "GEIS" when there's room, below it otherwise, or in the layout on phones.
  function placeRadar() {
    radar.style.display = "";
    radarBeams.style.display = "";
    radarTargetLayer.style.display = "";
    heroElement.classList.remove("has-radar-in-flow");
    revealSpacer.style.height = "0px";
    radar.style.left = "";
    radar.style.top = "";
    fitNameToScreen();

    const firstLineBox = nameLines[0].getBoundingClientRect();
    const secondLineBox = nameLines[1].getBoundingClientRect();
    const heroBox = heroElement.getBoundingClientRect();
    const metaBox = heroMeta.getBoundingClientRect();
    const nameFontSize = parseFloat(heroName.style.fontSize) || 100;
    const heroStyle = getComputedStyle(heroElement);
    const paddingLeft = parseFloat(heroStyle.paddingLeft);
    const contentWidth = heroElement.clientWidth - paddingLeft - parseFloat(heroStyle.paddingRight);
    const radarFloor = metaBox.top - heroBox.top - 14;
    const firstLineBottom = firstLineBox.bottom - heroBox.top - nameFontSize * 0.12 + 10;
    const secondLineBottom = secondLineBox.bottom - heroBox.top - nameFontSize * 0.12 + 10;

    const baseFontSize = clamp(Site.viewportWidth * 0.007, 7.5, 12);
    radar.style.fontSize = baseFontSize + "px";
    const widthAtBaseSize = radar.offsetWidth || 1;
    const heightAtBaseSize = radar.offsetHeight || 1;
    const scaleBesideName = Math.min(
      1,
      (secondLineBox.left - heroBox.left - paddingLeft - 28) / widthAtBaseSize,
      (radarFloor - firstLineBottom) / heightAtBaseSize
    );
    const scaleBelowName = Math.min(1, contentWidth / widthAtBaseSize, (radarFloor - secondLineBottom) / heightAtBaseSize);
    const scale = Math.max(scaleBesideName, scaleBelowName);
    let radarFontSize = baseFontSize * scale;

    if (radarFontSize >= 6) {
      radar.style.fontSize = radarFontSize + "px";
      const roomAvailable = scale === scaleBelowName ? radarFloor - secondLineBottom : radarFloor - firstLineBottom;
      if (radar.offsetHeight > roomAvailable) {
        radarFontSize *= 0.92;
        radar.style.fontSize = radarFontSize + "px";
      }
      radar.style.left = paddingLeft + "px";
      radar.style.top = (radarFloor - radar.offsetHeight) + "px";
    } else {
      radarFontSize = Math.min(baseFontSize, baseFontSize * contentWidth / widthAtBaseSize);
      radar.style.fontSize = radarFontSize + "px";
      heroElement.classList.add("has-radar-in-flow");
      fitNameToScreen();
      if (parseFloat(heroName.style.fontSize) < 48) {
        // Too short for both the name and the radar (phones in landscape): hide the radar.
        heroElement.classList.remove("has-radar-in-flow");
        fitNameToScreen();
        radar.style.display = "none";
        radarBeams.style.display = "none";
        radarTargetLayer.style.display = "none";
      } else {
        revealSpacer.style.height = (radar.offsetHeight + 14) + "px";
      }
    }
    radar.classList.add("is-placed");

    const artBox = radarArt.getBoundingClientRect();
    const characterWidth = artBox.width / ART_COLUMN_COUNT;
    const lineHeight = artBox.height / ART_ROW_COUNT;
    emitterX = artBox.left - heroBox.left + characterWidth * (RADAR.emitterColumn - 0.5);
    emitterY = artBox.top - heroBox.top + lineHeight * (RADAR.emitterLine - 0.5);
  }

  function measureHero() {
    heroWidth = heroElement.clientWidth;
    heroHeight = heroElement.clientHeight;
    radarBeams.setAttribute("viewBox", "0 0 " + heroWidth + " " + heroHeight);
    radarTargetLayer.setAttribute("viewBox", "0 0 " + heroWidth + " " + heroHeight);
    revealRadiusFull = clamp(
      Site.viewportWidth * CURSOR_REVEAL.radiusAsFractionOfWidth,
      CURSOR_REVEAL.minimumRadius,
      CURSOR_REVEAL.maximumRadius
    );
    placeRadar();
    if (!currentX && !currentY) {
      currentX = heroWidth * 0.6;
      currentY = heroHeight * 0.3;
    }
  }

  /* ---------- Cursor and touch input ---------- */

  heroElement.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") {
      return;
    }
    const heroBox = heroElement.getBoundingClientRect();
    targetX = event.clientX - heroBox.left;
    targetY = event.clientY - heroBox.top;
    mode = "track";
    revealRadiusGoal = revealRadiusFull;
  });

  heroElement.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") {
      mode = "scan";
      revealRadiusGoal = 0;
    }
  });

  heroElement.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "touch") {
      return;
    }
    const heroBox = heroElement.getBoundingClientRect();
    targetX = event.clientX - heroBox.left;
    targetY = event.clientY - heroBox.top;
    mode = "lock";
    revealRadiusGoal = revealRadiusFull;
  });

  // Phones: keep tracking the finger while it drags to scroll, not just on a tap.
  // Passive listeners never block scrolling.
  function followTouch(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return;
    }
    const heroBox = heroElement.getBoundingClientRect();
    targetX = clamp(touch.clientX - heroBox.left, 0, heroBox.width);
    targetY = clamp(touch.clientY - heroBox.top, 0, heroBox.height);
    mode = "lock";
    revealRadiusGoal = revealRadiusFull;
  }
  // When the finger lifts, the radar goes back to scanning on its own.
  function releaseTouch(event) {
    if (event.touches && event.touches.length > 0) {
      return;   // another finger is still down
    }
    mode = "scan";
    revealRadiusGoal = 0;
  }

  heroElement.addEventListener("touchstart", followTouch, { passive: true });
  heroElement.addEventListener("touchmove", followTouch, { passive: true });
  heroElement.addEventListener("touchend", releaseTouch, { passive: true });
  heroElement.addEventListener("touchcancel", releaseTouch, { passive: true });

  /* ---------- Per-frame update ---------- */

  // Moves a line segment along the beam: from distance `tailDistance` to `headDistance`, measured from the radar.
  function moveSegment(segment, tailDistance, headDistance, unitX, unitY) {
    segment.setAttribute("x1", (emitterX + unitX * tailDistance).toFixed(1));
    segment.setAttribute("y1", (emitterY + unitY * tailDistance).toFixed(1));
    segment.setAttribute("x2", (emitterX + unitX * headDistance).toFixed(1));
    segment.setAttribute("y2", (emitterY + unitY * headDistance).toFixed(1));
  }

  function updateHero(now) {
    if (heroElement.getBoundingClientRect().bottom < 0) {
      return; // scrolled away: skip the work
    }

    // While idle, the target wanders slowly across the top of the screen.
    if (mode === "scan" && motionEnabled) {
      const seconds = (now - scanStartTime) / 1000;
      targetX = heroWidth * (0.58 + 0.28 * Math.sin(seconds * 0.33));
      targetY = heroHeight * (0.26 + 0.14 * Math.sin(seconds * 0.51 + 1.1));
    }
    const isIdle = !motionEnabled && mode === "scan";
    radarBeams.classList.toggle("is-idle", isIdle);
    radarTargetLayer.classList.toggle("is-idle", isIdle);
    radarTargetLayer.classList.toggle("is-scanning", mode === "scan");

    // Ease the target and the reveal circle toward where they should be.
    const followSpeed = motionEnabled ? 0.18 : 1;
    currentX += (targetX - currentX) * followSpeed;
    currentY += (targetY - currentY) * followSpeed;
    revealRadius += (revealRadiusGoal - revealRadius) * (motionEnabled ? 0.14 : 1);
    heroReveal.style.clipPath = "circle(" + revealRadius.toFixed(1) + "px at " + currentX.toFixed(1) + "px " + currentY.toFixed(1) + "px)";

    // The beam runs from the radar's emitter to the target.
    const deltaX = currentX - emitterX;
    const deltaY = currentY - emitterY;
    const distance = Math.max(1, Math.sqrt(deltaX * deltaX + deltaY * deltaY));
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    beamTrack.setAttribute("x1", emitterX);
    beamTrack.setAttribute("y1", emitterY);
    beamTrack.setAttribute("x2", currentX.toFixed(1));
    beamTrack.setAttribute("y2", currentY.toFixed(1));
    target.setAttribute("transform", "translate(" + currentX.toFixed(1) + " " + currentY.toFixed(1) + ")");

    if (motionEnabled && !isIdle) {
      animatePulse(now, distance, unitX, unitY);
    } else {
      pulseOut.style.opacity = 0;
      pulseReturn.style.opacity = 0;
      targetPing.style.opacity = 0;
    }

    // The readout only needs to change a few times a second.
    frameCount++;
    if (frameCount % 6 === 0) {
      radarReadout.textContent = (mode === "scan" ? "SCAN    " : "TRACK 01") + " RANGE " + Math.round(distance) + " PIXELS";
      targetLabel.textContent = mode === "scan" ? "SCAN" : "TRK 01";
    }
  }

  // One pulse out, a ping at the target, one echo back, a short pause, repeat.
  function animatePulse(now, distance, unitX, unitY) {
    const travelTime = distance / RADAR.pulseSpeed;
    let elapsed = now - phaseStartTime;
    if (pulsePhase === "out" && elapsed >= travelTime) {
      pulsePhase = "back";
      phaseStartTime = now;
      elapsed = 0;
      echoArrivedTime = now;
    } else if (pulsePhase === "back" && elapsed >= travelTime) {
      pulsePhase = "gap";
      phaseStartTime = now;
      elapsed = 0;
    } else if (pulsePhase === "gap" && elapsed >= RADAR.echoPause) {
      pulsePhase = "out";
      phaseStartTime = now;
      elapsed = 0;
    }

    const travelled = Math.min(distance, elapsed * RADAR.pulseSpeed);
    if (pulsePhase === "out") {
      moveSegment(pulseOut, Math.max(0, travelled - RADAR.pulseLength), travelled, unitX, unitY);
      pulseOut.style.opacity = 1;
      pulseReturn.style.opacity = 0;
    } else if (pulsePhase === "back") {
      const headDistance = distance - travelled;
      moveSegment(pulseReturn, Math.min(distance, headDistance + RADAR.pulseLength), headDistance, unitX, unitY);
      pulseReturn.style.opacity = 0.9;
      pulseOut.style.opacity = 0;
    } else {
      pulseOut.style.opacity = 0;
      pulseReturn.style.opacity = 0;
    }

    const pingProgress = (now - echoArrivedTime) / RADAR.pingDuration;
    if (pingProgress >= 0 && pingProgress <= 1) {
      targetPing.setAttribute("r", (8 + 22 * pingProgress).toFixed(1));
      targetPing.style.opacity = (1 - pingProgress).toFixed(2);
    } else {
      targetPing.style.opacity = 0;
    }
  }

  Site.onMeasure(measureHero);
  Site.onFrame(updateHero);
})(window.Site);
