import { inspectBasis } from "./basis.ts";
import { depthWrites, newDepth, readDepth } from "../domain/depth.ts";
import { createHash } from "node:crypto";
import type { BackendContext, ObjectResult } from "../../vendor/hetu-sdk.ts";
import {
  failure,
  fixed,
  requireValue as need,
  ProjectError,
  ProjectStore,
  success,
} from "../../vendor/project-store.ts";
import {
  canonical,
  clone,
  effects,
  KIND,
  PLUGIN_ID,
  sourceIndices,
  validate,
  validateAction,
} from "../domain/model.ts";
const hash = (v: string | Uint8Array) =>
  createHash("sha256").update(v).digest("hex");
const bytes = (v: string) => Buffer.from(v, "utf8");
function boundary(b: Buffer, i: number) {
  return i === b.length || (i >= 0 && i < b.length && (b[i] & 0xc0) !== 0x80);
}
function span(text: string, start: number, end: number) {
  const b = bytes(text);
  need(
    start <= end && boundary(b, start) && boundary(b, end),
    "选区越界或不是UTF-8边界。",
  );
  return b.subarray(start, end);
}
function textOf(source: any) {
  need(typeof source?.content === "string", "此来源不是可读取的文稿。");
  return source.content as string;
}
export function preview(text: string, replacements: any[]) {
  const b = bytes(text),
    parts: Buffer[] = [],
    patches: any[] = [];
  let offset = 0;
  for (const p of replacements) {
    span(text, p.byte_start, p.byte_end);
    need(p.byte_start >= offset, "选区必须有序且不重叠。");
    const replacement = bytes(p.replacement);
    parts.push(b.subarray(offset, p.byte_start), replacement);
    patches.push({
      byte_start: p.byte_start,
      byte_end: p.byte_end,
      replacement_bytes: replacement.length,
      replacement_sha256: hash(replacement),
    });
    offset = p.byte_end;
  }
  parts.push(b.subarray(offset));
  const content = Buffer.concat(parts).toString("utf8");
  return {
    content,
    content_sha256: hash(content),
    patches,
    unchanged_outside: true,
  };
}
export function verify(before: string, after: string, patches: any[]) {
  const a = bytes(before),
    b = bytes(after);
  const changes: any[] = [];
  let ai = 0,
    bi = 0;
  for (const p of patches) {
    span(before, p.byte_start, p.byte_end);
    need(p.byte_start >= ai, "精修范围重叠或顺序无效。");
    const unchanged = a.subarray(ai, p.byte_start);
    need(
      b.subarray(bi, bi + unchanged.length).equals(unchanged),
      "选区外原文字节已改变。",
    );
    bi += unchanged.length;
    need(
      boundary(b, bi) && boundary(b, bi + p.replacement_bytes),
      "候选替换边界无效。",
    );
    const changed = b.subarray(bi, bi + p.replacement_bytes);
    need(
      changed.length === p.replacement_bytes &&
        hash(changed) === p.replacement_sha256,
      "替换字节摘要不符。",
    );
    changes.push({
      byte_start: p.byte_start,
      byte_end: p.byte_end,
      before: a.subarray(p.byte_start, p.byte_end).toString("utf8"),
      after: changed.toString("utf8"),
    });
    bi += p.replacement_bytes;
    ai = p.byte_end;
  }
  need(b.subarray(bi).equals(a.subarray(ai)), "选区外结尾原文字节已改变。");
  return {
    verified: true,
    changes,
    unchanged_outside: true,
    baseline_sha256: hash(a),
    candidate_sha256: hash(b),
  };
}
export class Project {
  readonly store: ProjectStore;
  readonly context: BackendContext;
  constructor(context: BackendContext) {
    this.context = context;
    this.store = new ProjectStore(context, PLUGIN_ID, KIND, validate);
  }
  async sources(record: any) {
    return this.store.sources(record.object.source_refs ?? []);
  }
  async check(p: any, refs: any[]) {
    validate(p);
    for (const ref of p.depth?.basis_refs ?? [])
      await inspectBasis(this.store, ref);
    need(
      sourceIndices(p).every(
        (i) => Number.isInteger(i) && i >= 0 && i < refs.length,
      ),
      "固定来源索引越界。",
    );
    const sources = await this.store.sources(refs);
    const inspect = (v: any) => {
      if (!v || typeof v !== "object") return;
      if ("quote" in v) {
        const text = textOf(sources[v.source_index]);
        need(
          span(text, v.byte_start, v.byte_end).toString("utf8") === v.quote,
          "证据引文与固定来源不一致。",
        );
      }
      for (const x of Object.values(v)) inspect(x);
    };
    inspect(p);
    for (const r of p.refinements)
      verify(
        textOf(sources[r.baseline_source_index]),
        textOf(sources[r.candidate_source_index]),
        r.patches,
      );
  }
  async save(input: any, p: any, old?: ObjectResult) {
    need(
      !(old?.object.content as any)?.depth || p.depth,
      "不能丢弃已有深化结构；请读取当前完整对象。",
      "hetu.stale_schema",
    );
    const refs = input.source_refs ?? old?.object.source_refs ?? [];
    await this.check(p, refs);
    return this.store.save(input, p, old);
  }
  async invoke(action: string, raw: unknown) {
    try {
      validateAction(action, raw);
      const i: any = clone(raw);
      if (effects.has(action)) {
        const recovered = await this.store.recover(i.operation_key);
        if (recovered) return recovered;
      }
      if (action === "get_operation")
        return this.store.call("hetu.extensions.operations.get", i);
      if (action === "list_projects")
        return this.store.call(
          i.query
            ? "hetu.extensions.objects.search"
            : "hetu.extensions.objects.list",
          { ...i, kind: KIND },
        );
      if (action === "save_project") {
        need(
          i.object_id
            ? i.expected_revision > 0 && i.expected_sha256.length === 64
            : i.expected_revision === 0 && i.expected_sha256 === "",
          "新建或更新基线无效。",
        );
        const old = i.object_id ? await this.store.baseline(i) : undefined;
        return await this.save(i, i.content, old);
      }
      if (action === "compare_versions") {
        const a = await this.store.get(i.object_id, i.from_revision),
          b = await this.store.get(i.object_id, i.to_revision);
        return success({
          from_ref: fixed(a),
          to_ref: fixed(b),
          changes: Object.keys(b.object.content as any).filter(
            (k) =>
              canonical((a.object.content as any)[k]) !==
              canonical((b.object.content as any)[k]),
          ),
        });
      }
      const r = effects.has(action)
          ? await this.store.baseline(i)
          : await this.store.get(i.object_id, i.revision),
        p: any = clone(r.object.content);
      if (effects.has(action)) {
        if (action === "save_depth" || depthWrites[action]) {
          if (action === "save_depth") p.depth = i.depth;
          else {
            p.depth ??= newDepth();
            const [field, key] = depthWrites[action];
            const at = p.depth[field].findIndex((v: any) => v.id === i[key].id);
            if (at < 0) p.depth[field].push(i[key]);
            else p.depth[field][at] = i[key];
          }
          return await this.save(i, p, r);
        }
        {
          const [verb, item] = action.split("_");
          const fields: Record<string, string> = {
            rule: "rules",
            comparison: "comparisons",
            refinement: "refinements",
          };
          const field = fields[item];
          need(field && ["put", "remove"].includes(verb), "未知写动作。");
          const list = p[field];
          if (verb === "put") {
            const at = list.findIndex((x: any) => x.id === i[item].id);
            if (at < 0) list.push(i[item]);
            else list[at] = i[item];
          } else {
            need(
              list.some((x: any) => x.id === i[item + "_id"]),
              "记录不存在。",
            );
            p[field] = list.filter((x: any) => x.id !== i[item + "_id"]);
          }
        }
        return await this.save(i, p, r);
      }
      if (action === "get_project") return success(r);
      if (action === "inspect_basis") {
        const ref = p.depth?.basis_refs?.[i.basis_index];
        need(ref, "专业依据索引不存在。");
        return success({
          project_ref: fixed(r),
          basis_ref: ref,
          record: await inspectBasis(this.store, ref),
        });
      }
      if (action === "export_project") {
        const report = {
          format: "hetu." + KIND,
          version: 1,
          project_ref: fixed(r),
          work_ref: this.context.work_ref,
          source_refs: r.object.source_refs ?? [],
          project: p,
        };
        const json = JSON.stringify(report, null, 2);
        const markdown =
          "# " +
          p.title +
          "\n\n固定专业报告；采纳与定稿独立决定。\n\n```json\n" +
          json +
          "\n```\n";
        const content = i.format === "json" ? json : markdown,
          b = bytes(content),
          offset = i.offset ?? 0;
        need(boundary(b, offset), "导出偏移不是UTF-8边界。");
        let end = Math.min(b.length, offset + (i.max_bytes ?? 32768));
        while (!boundary(b, end)) end--;
        const chunk = b.subarray(offset, end).toString("utf8");
        return success({
          project_ref: fixed(r),
          content: chunk,
          offset,
          next_offset: end === b.length ? null : end,
          total_bytes: b.length,
          content_sha256: hash(chunk),
          media_type:
            i.format === "json" ? "application/json" : "text/markdown",
        });
      }
      const sources = await this.sources(r);
      const source = (index: number) => {
        need(index < sources.length, "来源索引越界。");
        return sources[index];
      };
      const depthResult = readDepth(p, action, i, sources);
      if (depthResult !== undefined) {
        if (action === "preview_composition")
          return success({
            project_ref: fixed(r),
            ...depthResult,
            ...preview(textOf(source(i.baseline_source_index)), [
              {
                byte_start: i.byte_start,
                byte_end: i.byte_end,
                replacement: depthResult.replacement,
              },
            ]),
          });
        return success({ project_ref: fixed(r), ...depthResult });
      }
      if (action === "get_source")
        return success({ project_ref: fixed(r), ...source(i.source_index) });
      if (action === "preview_refinement")
        return success({
          project_ref: fixed(r),
          source_index: i.source_index,
          ...preview(textOf(source(i.source_index)), i.replacements),
        });
      if (action === "verify_refinement") {
        const f = i.refinement;
        return success({
          project_ref: fixed(r),
          ...verify(
            textOf(source(f.baseline_source_index)),
            textOf(source(f.candidate_source_index)),
            f.patches,
          ),
        });
      }
      if (action === "build_context") {
        const rules = i.rule_ids
          ? p.rules.filter((x: any) => i.rule_ids.includes(x.id))
          : p.rules.filter((x: any) => x.status === "active");
        if (i.rule_ids)
          need(rules.length === new Set(i.rule_ids).size, "所选规则不存在。");
        const mandatory = canonical({
          goal: i.goal,
          rules: rules.map((x: any) => ({
            id: x.id,
            text: x.text,
            scope: x.scope,
            origin: x.origin,
            conflict_with: x.conflict_with,
          })),
        });
        need(
          [...mandatory].length <= i.max_chars,
          "必要目标和规则超出预算，不能静默裁剪。",
          "hetu.budget_exceeded",
        );
        let content = mandatory,
          omitted: number[] = [];
        for (const index of i.source_indices ?? []) {
          const text = textOf(source(index)),
            part = "\n" + canonical({ source_index: index, content: text });
          if ([...(content + part)].length <= i.max_chars) content += part;
          else omitted.push(index);
        }
        return success({
          project_ref: fixed(r),
          content,
          chars: [...content].length,
          bytes: bytes(content).length,
          omitted_source_indices: omitted,
          complete: !omitted.length,
          token_count: null,
          fee: null,
        });
      }
      throw new ProjectError("未知动作。", "not_found");
    } catch (e) {
      return failure(e);
    }
  }
}
