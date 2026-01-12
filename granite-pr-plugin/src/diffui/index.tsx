import { useEffect, useMemo, useState } from "react";
import { createRoot, Root } from "react-dom/client";

/* =========================
   Types
   ========================= */
export type Ctx = { project: string; repo: string; pr: string };

type BuildState = "INPROGRESS" | "SUCCESSFUL" | "FAILED" | "CANCELLED";
type BuildStatus = {
  state: BuildState;
  key: string;
  name?: string;
  url?: string;
  description?: string;
  dateAdded?: number;
};

type ReviewRun = {
  sha: string;
  when: number;
  state: BuildState | "UNKNOWN";
  status?: BuildStatus;
};

type ReviewComment = {
  id: number;
  text: string;
  path?: string;
  line?: number;
  lineType?: "ADDED" | "REMOVED" | "CONTEXT";
  author?: string;
  state?: "OPEN" | "RESOLVED";
  threadResolved?: boolean;
  deepLink?: string;
};

type Severity = "BLOCKER" | "CRITICAL" | "MAJOR" | "MINOR" | "INFO";
type Issue = {
  id: number;
  category: string; // e.g., Correctness, Security, Code Quality
  severity: Severity; // normalized enum
  file: string;
  lineText: string; // e.g., "45–60" or "19" or "-"
  summary: string;
  addressed: boolean;
  deepLink?: string;
};

/* =========================
   Small helpers
   ========================= */
function formatWhen(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}
async function fetchJson(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
  return r.json();
}

/* =========================
   Bitbucket fetchers
   ========================= */
async function getHeadSha(ctx: Ctx): Promise<string | null> {
  const url =
    "/rest/api/latest/projects/" +
    encodeURIComponent(ctx.project) +
    "/repos/" +
    encodeURIComponent(ctx.repo) +
    "/pull-requests/" +
    encodeURIComponent(ctx.pr) +
    "/commits?limit=1";
  const json = await fetchJson(url);
  const vals = (json && json.values) || [];
  const sha = vals.length ? vals[0] && vals[0].id : null;
  return sha || null;
}

async function getBuildStatuses(sha: string): Promise<BuildStatus[]> {
  const json = await fetchJson("/rest/build-status/1.0/commits/" + encodeURIComponent(sha));
  const vals: BuildStatus[] = (json && json.values) || [];
  vals.sort((a, b) => (b.dateAdded || 0) - (a.dateAdded || 0));
  return vals;
}

async function getActivities(ctx: Ctx): Promise<any[]> {
  const url =
    "/rest/api/1.0/projects/" +
    encodeURIComponent(ctx.project) +
    "/repos/" +
    encodeURIComponent(ctx.repo) +
    "/pull-requests/" +
    encodeURIComponent(ctx.pr) +
    "/activities?limit=1000";
  const json = await fetchJson(url);
  return (json && json.values) || [];
}

function isAiStatus(s: BuildStatus) {
  const k = (s.key || "").toLowerCase();
  const n = (s.name || "").toLowerCase();
  return k.includes("granite") || n.includes("ai review") || n.includes("granite");
}

/* Extract anchor + hashes from an activity in a DC-friendly way */
function getAnchorHashes(act: any) {
  const c = act && act.comment;
  const a = (c && c.anchor) || act.commentAnchor || act.anchor || null;

  let fromHash = (a && (a.fromHash || a.srcHash || a.hash || a.commitId || a.commit)) || null;
  let toHash = (a && (a.toHash || a.dstHash)) || null;

  if (!fromHash || !toHash) {
    const props = act && act.diff && act.diff.properties;
    if (props) {
      if (!fromHash) fromHash = props.fromHash || null;
      if (!toHash) toHash = props.toHash || null;
    }
  }
  return { fromHash, toHash, anchor: a };
}

/* =========================
   Parse helpers (comment -> Issue)
   ========================= */

// Normalize "Major", "major", emoji variants, etc.
function normalizeSeverity(s?: string): Severity {
  if (!s) return "INFO";
  const t = s.trim().toUpperCase();
  if (t.startsWith("BLOCK")) return "BLOCKER";
  if (t.startsWith("CRIT")) return "CRITICAL";
  if (t.startsWith("MAJ")) return "MAJOR";
  if (t.startsWith("MIN")) return "MINOR";
  return "INFO";
}

