import { FileDiff } from "../types";

export function cleanName(p?: string) {
  return (p || "").replace(/^a\//, "").replace(/^b\//, "") || "file";
}

export function FileTree({ files, onJump }: { files: FileDiff[]; onJump: (idx: number) => void }) {
  return (
    <aside style={{ borderRight: "1px solid #eee", paddingRight: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Files ({files.length})</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {files.map((f, i) => (
          <li key={i}>
            <button
              onClick={() => onJump(i)}
              style={{
                border: "none",
                background: "transparent",
                padding: "4px 0",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {cleanName(f.newPath || f.oldPath)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
