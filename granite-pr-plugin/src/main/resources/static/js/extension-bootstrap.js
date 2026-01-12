// static/js/extension-bootstrap.js (ES5)
console.log("Granite PR bootstrap v43 — file loaded");

(function () {
  if (typeof require !== "function") {
    console.error("Granite PR: require() missing");
    return;
  }

  // ---- Hide native build summary link
  (function hideBuildSummaryInit() {
    function onPRPage() {
      return /\/projects\/[^/]+\/repos\/[^/]+\/pull-requests\/\d+(?:\/overview)?$/i.test(location.pathname);
    }
    if (!onPRPage()) return;

    function injectStyle(css) {
      if (document.getElementById("granite-hide-build-style")) return;
      var s = document.createElement("style");
      s.id = "granite-hide-build-style";
      s.textContent = css;
      document.head.appendChild(s);
    }

    injectStyle(`
    [data-testid="pull-request-builds-summary"] {
      display: none !important;
    }
  `);

    function hideBuildLink() {
      if (!onPRPage()) return;
      var el = document.querySelector('[data-testid="pull-request-builds-summary"]');
      if (el) el.style.setProperty("display", "none", "important");
    }

    hideBuildLink();

    var mo = new MutationObserver(hideBuildLink);
    mo.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", hideBuildLink);
    window.addEventListener("hashchange", hideBuildLink);
  })();

  // -------- helpers (ES5)
  function parsePRFromUrl() {
    var m = location.pathname.match(/\/projects\/([^/]+)\/repos\/([^/]+)\/pull-requests\/(\d+)/i);
    return m ? { project: decodeURIComponent(m[1]), repo: decodeURIComponent(m[2]), pr: m[3] } : null;
  }
  function fetchLatestSha(prCtx, cb, onErr) {
    var url =
      "/rest/api/latest/projects/" +
      encodeURIComponent(prCtx.project) +
      "/repos/" +
      encodeURIComponent(prCtx.repo) +
      "/pull-requests/" +
      encodeURIComponent(prCtx.pr) +
      "/commits?limit=1";
    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        var sha = j && j.values && j.values[0] && j.values[0].id;
        if (sha) cb(sha);
        else onErr && onErr(new Error("no sha"));
      })
      .catch(onErr || function () {});
  }
  function fetchBuildState(sha, cb, onErr) {
    fetch("/rest/build-status/1.0/commits/" + encodeURIComponent(sha))
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        var values = (j && j.values) || [];
        values.sort(function (a, b) {
          return (b.dateAdded || 0) - (a.dateAdded || 0);
        });
        cb((values[0] && values[0].state) || "INPROGRESS");
      })
      .catch(onErr || function () {});
  }
  function iconFor(state) {
    // Use Atlassian icon ids; change to emoji if you prefer
    if (state === "SUCCESSFUL") return "check-circle";
    if (state === "FAILED" || state === "CANCELLED") return "error";
    if (state === "INPROGRESS") return "time";
    return "app-access";
  }
  function pillStyleFor(state) {
    if (state === "SUCCESSFUL")
      return "margin-left:8px;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;vertical-align:middle;background:#E6F4EA;color:#1E7E34;";
    if (state === "FAILED" || state === "CANCELLED")
      return "margin-left:8px;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;vertical-align:middle;background:#FDE7E9;color:#B21C1C;";
    return "margin-left:8px;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;vertical-align:middle;background:#FFF7E0;color:#925B00;";
  }

  function findCSEButton() {
    // Prefer the wrapper rendered by the clientside extension
    var host = document.querySelector('[data-extension-key="com.granite.pr-plugin:granite-pr-button"]');
    if (host) {
      var btn = host.querySelector("button, a");
      if (btn) return btn;
    }
    // Text fallback
    var nodes = document.querySelectorAll("button, .aui-button, a");
    for (var i = 0; i < nodes.length; i++) {
      var t = nodes[i].textContent || "";
      if (t.indexOf("Granite AI Review") > -1) return nodes[i];
    }
    return null;
  }

  function ensureStatusPill(nextToEl) {
    var id = "granite-inline-status-pill";
    var existing = document.getElementById(id);
    if (existing) return existing;
    var pill = document.createElement("span");
    pill.id = id;
    pill.style.cssText = pillStyleFor("INPROGRESS");
    pill.textContent = "Checking…";
    if (nextToEl && nextToEl.parentNode) {
      nextToEl.parentNode.insertBefore(pill, nextToEl.nextSibling);
    }
    return pill;
  }

  function updateOverviewPillForCurrentPR(pillEl) {
    var pr = parsePRFromUrl();
    if (!pr) return;
    fetchLatestSha(pr, function (sha) {
      fetchBuildState(sha, function (state) {
        pillEl.style.cssText = pillStyleFor(state); // reset each time
        // If you prefer emoji text, do: pillEl.textContent = (state === 'SUCCESSFUL' ? '✅' : state === 'FAILED' ? '❌' : '⏳') + ' ' + state;
        pillEl.textContent = state;
      });
    });
  }

  require(["@atlassian/clientside-extensions-registry"], function (registry) {
    var LOCATION = "bitbucket.ui.pullrequest.overview.summary";
    var KEY = "com.granite.pr-plugin:granite-pr-button";

    // Register the button (unchanged)
    registry.registerExtension(
      KEY,
      function (_api, context) {
        return {
          type: "button",
          label: "Granite AI Review",
          iconBefore: "app-access",
          onAction: function () {
            try {
              var el = document.getElementById("granite-inline-modal");
              if (!el) {
                el = document.createElement("div");
                el.id = "granite-inline-modal";
                el.style.cssText =
                  "position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:9999;";
                el.innerHTML =
                  '<div style="background:#fff;min-width:560px;max-width:85vw;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);">' +
                  '<div style="padding:12px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">' +
                  "<strong>Granite AI Review</strong>" +
                  '<button id="granite-close" style="border:none;background:transparent;font-size:20px;line-height:1;cursor:pointer;">×</button>' +
                  "</div>" +
                  '<div id="granite-content" style="padding:0;min-height:320px;"></div>' +
                  "</div>";
                document.body.appendChild(el);
                el.querySelector("#granite-close").onclick = function () {
                  var container = document.getElementById("granite-content");
                  try {
                    if (container && window.GranitePR && window.GranitePR.unmount) window.GranitePR.unmount(container);
                  } catch (e) {}
                  el.remove();
                };
              }
              var container = document.getElementById("granite-content");
              if (container && window.GranitePR && window.GranitePR.mount) {
                var pr = (context && context.pullRequest) || null;
                window.GranitePR.mount(container, { pr: pr });
              } else if (container) {
                container.innerHTML = '<div style="padding:16px">Hello World 👋</div>';
              }
            } catch (e) {
              console.error("Granite PR: onAction error", e);
            }
          },
        };
      },
      { key: KEY, location: LOCATION, label: "Granite AI Review", weight: 1 }
    );

    // Try to update the extension icon if supported
    if (typeof registry.updateExtension === "function") {
      var ctxPR = parsePRFromUrl();
      if (ctxPR) {
        fetchLatestSha(ctxPR, function (sha) {
          fetchBuildState(sha, function (state) {
            try {
              registry.updateExtension(KEY, { iconBefore: iconFor(state) });
            } catch (e) {}
          });
        });
      }
    }

    // Always add/update the status pill next to the button (works on all versions)
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var btn = findCSEButton();
      if (btn) {
        clearInterval(iv);
        var pill = ensureStatusPill(btn);
        var update = function () {
          updateOverviewPillForCurrentPR(pill);
        };
        update();
        var poll = setInterval(update, 10000);
        // stop polling on SPA route change
        window.addEventListener(
          "popstate",
          function () {
            clearInterval(poll);
          },
          { once: true }
        );
        window.addEventListener(
          "hashchange",
          function () {
            clearInterval(poll);
          },
          { once: true }
        );
      }
      if (tries > 50) clearInterval(iv);
    }, 300);

    // Re-apply after SPA DOM swaps
    var mo = new MutationObserver(function () {
      if (!document.getElementById("granite-inline-status-pill") && findCSEButton()) {
        var btn = findCSEButton();
        if (btn) {
          var pill = ensureStatusPill(btn);
          updateOverviewPillForCurrentPR(pill);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }, function (err) {
    console.error("Granite PR: require error", err);
  });
})();
