/*
 * drawer.js
 * The slide-in panel that opens from the "Off the clock" build cards.
 * Each card's data-drawer attribute names a <template> in index.html; its contents fill the drawer.
 */
(function () {
  "use strict";

  const root = document.documentElement;
  const drawer = document.getElementById("drawer");
  const drawerBody = document.getElementById("drawer-body");

  Array.from(document.querySelectorAll(".card")).forEach((card) => {
    card.addEventListener("click", () => {
      const template = document.getElementById(card.getAttribute("data-drawer"));
      drawerBody.replaceChildren(template.content.cloneNode(true));
      if (typeof drawer.showModal === "function") {
        drawer.showModal();
      } else {
        drawer.setAttribute("open", "");
      }
      root.classList.add("is-scroll-locked");   // stop the page behind from scrolling
      drawer.querySelector(".drawer-scroll-area").scrollTop = 0;
    });
  });

  document.getElementById("drawer-close").addEventListener("click", () => { drawer.close(); });
  drawer.addEventListener("close", () => { root.classList.remove("is-scroll-locked"); });

  // Clicking the dimmed backdrop closes it.
  drawer.addEventListener("click", (event) => {
    const drawerBox = drawer.getBoundingClientRect();
    const clickedOutside = event.clientX < drawerBox.left || event.clientX > drawerBox.right
      || event.clientY < drawerBox.top || event.clientY > drawerBox.bottom;
    if (clickedOutside) {
      drawer.close();
    }
  });
})();
