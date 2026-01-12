import { ViewType } from "../types";

export function Toolbar({ view, setView }: { view: ViewType; setView: (v: ViewType) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <button onClick={() => setView("unified")} disabled={view === "unified"}>
        Unified
      </button>
      <button onClick={() => setView("split")} disabled={view === "split"}>
        Split
      </button>
    </div>
  );
}
