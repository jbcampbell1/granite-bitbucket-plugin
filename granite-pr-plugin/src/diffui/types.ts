export type Ctx = { project: string; repo: string; pr: string };
export type ViewType = "unified" | "split";

export type FileDiff = {
  type: any;
  hunks: any[];
  oldPath?: string;
  newPath?: string;
};