function stripMdInline(s: string) {
  console.log(`Inside strip MdInLine and trying to strip string ${s}`);
  return s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    .replace(/(\*{1,3}|_{1,3}|~{2})(.*?)\1/g, "$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*(-{3,}|_{3,}|\*{3,})\s*$/gm, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\\([\\`*_{}\[\]()#+\-!.>])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function decodeHtmlEntities(s: string) {
  console.log(`inside decodeHTMLEntities function with string ${s}`);
  if (typeof document === "undefined") return s;
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.textContent || el.innerText || "";
}

function toPlain(s: string) {
  return decodeHtmlEntities(stripMdInline(s));
}

// pull "**✅ Correctness · 🟨 Major**" -> {category, severity}
function parseHeaderCategoryAndSeverity(text: string): { category: string; severity: Severity } {
  // 1) Bold header line with optional emoji
  const boldHeader =
    text.match(
      /\*\*[^*]*?\b([A-Za-z][A-Za-z ]{1,40}?)\b\s*[•·]\s*[^A-Za-z]*\b(Blocker|Critical|Major|Minor|Info)\b[^*]*\*\*/i
    ) || text.match(/\b([A-Za-z][A-Za-z ]{1,40}?)\b\s*[•·]\s*[^A-Za-z]*\b(Blocker|Critical|Major|Minor|Info)\b/i);
  if (boldHeader) {
    return {
      category: boldHeader[1].trim(),
      severity: normalizeSeverity(boldHeader[2]),
    };
  }
  // 2) Fallbacks (plain mention)
  const sevOnly = text.match(/\b(Blocker|Critical|Major|Minor|Info)\b/i);
  return { category: "General", severity: normalizeSeverity(sevOnly ? sevOnly[1] : "Info") };
}

// Lines: "Line 19:" or "Lines 45–60:" or "Lines 45-60:"
function parseLineText(text: string, fallback?: number): string {
  const m =
    text.match(/^\s*(?:\*\*)?\s*Lines?\s*([0-9]+)\s*[-–—]\s*([0-9]+)\s*:/im) ||
    text.match(/^\s*(?:\*\*)?\s*Line\s*([0-9]+)\s*:/im);
  if (m) {
    if (m.length >= 3 && m[2]) return `${m[1]}–${m[2]}`;
    return String(m[1]);
  }
  return typeof fallback === "number" ? String(fallback) : "-";
}

// Summary: first blockquote OR text trailing the "Line(s):" header.
// assumes you have toPlain(...) from earlier (stripMdInline + decodeHtmlEntities)
function parseSummary(text: string): string {
  // 1) Prefer a blockquote line
  const quote = text.match(/^\s*>\s*(.+)$/m);

  // 2) Or text after "Line/Lines <n[:|-m]>:"
  const afterLine = text.match(/^\s*(?:\*\*)?\s*Lines?\s*\d+(?:\s*[-–—]\s*\d+)?\s*:\s*(.+)$/im);

  // 3) Otherwise first meaningful non-header/non-fence line
  const fallback = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith("```") && !s.startsWith("####"));

  const chosen = (quote && quote[1]) || (afterLine && afterLine[1]) || fallback || "See comment";

  console.log(`checking what we send to the toPlain parser ` + JSON.stringify(chosen));

  // Strip markdown/HTML once here
  return toPlain(chosen);
}

function toIssue(c: ReviewComment): Issue {
  const { category, severity } = parseHeaderCategoryAndSeverity(c.text || "");
  const lineText = parseLineText(c.text || "", typeof c.line === "number" ? c.line : undefined);
  const summary = parseSummary(c.text || "");
  return {
    id: c.id,
    category,
    severity,
    file: c.path || "(no file)",
    lineText,
    summary,
    addressed: !!(c.threadResolved || c.state === "RESOLVED"),
    deepLink: c.deepLink,
  };
}

/* =========================
   Data hooks
   ========================= */

