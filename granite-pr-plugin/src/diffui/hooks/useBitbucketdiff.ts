import { useEffect, useState } from "react";
import { parseDiff } from "react-diff-view";
import { Ctx, FileDiff } from "../types";

export function useBitbucketDiff(ctx: Ctx) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<FileDiff[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    const url =
      "/rest/api/1.0/projects/" +
      encodeURIComponent(ctx.project) +
      "/repos/" +
      encodeURIComponent(ctx.repo) +
      "/pull-requests/" +
      encodeURIComponent(ctx.pr) +
      "/diff?contextLines=3";

    fetch(url, { headers: { Accept: "text/plain" } })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then((patch) => {
        if (!cancelled) setFiles(parseDiff(patch) as any);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || "Failed to load diff");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ctx.project, ctx.repo, ctx.pr]);

  return { loading, err, files };
}
