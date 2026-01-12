/* Granite Review Tab bootstrap (ES5, stable) */
(function () {
  if (window.__graniteReviewTabBooted) return;
  window.__graniteReviewTabBooted = true;

  var TAB_ID = "granite-review-tab";
  var LI_ID = "granite-review-li";
  var PANE_ID = "granite-review-panel";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return (root || document).querySelectorAll(sel);
  }

  function parsePRFromUrl() {
    var m = location.pathname.match(/\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)/i);
    if (!m) return null;
    return { project: decodeURIComponent(m[1]), repo: decodeURIComponent(m[2]), pr: m[3] };
  }

  function getTabsMenu() {
    // Bitbucket PR tablist
    return $('.aui-tabs ul.tabs-menu[role="tablist"]');
  }

  function getPanesContainer() {
    // Find any existing PR pane and use its parent as the container
    var anyPane = $('.aui-tabs .tabs-pane[role="tabpanel"]');
    return anyPane ? anyPane.parentNode : null;
  }

  function ensurePane() {
    var container = getPanesContainer();
    if (!container) return null;
    var pane = document.getElementById(PANE_ID);
    if (!pane) {
      pane = document.createElement("div");
      pane.id = PANE_ID;
      pane.className = "tabs-pane"; // Bitbucket/AUI expects this
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", TAB_ID);
      pane.style.minHeight = "60vh";
      pane.style.display = "none"; // hidden until our tab is active
      container.appendChild(pane);
    }
    return pane;
  }

  function ensureTab() {
    var menu = getTabsMenu();
    if (!menu) return null;
    var existing = document.getElementById(TAB_ID);
    if (existing) return { li: document.getElementById(LI_ID), a: existing };

    var li = document.createElement("li");
    li.className = "menu-item";
    li.id = LI_ID;

    var a = document.createElement("a");
    a.id = TAB_ID;
    a.href = "#granite-review";
    a.setAttribute("role", "tab");
    a.setAttribute("aria-controls", PANE_ID);
    a.innerHTML = "<strong>Review</strong>";

    li.appendChild(a);
    // Put it at the far-right
    menu.appendChild(li);

    return { li: li, a: a };
  }

  // Remember previously-selected native tab+pane so we can restore them
  var prevActiveLi = null;
  var prevActivePane = null;
  var graniteActive = false;

  function activateGranite(li, a) {
    var pr = parsePRFromUrl();
    if (!pr) return;

    var pane = ensurePane();
    if (!pane) return;

    // Cache current native active elements once
    prevActiveLi = $(".aui-tabs ul.tabs-menu li.menu-item.active-tab");
    prevActivePane = $(".aui-tabs .tabs-pane.active-pane");

    // Visually deselect native li and hide its pane (without removing classes globally)
    if (prevActiveLi) prevActiveLi.classList.remove("active-tab");
    if (prevActivePane) {
      prevActivePane.setAttribute("data-granite-hidden", "1");
      prevActivePane.style.display = "none";
    }

    // Select our tab + pane
    li.classList.add("active-tab");
    a.setAttribute("aria-selected", "true");
    a.setAttribute("tabindex", "0");

    pane.classList.add("active-pane");
    pane.style.display = ""; // show

    graniteActive = true;

    try {
      if (window.GraniteReview && typeof window.GraniteReview.mount === "function") {
        window.GraniteReview.mount(pane, pr);
      } else {
        pane.innerHTML = '<div style="padding:16px">Loading Granite Review…</div>';
      }
    } catch (e) {
      // ensure we don’t leave the UI in a broken state
      pane.innerHTML =
        '<div style="padding:16px;color:#B21C1C;background:#FDE7E9;border-radius:8px;">' +
        "Failed to mount review: " +
        (e && e.message ? e.message : e) +
        "</div>";
    }

    // Keep deep-link consistent
    try {
      history.replaceState({}, "", location.pathname + location.search + "#granite-review");
    } catch (_) {}
  }

  function deactivateGranite() {
    if (!graniteActive) return;

    var li = document.getElementById(LI_ID);
    var a = document.getElementById(TAB_ID);
    var pane = document.getElementById(PANE_ID);

    if (li) li.classList.remove("active-tab");
    if (a) a.setAttribute("aria-selected", "false");

    if (pane) {
      pane.classList.remove("active-pane");
      pane.style.display = "none";
      try {
        if (window.GraniteReview && typeof window.GraniteReview.unmount === "function") {
          window.GraniteReview.unmount(pane);
        }
      } catch (_) {}
      pane.innerHTML = "";
    }

    // Restore the native tab/pane we hid
    if (prevActiveLi) prevActiveLi.classList.add("active-tab");
    if (prevActivePane) {
      prevActivePane.style.display = "";
      prevActivePane.removeAttribute("data-granite-hidden");
    }

    prevActiveLi = null;
    prevActivePane = null;
    graniteActive = false;
  }

  function bootOnce() {
    var created = ensureTab();
    if (!created) return;
    ensurePane();

    var li = created.li;
    var a = created.a;

    // Click selects our tab
    a.addEventListener("click", function (e) {
      e.preventDefault();
      activateGranite(li, a);
    });

    // Keyboard activation
    a.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateGranite(li, a);
      }
    });

    // If deep-linked, auto-activate
    if (location.hash === "#granite-review") {
      activateGranite(li, a);
    }

    // If user clicks a different AUI tab, deactivate ours **before** Bitbucket processes it
    var menu = getTabsMenu();
    if (menu) {
      menu.addEventListener(
        "click",
        function (e) {
          var link = e.target && e.target.closest && e.target.closest('a[role="tab"]');
          if (!link || link.id === TAB_ID) return;
          if (graniteActive) deactivateGranite();
        },
        true
      ); // capture
    }
  }

  // Initial run
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootOnce);
  } else {
    bootOnce();
  }

  // Re-run if Bitbucket swaps the PR DOM (SPA navigations)
  var mo = new MutationObserver(function () {
    if (!document.getElementById(TAB_ID) && getTabsMenu()) {
      bootOnce();
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