function useHeadReview(ctx: Ctx) {
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);

    (async () => {
      try {
        const headSha = await getHeadSha(ctx);
        if (!headSha) {
          if (!cancelled) {
            setRun(null);
            setLoading(false);
          }
          return;
        }

        const statuses = await getBuildStatuses(headSha);
        const ai = statuses.find(isAiStatus);
        const latest = statuses[0];

        const state: ReviewRun["state"] = ai ? ai.state : (latest && latest.state) || "UNKNOWN";
        const when = (ai && ai.dateAdded) || (latest && latest.dateAdded) || Date.now();

        if (!cancelled) {
          setRun({ sha: headSha, when, state, status: ai || latest });
        }
      } catch (e: any) {
        if (!cancelled) setErr((e && e.message) || "Failed to load review status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctx.project, ctx.repo, ctx.pr]);

  return { loading, err, run };
}

/* Load Granite/bot comments for the whole PR (no SHA filter) */
async function loadIssuesForSha(ctx: Ctx, _sha: string): Promise<Issue[]> {
  const acts = await getActivities(ctx);

  // last-writer-wins per comment id
  const byId = new Map<number, Issue>();

  for (let i = 0; i < acts.length; i++) {
    const a = acts[i];
    if (!a || a.action !== "COMMENTED") continue;

    const c = a.comment;
    if (!c) continue;

    const authorName = (c.author && (c.author.displayName || c.author.name)) || "";
    const lower = authorName.toLowerCase();
    const isBot = lower.includes("access token user") || lower.includes("granite") || lower.includes("bot");
    if (!isBot) continue;

    const hashes = getAnchorHashes(a);

    const rc: ReviewComment = {
      id: c.id,
      text: c.text || "",
      path: hashes.anchor && hashes.anchor.path,
      line: hashes.anchor && hashes.anchor.line,
      lineType: hashes.anchor && hashes.anchor.lineType,
      author: authorName || "Bot",
      state: c.state || "OPEN",
      threadResolved: !!c.threadResolved,
      deepLink: location.pathname.replace(/#.*$/, "") + "#comment-" + String(c.id),
    };

    byId.set(c.id, toIssue(rc));
  }

  const out = Array.from(byId.values());
  out.sort((a, b) => b.id - a.id); // newest first
  return out;
}

/* =========================
   UI helpers / styling
   ========================= */

const SEVERITY_ORDER: Record<Severity, number> = {
  BLOCKER: 0,
  CRITICAL: 1,
  MAJOR: 2,
  MINOR: 3,
  INFO: 4,
};

function pillStyle(bg: string, fg: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    background: bg,
    color: fg,
  };
}

// severity -> colors
function severityPill(sev: Severity) {
  switch (sev) {
    case "BLOCKER":
      return pillStyle("#FCE8E6", "#B71C1C");
    case "CRITICAL":
      return pillStyle("#FDE7E9", "#B21C1C");
    case "MAJOR":
      return pillStyle("#FFF7E0", "#8B5A00");
    case "MINOR":
      return pillStyle("#E8EEFF", "#1F46A3");
    default:
      return pillStyle("#F3F4F6", "#111827");
  }
}

// category -> a soft neutral chip
function categoryPill() {
  return pillStyle("#EEEAFB", "#4B2BB6"); // purple-ish
}

/* =========================
   Summary Table
   ========================= */

function SummaryTable(props: {
  issues: Issue[];
  hideAddressed: boolean;
  setHideAddressed: (b: boolean) => void;
  onRefresh: () => void;
  whenText: string;
}) {
  const { issues, hideAddressed } = props;

  const visible = useMemo(
    () =>
      issues
        .filter((i) => (hideAddressed ? !i.addressed : true))
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]),
    [issues, hideAddressed]
  );

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { BLOCKER: 0, CRITICAL: 0, MAJOR: 0, MINOR: 0, INFO: 0 };
    for (const i of issues) c[i.severity]++;
    return c;
  }, [issues]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Pull Request Summary</h2>
        <div style={{ opacity: 0.7, fontSize: 12 }}>as of {props.whenText}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <label style={{ fontSize: 12 }}>
            <input
              type="checkbox"
              checked={hideAddressed}
              onChange={(e) => props.setHideAddressed(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Hide addressed
          </label>
          <button onClick={props.onRefresh} style={{ fontSize: 12 }}>
            Refresh
          </button>
        </div>
      </div>

      {/* little capsule counts */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {(["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as Severity[]).map((sev) => (
          <span key={sev} style={{ ...severityPill(sev) }}>
            {sev.charAt(0) + sev.slice(1).toLowerCase()} {counts[sev]}
          </span>
        ))}
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr 110px 1.8fr 80px",
            gap: 0,
            background: "#F9FAFB",
            fontWeight: 700,
            padding: "10px 12px",
          }}
        >
          <div>Severity</div>
          <div>File</div>
          <div>Line</div>
          <div>Feedback</div>
          <div>Status</div>
        </div>

        {visible.length === 0 && <div style={{ padding: 12, opacity: 0.7 }}>No items to display.</div>}

        {visible.map((i, idx) => (
          <div
            key={i.id}
            style={{
              display: "grid",
              gridTemplateColumns: "240px 1fr 110px 1.8fr 80px",
              padding: "10px 12px",
              borderTop: "1px solid #eee",
              background: idx % 2 ? "#fff" : "#FBFDFF",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={categoryPill()}>{i.category}</span>
              <span style={severityPill(i.severity)}>{i.severity.charAt(0) + i.severity.slice(1).toLowerCase()}</span>
            </div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <code title={i.file}>{i.file}</code>
            </div>
            <div>{i.lineText}</div>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {toPlain(i.summary)}{" "}
              {/* {i.deepLink ? (
                <a
                  href={i.deepLink}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    spaNavigate(String(i.deepLink));
                  }}
                  style={{ marginLeft: 6 }}
                >
                  open
                </a>
              ) : null} */}
            </div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{i.addressed ? "🟢" : "🟡"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Bitbucket SPA navigate helper (same as before) */
function spaNavigate(url: string) {
  const amdRequire = (window as any).require || (globalThis as any).require;
  if (typeof amdRequire === "function") {
    amdRequire(["bitbucket/internal/router"], (router: any) => {
      const nav = router?.navigate || router?.push;
      if (typeof nav === "function") nav.call(router, url);
      else window.location.assign(url);
    });
  } else {
    window.location.assign(url);
  }
}

/* =========================
   App
   ========================= */

function App(ctx: Ctx) {
  const { loading, err, run } = useHeadReview(ctx);
  const STORAGE_VERSION = 3; // bump to bust any old cache formats
  const STORAGE_KEY = "granite:review:" + ctx.project + "/" + ctx.repo + "#" + ctx.pr;

  type PersistShape = {
    hideAddressed?: boolean;
    issuesBySha?: { [sha: string]: Issue[] };
  };

  function loadPersist(): PersistShape {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  const persisted = loadPersist();

  const initialHideAddressed = typeof persisted.hideAddressed === "boolean" ? persisted.hideAddressed : false;

  const [hideAddressed, setHideAddressed] = useState<boolean>(initialHideAddressed);
  const [issuesCache, setIssuesCache] = useState<Map<string, Issue[]>>(
    new Map(Object.entries(persisted.issuesBySha || {}))
  );
  const [loadingIssues, setLoadingIssues] = useState(false);

  useEffect(() => {
    const obj: PersistShape = {
      hideAddressed,
      issuesBySha: Object.fromEntries(issuesCache.entries()),
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {}
  }, [hideAddressed, issuesCache, STORAGE_KEY]);

  async function refresh(sha: string) {
    setLoadingIssues(true);
    try {
      const list = await loadIssuesForSha(ctx, sha);
      setIssuesCache((m) => {
        const next = new Map(m);
        next.set(sha, list);
        return next;
      });
    } finally {
      setLoadingIssues(false);
    }
  }

  useEffect(() => {
    if (!run) return;
    if (!issuesCache.has(run.sha)) {
      refresh(run.sha);
    }
  }, [run?.sha]); // eslint-disable-line react-hooks/exhaustive-deps

  const issues = run ? issuesCache.get(run.sha) || [] : [];

  return (
    <div style={{ padding: 16 }}>
      {loading && <div>Loading…</div>}
      {err && <div style={{ color: "#B21C1C", background: "#FDE7E9", padding: 8, borderRadius: 6 }}>{err}</div>}
      {!loading && !err && !run && <div style={{ opacity: 0.8 }}>No review run found for the current commit.</div>}

      {!loading && !err && run && (
        <>
          {loadingIssues && <div style={{ opacity: 0.7, marginBottom: 10 }}>Loading comments…</div>}
          <SummaryTable
            issues={issues}
            hideAddressed={hideAddressed}
            setHideAddressed={setHideAddressed}
            onRefresh={() => refresh(run.sha)}
            whenText={formatWhen(run.when)}
          />
        </>
      )}
    </div>
  );
}

/* =========================
   React 18 mount API
   ========================= */

const roots = new Map<Element, Root>();

function mount(el: Element, ctx: Ctx) {
  let root = roots.get(el);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }
  root.render(<App {...ctx} />);
}

function unmount(el: Element) {
  const root = roots.get(el);
  if (root) {
    root.unmount();
    roots.delete(el);
  }
}

// Expose for the bootstrap
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).GraniteReview = { mount, unmount };
