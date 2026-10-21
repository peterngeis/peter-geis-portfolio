/*
 * nav.js
 * Gives the top bar a solid background on phones while the experience timeline is on screen.
 *
 * Elsewhere the bar inverts the colors underneath it. Over the timeline, whose text scrolls right
 * under the bar, a solid background reads better. css/responsive.css styles .is-solid on phones only.
 */
(function (Site) {
  "use strict";

  const PHONE_MAXIMUM_WIDTH = 760;   // matches the phone breakpoint in css/responsive.css

  const navElement = document.querySelector(".nav");
  const solidZones = Array.from(document.querySelectorAll(".experience"));
  let navHeight = 56;
  let wasSolid = false;

  function measureNav() {
    navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-height")) || 56;
  }

  function updateNavBackground() {
    let isSolid = false;
    if (Site.viewportWidth <= PHONE_MAXIMUM_WIDTH) {
      for (const zone of solidZones) {
        const zoneBox = zone.getBoundingClientRect();
        if (zoneBox.top <= navHeight && zoneBox.bottom > navHeight) {
          isSolid = true;
        }
      }
    }
    if (isSolid !== wasSolid) {
      navElement.classList.toggle("is-solid", isSolid);
      wasSolid = isSolid;
    }
  }

  Site.onMeasure(measureNav);
  Site.onFrame(updateNavBackground);
})(window.Site);
