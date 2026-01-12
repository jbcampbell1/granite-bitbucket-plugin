const { normalizePath } = require("./path");

const cases = [
  { in: "t:/src/app/file.tsx", out: "src/app/file.tsx" },
  { in: "T:\\src\\app\\file.tsx", out: "src/app/file.tsx" },
  { in: "a/src/app/file.tsx", out: "src/app/file.tsx" },
  { in: "b/src/app/file.tsx", out: "src/app/file.tsx" },
  { in: "/src/app/file.tsx", out: "src/app/file.tsx" },
  { in: "src/app/file.tsx", out: "src/app/file.tsx" },
];

for (const c of cases) {
  const got = normalizePath(c.in);
  console.log(`${c.in} -> ${got} ${got === c.out ? "✅" : "❌ expected " + c.out}`);
}
