// static/review/review.js
(function () {
  function mount(el, { project, repo, pr }) {
    el.innerHTML = `
      <div style="padding:16px">
        <h2 style="margin:0 0 12px">Granite Review</h2>
        <div>PR: <code>${project}/${repo}#${pr}</code></div>
        <p>Inline panel – diff and comments will render here.</p>
      </div>`;
    // TODO: later, fetch Bitbucket diff + comments and render with react-diff-view
  }
  function unmount(el) {
    if (el) el.innerHTML = "";
  }

  window.GraniteReview = window.GraniteReview || {};
  window.GraniteReview.mount = mount;
  window.GraniteReview.unmount = unmount;
})();
