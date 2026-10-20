/*
 * drawer.js
 * The slide-in panel that opens from the "Off the clock" build cards.
 * Each card's data-d attribute names a <template> in index.html; its contents fill the drawer.
 */
(function () {
  "use strict";
  var doc = document.documentElement;
  var dlg = document.getElementById("drawer"), body = document.getElementById("dr-body");

  Array.prototype.slice.call(document.querySelectorAll(".card")).forEach(function (card) {
    card.addEventListener("click", function () {
      var tpl = document.getElementById(card.getAttribute("data-d"));
      body.replaceChildren(tpl.content.cloneNode(true));
      if (typeof dlg.showModal === "function") {
        dlg.showModal();
      } else {
        dlg.setAttribute("open", "");
      }
      doc.classList.add("locked");   // stop the page behind from scrolling
      dlg.querySelector(".dr-in").scrollTop = 0;
    });
  });

  document.getElementById("dr-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("close", function () { doc.classList.remove("locked"); });
  // Clicking the dimmed backdrop closes it.
  dlg.addEventListener("click", function (e) {
    var r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      dlg.close();
    }
  });
})();
