import { CommentsMap, keyFor } from "../hooks/useComments";
import { normalizePath } from "../utils/path";

function getLineNumbers(change: any) {
  // react-diff-view 3.3.x
  // - insert: { type: 'insert', lineNumber }
  // - delete: { type: 'delete', lineNumber }
  // - normal: { type: 'normal', oldLineNumber, newLineNumber }
  var type = change && change.type;
  var oldNum: number | undefined;
  var newNum: number | undefined;

  if (type === "insert") {
    newNum = change.lineNumber;
  } else if (type === "delete") {
    oldNum = change.lineNumber;
  } else {
    newNum = change.newLineNumber;
    oldNum = change.oldLineNumber;
  }
  return { type, oldNum, newNum };
}

export function CommentGutter({
  path,
  change,
  commentsByKey,
}: {
  path: string;
  change: any;
  commentsByKey: CommentsMap;
}) {
  const filePath = normalizePath(path);
  const info = getLineNumbers(change);

  // Primary guess
  var candidates: string[] = [];
  if (info.type === "insert" && info.newNum != null) {
    candidates.push(keyFor(filePath, "ADDED", info.newNum));
  } else if (info.type === "delete" && info.oldNum != null) {
    candidates.push(keyFor(filePath, "REMOVED", info.oldNum));
  } else {
    // normal row – try both sides
    if (info.newNum != null) candidates.push(keyFor(filePath, "CONTEXT", info.newNum));
    if (info.oldNum != null) candidates.push(keyFor(filePath, "CONTEXT", info.oldNum));
  }

  // Fallbacks (Bitbucket sometimes stores anchors as ADDED/REMOVED even on context)
  if (info.newNum != null) {
    candidates.push(keyFor(filePath, "ADDED", info.newNum));
    candidates.push(keyFor(filePath, "CONTEXT", info.newNum));
  }
  if (info.oldNum != null) {
    candidates.push(keyFor(filePath, "REMOVED", info.oldNum));
    candidates.push(keyFor(filePath, "CONTEXT", info.oldNum));
  }

  // Count
  var count = 0;
  for (var i = 0; i < candidates.length; i++) {
    var arr = commentsByKey[candidates[i]];
    if (arr && arr.length) count += arr.length;
  }

  return count ? (
    <span
      title={count + " comment(s)"}
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
