import manifest from "../../contracts/plugin-manifest.json" with { type: "json" };
import {
  canonical,
  clone,
  requireValue as need,
} from "../../vendor/project-store.ts";
import * as validators from "./validators.ts";
export { canonical, clone };
export const PLUGIN_ID = manifest.id,
  KIND = manifest.contributions.data[0].kind,
  WORK_KIND = "novel";
export const effects = new Set(
  manifest.contributions.actions
    .filter((a) => a.effect === "managed_write")
    .map((a) => a.id),
);
export function validateAction(action: string, input: unknown) {
  const f = (validators as any)[action];
  need(f, "未知专业动作。", "not_found");
  need(f(input), "动作参数不符合Schema：" + JSON.stringify(f.errors));
}
export function validate(p: any) {
  const f = (validators as any).project;
  need(f(p), "专业数据不符合Schema：" + JSON.stringify(f.errors));
  for (const [k, list] of Object.entries(p))
    if (
      Array.isArray(list) &&
      list.some((v) => v && typeof v === "object" && "id" in v)
    ) {
      const ids = list.map((v) => v.id);
      need(new Set(ids).size === ids.length, "重复专业ID：" + k);
    }
  {
    for (const r of p.rules) {
      need(
        (r.scope.kind === "work") === (r.scope.target === null),
        "规则范围需要确切目标。",
      );
      need(
        !r.conflict_with.includes(r.id) &&
          r.conflict_with.every((id: string) =>
            p.rules.some((v: any) => v.id === id),
          ),
        "冲突规则引用无效。",
      );
    }
    for (const c of p.comparisons) {
      need(c.candidates.length >= 2, "比较至少需要两个候选。");
      need(
        new Set(c.candidates.map((x: any) => x.id)).size ===
          c.candidates.length,
        "候选ID重复。",
      );
    }
  }
}
export function newProject(title = "未命名方案"): any {
  return {
    format_version: 1,
    title,
    rules: [],
    comparisons: [],
    refinements: [],
  };
}
export function sourceIndices(p: any): number[] {
  const out: number[] = [];
  function visit(v: any) {
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if ((k === "source_index" || k.endsWith("_source_index")) && x !== null)
        out.push(x as number);
      else if (
        [
          "source_indices",
          "scope_indices",
          "resolution_source_indices",
        ].includes(k)
      )
        out.push(...(x as number[]));
      else visit(x);
    }
  }
  visit(p);
  return out;
}
