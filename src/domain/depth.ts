import {
  requireValue as need,
  canonical,
  clone,
} from "../../vendor/project-store.ts";
import * as validators from "./validators.ts";

export const depthWrites: Record<string, [string, string]> = {
  put_learning_sample: ["samples", "sample"],
  put_rule_derivation: ["derivations", "derivation"],
  put_conflict_resolution: ["resolutions", "resolution"],
  put_rule_applicability: ["applications", "application"],
};
export const newDepth = () => ({
  version: 1,
  applications: [],
  samples: [],
  derivations: [],
  resolutions: [],
});
export function validateDepth(p: any) {
  if (!p.depth) return;
  const d = p.depth,
    rules = new Map<string, any>(p.rules.map((r: any) => [r.id, r]));
  for (const key of ["applications", "samples", "derivations", "resolutions"])
    need(
      new Set(d[key].map((x: any) => x.id)).size === d[key].length,
      "深化记录ID重复：" + key,
    );
  for (const a of d.applications)
    need(rules.has(a.rule_id), "适用条件引用的规则不存在。");
  need(
    new Set(d.applications.map((x: any) => x.rule_id)).size ===
      d.applications.length,
    "每条规则只能有一份适用条件。",
  );
  for (const derivation of d.derivations) {
    need(
      derivation.sample_ids.length > 0 &&
        derivation.sample_ids.every((id: string) =>
          d.samples.some((s: any) => s.id === id),
        ),
      "偏好提议需要已有学习样本。",
    );
    need(
      derivation.rule.status === "proposed",
      "学习得到的规则必须保持待确认。",
    );
    need(
      !derivation.sample_ids.some((id: string) =>
        d.samples.some((s: any) => s.id === id && s.usage === "once"),
      ),
      "一次性试写样本不能派生长期规则。",
    );
  }
  for (const r of d.resolutions) {
    need(
      r.rule_ids.length >= 2 &&
        new Set(r.rule_ids).size === r.rule_ids.length &&
        r.rule_ids.every((id: string) => rules.has(id)),
      "冲突决定需要确切且不重复的规则。",
    );
    need(
      r.chosen_ids.length > 0 &&
        new Set(r.chosen_ids).size === r.chosen_ids.length &&
        r.chosen_ids.every((id: string) => r.rule_ids.includes(id)),
      "所选冲突规则无效。",
    );
    for (const id of r.chosen_ids)
      need(
        !r.chosen_ids.some(
          (other: string) =>
            other !== id &&
            (rules.get(id).conflict_with.includes(other) ||
              rules.get(other).conflict_with.includes(id)),
        ),
        "冲突决定仍选择了互斥规则。",
      );
  }
}
export function selection(p: any, target: any, explicit?: string[]) {
  const matched: any[] = [],
    excluded: any[] = [],
    uncertain: any[] = [];
  if (explicit)
    need(
      new Set(explicit).size === explicit.length &&
        explicit.every((id) => p.rules.some((r: any) => r.id === id)),
      "显式选择的规则不存在或重复。",
    );
  for (const r of p.rules) {
    const reasons: string[] = [],
      unknown: string[] = [];
    if (r.status !== "active")
      reasons.push(r.status === "disabled" ? "规则已停用" : "规则待确认");
    if (explicit && !explicit.includes(r.id)) reasons.push("本次未选择");
    if (r.scope.kind === "character") {
      if (target.character_refs === null) unknown.push("本次人物未知");
      else if (!target.character_refs.includes(r.scope.target))
        reasons.push("人物引用不匹配");
    }
    if (r.scope.kind === "chapter") {
      if (target.chapter_ref === null) unknown.push("本次章节未知");
      else if (target.chapter_ref !== r.scope.target)
        reasons.push("章节引用不匹配");
    }
    const a = p.depth?.applications.find((x: any) => x.rule_id === r.id);
    if (a) {
      if (a.text_kinds.length) {
        if (target.text_kind === null) unknown.push("文本类型未知");
        else if (!a.text_kinds.includes(target.text_kind))
          reasons.push("文本类型不匹配");
      }
      if (a.required_tags.length || a.excluded_tags.length) {
        if (target.tags === null) unknown.push("场景标签未知");
        else {
          if (!a.required_tags.every((x: string) => target.tags.includes(x)))
            reasons.push("缺少适用标签");
          if (a.excluded_tags.some((x: string) => target.tags.includes(x)))
            reasons.push("场景已排除");
        }
      }
    }
    const v = {
      rule_id: r.id,
      reasons: reasons.length
        ? reasons
        : unknown.length
          ? unknown
          : ["状态与目标匹配"],
    };
    if (reasons.length) excluded.push(v);
    else if (unknown.length) uncertain.push(v);
    else matched.push(v);
  }
  let chosen = matched.map((x) => x.rule_id);
  const applied_resolutions: string[] = [];
  for (const r of p.depth?.resolutions ?? []) {
    if (
      canonical(r.target) !== canonical(target) ||
      !r.rule_ids.every((id: string) => chosen.includes(id))
    )
      continue;
    chosen = chosen.filter(
      (id) => !r.rule_ids.includes(id) || r.chosen_ids.includes(id),
    );
    applied_resolutions.push(r.id);
  }
  const conflicts: any[] = [];
  for (let j = 0; j < chosen.length; j++)
    for (let k = j + 1; k < chosen.length; k++) {
      const a = p.rules.find((r: any) => r.id === chosen[j]),
        b = p.rules.find((r: any) => r.id === chosen[k]);
      if (a.conflict_with.includes(b.id) || b.conflict_with.includes(a.id))
        conflicts.push({
          rule_ids: [a.id, b.id],
          reason: "显式互斥，需决定适用例外",
        });
    }
  return {
    target,
    matched,
    excluded,
    uncertain,
    selected_rule_ids: chosen,
    conflicts,
    applied_resolutions,
    complete: !conflicts.length && !uncertain.length,
    selection_version: "scope-1",
  };
}
function span(text: string, start: number, end: number) {
  const b = new TextEncoder().encode(text);
  need(
    Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 0 &&
      start <= end &&
      end <= b.length,
    "片段范围越界。",
  );
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      b.slice(start, end),
    );
  } catch {
    need(false, "片段不是合法UTF-8边界。");
    return "";
  }
}
export function readDepth(p: any, action: string, i: any, sources: any[]): any {
  if (action === "preview_rule_selection")
    return selection(p, i.target, i.rule_ids);
  if (action === "compile_context") {
    const result = selection(p, i.target, i.rule_ids);
    need(
      result.complete,
      "规则选择不完整：请处理未知目标或冲突。",
      "hetu.incomplete_context",
    );
    let content = canonical({
      goal: i.goal,
      target: i.target,
      rules: p.rules.filter((r: any) =>
        result.selected_rule_ids.includes(r.id),
      ),
      selection_version: result.selection_version,
    });
    need(
      [...content].length <= i.max_chars,
      "必要目标和规则超出预算。",
      "hetu.budget_exceeded",
    );
    const included: number[] = [],
      omitted: number[] = [];
    for (const index of i.source_indices ?? []) {
      need(typeof sources[index]?.content === "string", "固定文稿来源不存在。");
      const part =
        "\n" +
        canonical({ source_index: index, content: sources[index].content });
      if ([...(content + part)].length <= i.max_chars) {
        content += part;
        included.push(index);
      } else omitted.push(index);
    }
    return {
      ...result,
      content,
      chars: [...content].length,
      bytes: new TextEncoder().encode(content).length,
      included_source_indices: included,
      omitted_source_indices: omitted,
      complete: !omitted.length,
      token_count: null,
      fee: null,
    };
  }
  if (action === "export_style_template") {
    need(
      new Set(i.rule_ids).size === i.rule_ids.length &&
        i.rule_ids.every((id: string) => p.rules.some((r: any) => r.id === id)),
      "模板规则不存在或重复。",
    );
    return {
      format: "hetu.style-template",
      version: 1,
      rules: p.rules
        .filter((r: any) => i.rule_ids.includes(r.id))
        .map((r: any) => ({
          ...clone(r),
          evidence: [],
          conflict_with: r.conflict_with.filter((id: string) =>
            i.rule_ids.includes(id),
          ),
        })),
      applications: (p.depth?.applications ?? []).filter((a: any) =>
        i.rule_ids.includes(a.rule_id),
      ),
      source_note: "只含明确选择的规则；原文、授权与学习样本不随模板交付",
    };
  }
  if (action === "preview_template_import") {
    const t = i.template;
    need(
      t.format === "hetu.style-template" &&
        t.version === 1 &&
        Array.isArray(t.rules) &&
        t.rules.length <= 200,
      "模板格式不支持。",
    );
    const losses = Object.keys(t)
        .filter(
          (k) =>
            ![
              "format",
              "version",
              "rules",
              "applications",
              "source_note",
              "project_ref",
            ].includes(k),
        )
        .map((field) => ({ field, reason: "未知字段，不导入" })),
      unmapped: any[] = [],
      rules: any[] = [];
    for (const rule of t.rules) {
      const r = clone(rule);
      r.evidence = [];
      r.status = "proposed";
      const extra = Object.keys(r).filter(
        (k) =>
          ![
            "id",
            "text",
            "scope",
            "origin",
            "status",
            "evidence",
            "conflict_with",
          ].includes(k),
      );
      for (const field of extra) {
        losses.push({
          field: "rules." + r.id + "." + field,
          reason: "未知字段，不导入",
        });
        delete r[field];
      }
      if (r.scope?.kind !== "work") {
        const m = i.mappings.find(
          (m: any) => m.kind === r.scope?.kind && m.from === r.scope?.target,
        );
        if (!m) unmapped.push({ rule_id: r.id, scope: r.scope });
        else r.scope.target = m.to;
      }
      rules.push(r);
    }
    const candidate = {
      format_version: 1,
      title: "模板预览",
      rules,
      comparisons: [],
      refinements: [],
    };
    need((validators as any).project(candidate), "模板规则不符合公开格式。");
    need(
      new Set(rules.map((r: any) => r.id)).size === rules.length,
      "模板规则ID重复。",
    );
    const collisions = rules
      .filter((r: any) => p.rules.some((x: any) => x.id === r.id))
      .map((r: any) => r.id);
    const ruleIds = new Set(rules.map((r: any) => r.id));
    need(
      rules.every((r: any) =>
        r.conflict_with.every((id: string) => ruleIds.has(id)),
      ),
      "模板冲突引用无效。",
    );
    const applications = clone(t.applications ?? []);
    const withDepth = { ...candidate, depth: { ...newDepth(), applications } };
    need(
      (validators as any).project(withDepth),
      "模板适用条件不符合公开格式。",
    );
    validateDepth(withDepth);
    return {
      rules,
      applications,
      losses,
      unmapped,
      collisions,
      complete: !losses.length && !unmapped.length && !collisions.length,
      requires_explicit_save: true,
    };
  }
  if (action === "preview_composition") {
    need(i.segments.length > 0, "组合至少包含一个固定片段。");
    const text = sources[i.baseline_source_index]?.content;
    need(typeof text === "string", "需要固定原稿基线。");
    span(text, i.byte_start, i.byte_end);
    const source_map: any[] = [],
      parts: string[] = [];
    let at = 0;
    for (const s of i.segments) {
      need(
        typeof sources[s.source_index]?.content === "string",
        "片段来源不存在。",
      );
      const part = span(
        sources[s.source_index].content,
        s.byte_start,
        s.byte_end,
      );
      parts.push(s.connector, part);
      at += new TextEncoder().encode(s.connector).length;
      source_map.push({
        source_index: s.source_index,
        byte_start: s.byte_start,
        byte_end: s.byte_end,
        output_start: at,
        output_end: at + new TextEncoder().encode(part).length,
      });
      at += new TextEncoder().encode(part).length;
    }
    return {
      replacement: parts.join(""),
      source_map,
      baseline_source_index: i.baseline_source_index,
      byte_start: i.byte_start,
      byte_end: i.byte_end,
      review_required: ["片段间人称、时间、空间与过渡需复核"],
      adopted: false,
    };
  }
  return undefined;
}
