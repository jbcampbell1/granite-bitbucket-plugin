import { useEffect, useRef, useState } from "react";
import { Ctx } from "../types";
import { normalizePath } from "../utils/path";

export type BbComment = {
  id: number;
  text: string;
  author?: { displayName?: string };
  anchor?: { path?: string; line?: number; lineType?: "ADDED" | "REMOVED" | "CONTEXT" };
};
export type CommentsMap = { [key: string]: BbComment[] };

export function keyFor(path: string, lineType: string, line: number) {
  return [path, lineType, String(line)].join("|");
}

export function useComments(ctx: Ctx) {
  console.log("IN USE COMMENTS");
  const [byKey, setByKey] = useState<CommentsMap>({});
  const ctxRef = useRef<Ctx | null>(null);

  useEffect(() => {
    // Only refetch if PR context changed
    console.log("IN USE COMMENT USE EFFECT");
    if (
      ctxRef.current &&
      ctxRef.current.project === ctx.project &&
      ctxRef.current.repo === ctx.repo &&
      ctxRef.current.pr === ctx.pr
    ) {
      return; // ctx didn't change → keep old comments
    }
    ctxRef.current = ctx;

    let cancelled = false;
    const url =
      "/rest/api/1.0/projects/" +
      encodeURIComponent(ctx.project) +
      "/repos/" +
      encodeURIComponent(ctx.repo) +
      "/pull-requests/" +
      encodeURIComponent(ctx.pr) +
      "/activities?limit=1000";

    console.log("Fetching PR comments from", url);

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const map: CommentsMap = {};
        (json.values || []).forEach((act: any) => {
          const c = act.comment;
          const a = c && c.anchor;
          if (!a || !a.path || !a.line || !a.lineType) return;

          const path = normalizePath(a.path);
          const k = keyFor(path, a.lineType, a.line);
          (map[k] = map[k] || []).push({
            id: c.id,
            text: c.text,
            author: c.author,
            anchor: a,
          });
        });
        setByKey(map);
      })
      .catch((e) => console.error("Failed to fetch comments", e));

    return () => {
      cancelled = true;
    };
  }, [ctx.project, ctx.repo, ctx.pr]);
  console.log("EXITING USE COMMENTS");

  return byKey;
}
