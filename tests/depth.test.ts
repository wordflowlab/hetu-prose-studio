import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonical } from "../vendor/project-store.ts";
import { memoryCore } from "./support/memory-core.ts";
import {
  fixtureContent,
  target,
  runDepthScenario,
} from "./support/depth-scenario.ts";
import { validate } from "../src/domain/model.ts";
import { selection, readDepth, newDepth } from "../src/domain/depth.ts";
const text = "雨港。\r\n🌧️林溪仍在等待。\n",
  ev = { source_index: 0, byte_start: 0, byte_end: 9, quote: "雨港。" };
const p = () => fixtureContent(ev);
test("PSD-01/02 exact scopes and unknown people", () => {
  const a = selection(p(), target);
  assert.deepEqual(a.selected_rule_ids, ["pause", "lin"]);
  assert.equal(
    selection(p(), {
      ...target,
      character_refs: ["same-name-other-id"],
    }).selected_rule_ids.includes("lin"),
    false,
  );
  assert.ok(
    selection(p(), { ...target, character_refs: null }).uncertain.length,
  );
});
test("PSD-03 conflicts require target-specific resolution", () => {
  const a = p();
  a.rules[0].conflict_with = ["lin"];
  assert.equal(selection(a, target).complete, false);
  a.depth.resolutions = [
    {
      id: "r",
      target,
      rule_ids: ["pause", "lin"],
      chosen_ids: ["lin"],
      reason: "只在本场外露情绪",
    },
  ];
  validate(a);
  assert.equal(selection(a, target).complete, true);
  assert.deepEqual(selection(a, target).selected_rule_ids, ["lin"]);
  assert.equal(
    selection(a, { ...target, chapter_ref: "other" }).complete,
    false,
  );
});
test("PSD-04 inactive explicit rule is never revived", () => {
  assert.deepEqual(selection(p(), target, ["inactive"]).selected_rule_ids, []);
  assert.throws(() => selection(p(), target, ["missing"]));
});
test("PSD-05/06 learning is proposed; one-off sample is not global", () => {
  const a = p();
  a.depth.samples = [
    { id: "s", before: ev, after: ev, feedback: "", usage: "once" },
  ];
  a.depth.derivations = [
    {
      id: "d",
      sample_ids: ["s"],
      rule: { ...a.rules[0], status: "proposed" },
      rationale: "推测",
      status: "proposed",
    },
  ];
  assert.throws(() => validate(a));
  a.depth.samples[0].usage = "reusable";
  validate(a);
  a.depth.derivations[0].rule.status = "active";
  assert.throws(() => validate(a));
});
test("PSD-07/08 template omits manuscripts and reports unmapped/unknown fields", () => {
  const t = readDepth(p(), "export_style_template", { rule_ids: ["lin"] }, []);
  assert.deepEqual(t.rules[0].evidence, []);
  const r = readDepth(
    p(),
    "preview_template_import",
    { template: { ...t, extra: "keep" }, mappings: [] },
    [],
  );
  assert.equal(r.unmapped.length, 1);
  assert.equal(r.losses.length, 1);
  assert.equal(r.complete, false);
});
test("PSD-09/10 composition respects UTF8, CRLF and outside bytes", () => {
  const a = p(),
    sources = [{ content: text }],
    r = readDepth(
      a,
      "preview_composition",
      {
        baseline_source_index: 0,
        byte_start: 0,
        byte_end: 9,
        segments: [
          { source_index: 0, byte_start: 0, byte_end: 9, connector: "后来，" },
        ],
      },
      sources,
    );
  assert.equal(r.replacement, "后来，雨港。");
  assert.equal(r.adopted, false);
  assert.throws(() =>
    readDepth(
      a,
      "preview_composition",
      {
        baseline_source_index: 0,
        byte_start: 1,
        byte_end: 9,
        segments: [
          { source_index: 0, byte_start: 0, byte_end: 9, connector: "" },
        ],
      },
      sources,
    ),
  );
});
test("PSD-11 mandatory budget fails and optional omitted source is explicit", () => {
  assert.throws(() =>
    readDepth(p(), "compile_context", { target, goal: "继续", max_chars: 2 }, [
      { content: text },
    ]),
  );
  const x = readDepth(
    p(),
    "compile_context",
    { target, goal: "继续", max_chars: 12000, source_indices: [0] },
    [{ content: text }],
  );
  assert.equal(x.token_count, null);
  assert.equal(x.complete, true);
});
test("PSD-12 complete new action flow uses fixed sources and CAS", async () => {
  const c = memoryCore(),
    ref = {
      kind: "document",
      work_ref: c.work,
      document_id: "document_d",
      revision_id: "revision_d",
      sha256: createHash("sha256").update(text).digest("hex"),
    };
  c.sources.set(canonical(ref), { source_ref: ref, content: text });
  await runDepthScenario(
    {
      invoke: async (a: string, i: any) => {
        const r = await c.invoke(a, i);
        assert.equal(r.status, "succeeded", JSON.stringify(r));
        return r.data;
      },
    },
    [ref],
    ev,
  );
});
test("old aggregate has no implicit depth and invalid applicability is rejected", () => {
  const a = p();
  delete a.depth;
  validate(a);
  assert.equal("depth" in a, false);
  a.depth = {
    ...newDepth(),
    applications: [
      {
        id: "bad",
        rule_id: "unknown",
        text_kinds: [],
        required_tags: [],
        excluded_tags: [],
      },
    ],
  };
  assert.throws(() => validate(a));
});
