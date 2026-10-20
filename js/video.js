/*
 * video.js
 * Plays muted, looping clips (any <video data-autoplay>) while they're on screen and pauses them
 * when they scroll away. Visitors who prefer reduced motion keep the play controls instead,
 * and so does anyone whose browser blocks autoplay.
 */
(function (S) {
  "use strict";
  var vids = Array.prototype.slice.call(document.querySelectorAll("video[data-autoplay]"));
  if (!vids.length || !S.motion || !("IntersectionObserver" in window)) {
    return;
  }

  vids.forEach(function (v) {
    v.muted = true;
    v.removeAttribute("controls");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var p = v.play();
          if (p && p.catch) {
            p.catch(function () { v.setAttribute("controls", ""); });
          }
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.25 });
    io.observe(v);
  });
})(window.Site);
