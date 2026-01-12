/* eslint-disable */
const esbuild = require("esbuild");
const watch = process.argv.includes("--watch");

esbuild
  .build({
    entryPoints: {
      "static/review/review": "diffui/index.tsx",
      "static/js/main": "frontend/src/index.tsx",
      // If you keep a source vrsion of your bootstrap, build it too:
      // 'static/review/review-tab-bootstrap': 'webui/review/bootstrap.js'
    },
    outdir: "main/resources/",
    bundle: true,
    minify: true,
    sourcemap: true,
    target: ["es2015"], // ✅ ES5 output for Bitbucket WRM
    define: { "process.env.NODE_ENV": '"production"' },
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
      ".js": "jsx",
      ".jsx": "jsx",
      ".css": "css",
    },
  })
  .then(() => {
    if (!watch) console.log("Build complete");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

if (watch) {
  console.log("Watching…");
}
