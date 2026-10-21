/*
 * experience.js
 * The experience timeline: the big year rolls like an odometer and the progress rail fills
 * as each timeline entry passes the middle of the screen.
 */
(function (Site) {
  "use strict";

  const PHONE_MAXIMUM_WIDTH = 760;   // matches the phone breakpoint in css/responsive.css
  const MAXIMUM_YEAR_FONT_SIZE = 200;

  const timelineEntries = Array.from(document.querySelectorAll(".timeline-entry"));
  const digitReels = Array.from(document.querySelectorAll(".reel"));
  const railSteps = Array.from(document.querySelectorAll(".rail li"));
  const dialTitle = document.getElementById("dial-title");
  const odometer = document.querySelector(".odometer");
  const dial = document.querySelector(".dial");

  // Each digit of the year is a column of 0–9 that slides to the right digit.
  digitReels.forEach((reel) => {
    for (let digit = 0; digit < 10; digit++) {
      const digitElement = document.createElement("span");
      digitElement.textContent = String(digit);
      reel.appendChild(digitElement);
    }
  });

  let currentEntryIndex = -1;

  function showEntry(entryIndex) {
    if (entryIndex === currentEntryIndex) {
      return;
    }
    currentEntryIndex = entryIndex;

    const year = timelineEntries[entryIndex].getAttribute("data-year");   // from data-year on each .timeline-entry in index.html
    digitReels.forEach((reel, position) => {
      reel.style.transform = "translateY(-" + year.charAt(position) + "em)";
    });
    railSteps.forEach((step, stepIndex) => {
      step.classList.toggle("is-complete", stepIndex <= entryIndex);
    });
    timelineEntries.forEach((entry, index) => {
      entry.classList.toggle("is-current", index === entryIndex);
    });
    dialTitle.textContent = timelineEntries[entryIndex].querySelector("h3").textContent;
  }

  // The current entry is the last one whose top has passed the middle of the screen.
  function updateExperienceDial() {
    const middleOfScreen = Site.viewportHeight * 0.5;
    let currentIndex = 0;
    for (let index = 0; index < timelineEntries.length; index++) {
      if (timelineEntries[index].getBoundingClientRect().top < middleOfScreen) {
        currentIndex = index;
      }
    }
    showEntry(currentIndex);
  }

  // Sizes the big year to fit its column on desktop.
  function fitOdometer() {
    odometer.style.fontSize = "";
    if (Site.viewportWidth <= PHONE_MAXIMUM_WIDTH) {
      return;
    }
    odometer.style.fontSize = "100px";
    const widthAt100px = odometer.scrollWidth;
    const availableWidth = dial.clientWidth;
    odometer.style.fontSize = Math.min(MAXIMUM_YEAR_FONT_SIZE, 100 * availableWidth / widthAt100px * 0.97) + "px";
  }

  Site.onMeasure(fitOdometer);
  Site.onFrame(updateExperienceDial);
})(window.Site);
