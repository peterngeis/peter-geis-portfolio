/*
 * video.js
 * Plays muted, looping clips (any <video data-autoplay>) while they're on screen and pauses them
 * when they scroll away. Visitors who prefer reduced motion keep the play controls instead,
 * and so does anyone whose browser blocks autoplay.
 */
(function (Site) {
  "use strict";

  const videos = Array.from(document.querySelectorAll("video[data-autoplay]"));
  if (!videos.length || !Site.motionEnabled || !("IntersectionObserver" in window)) {
    return;
  }

  videos.forEach((video) => {
    video.muted = true;
    video.removeAttribute("controls");

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const playPromise = video.play();
          if (playPromise && playPromise.catch) {
            playPromise.catch(() => { video.setAttribute("controls", ""); });
          }
        } else {
          video.pause();
        }
      });
    }, { threshold: 0.25 });
    observer.observe(video);
  });
})(window.Site);
