import { Diff, Hunk } from "react-diff-view";
import { normalizePath } from "../utils/path";

// change → { type: 'insert' | 'delete' | 'normal', oldLineNumber?, newLineNumber?, ... }
function CommentGutter({
  path,
  change,
  commentsByKey,
}: {
  path: string;
  change: any;
  commentsByKey: Record<string, any[]>;
}) {
  const lt = change.type === "insert" ? "ADDED" : change.type === "delete" ? "REMOVED" : "CONTEXT";

  const line =
    change.type === "insert"
      ? change.newLineNumber
      : change.type === "delete"
      ? change.oldLineNumber
      : change.newLineNumber || change.oldLineNumber;

  const key = `${path}|${lt}|${line || 0}`;
  const count = (commentsByKey[key] || []).length;

  return count ? (
    <span
      title={`${count} comment(s)`}
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        lineHeight: "16px",
        borderRadius: 8,
        background: "#e9f2ff",
        color: "#1c5fd4",
        fontSize: 11,
        textAlign: "center",
      }}
    >
      {count}
    </span>
  ) : (
    <span />
  );
}

export function DiffViewer({ file, idx, view, commentsByKey }: any) {
  const rawPath = file.newPath || file.oldPath || "";
  const displayPath = normalizePath(rawPath); // for title only

  return (
    <div id={`file-${idx}`} style={{ marginBottom: 24 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{displayPath}</div>

      <Diff
        viewType={view} // 'unified' | 'split'
        diffType={file.type}
        hunks={file.hunks}
        // ⬇️ render a cell in the gutter for every change line
        renderGutter={(change) => <CommentGutter path={rawPath} change={change} commentsByKey={commentsByKey} />}
      >
        {(hunks) => hunks.map((h: any) => <Hunk key={h.content} hunk={h} />)}
      </Diff>
    </div>
  );
}
