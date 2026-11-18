import assert from "node:assert/strict";
import { newProject } from "../../src/domain/model.ts";
import { newDepth } from "../../src/domain/depth.ts";
export const target = {
  chapter_ref: "chapter_a",
  character_refs: ["lin"],
  text_kind: "dialogue",
  tags: ["quiet"],
};
export function fixtureContent(ev: any) {
  const p = newProject("雨港文风深化");
  const rule = (id: string, text: string, scope: any, status = "active") => ({
    id,
    text,
    scope,
    origin: "author_statement",
    status,
    evidence: [ev],
    conflict_with: [],
  });
  p.rules = [
    rule("pause", "对白保留停顿", { kind: "work", target: null }),
    rule("lin", "林溪不直接说出恐惧", { kind: "character", target: "lin" }),
    rule("chen", "陈舟可以直说", { kind: "character", target: "chen" }),
    rule(
      "inactive",
      "旧偏好已停用",
      { kind: "work", target: null },
      "disabled",
    ),
  ];
  p.depth = {
    ...newDepth(),
    applications: [
      {
        id: "lin-scope",
        rule_id: "lin",
        text_kinds: ["dialogue"],
        required_tags: ["quiet"],
        excluded_tags: ["battle"],
      },
    ],
  };
  return p;
}
export async function runDepthScenario(c: any, refs: any[], ev: any) {
  let r = await c.invoke("save_project", {
      content: fixtureContent(ev),
      source_refs: refs,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "depth-create",
    }),
    serial = 0;
  const write = async (a: string, i: any) =>
    (r = await c.invoke(a, {
      object_id: r.object.object_id,
      expected_revision: r.object.revision,
      expected_sha256: r.sha256,
      operation_key: "depth-" + ++serial,
      ...i,
    }));
  const read = (a: string, i: any = {}) =>
    c.invoke(a, {
      object_id: r.object.object_id,
      revision: r.object.revision,
      ...i,
    });
  await write("save_depth", { depth: r.object.content.depth });
  let result = await read("preview_rule_selection", { target });
  assert.deepEqual(result.selected_rule_ids, ["pause", "lin"]);
  await write("put_rule_applicability", {
    application: r.object.content.depth.applications[0],
  });
  await write("put_learning_sample", {
    sample: {
      id: "sample",
      before: ev,
      after: ev,
      feedback: "保留停顿，只用于这个人物",
      usage: "reusable",
    },
  });
  await write("put_rule_derivation", {
    derivation: {
      id: "derive",
      sample_ids: ["sample"],
      rule: {
        ...r.object.content.rules[1],
        id: "proposal",
        status: "proposed",
      },
      rationale: "依据作者明确反馈，作为可审阅提议",
      status: "proposed",
    },
  });
  // 非互斥规则也可明确记录本次选择，不扩展到其他目标。
  await write("put_conflict_resolution", {
    resolution: {
      id: "once",
      target,
      rule_ids: ["pause", "lin"],
      chosen_ids: ["pause", "lin"],
      reason: "本场同时沿用两项偏好",
    },
  });
  result = await read("compile_context", {
    target,
    goal: "准备下一轮固定候选",
    source_indices: [0],
    max_chars: 12000,
  });
  assert.equal(result.complete, true);
  assert.equal(result.token_count, null);
  const template = await read("export_style_template", { rule_ids: ["lin"] });
  result = await read("preview_template_import", {
    template,
    mappings: [{ kind: "character", from: "lin", to: "other_lin" }],
  });
  assert.equal(result.rules[0].scope.target, "other_lin");
  assert.deepEqual(result.collisions, ["lin"]);
  result = await read("preview_composition", {
    baseline_source_index: 0,
    byte_start: ev.byte_start,
    byte_end: ev.byte_end,
    segments: [
      {
        source_index: 0,
        byte_start: ev.byte_start,
        byte_end: ev.byte_end,
        connector: "",
      },
    ],
  });
  assert.equal(result.unchanged_outside, true);
  assert.equal(result.adopted, false);
  const previous = {
    owner_plugin_id: "org.wordflowlab.prose-studio",
    object_id: r.object.object_id,
    revision: r.object.revision,
    sha256: r.sha256,
  };
  await write("save_depth", {
    depth: { ...r.object.content.depth, basis_refs: [previous] },
  });
  const basis = await read("inspect_basis", { basis_index: 0 });
  assert.equal(basis.record.sha256, previous.sha256);
  return r;
}
