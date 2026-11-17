import { canonical } from "../vendor/project-store.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import manifest from "../contracts/plugin-manifest.json" with { type: "json" };
import { preview, verify } from "../src/application/project.ts";
import { newProject, validate } from "../src/domain/model.ts";
import { memoryCore } from "./support/memory-core.ts";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const before = "雨港。\r\n林溪说：“等一等。” 🌧️\n雨港。\n";
const evidence = {
  source_index: 0,
  byte_start: 0,
  byte_end: 9,
  quote: "雨港。",
};
const rule = (id = "r1"): any => ({
  id,
  text: "对话保留停顿，避免替人物解释情绪",
  scope: { kind: "work", target: null },
  origin: "author_statement",
  status: "active",
  evidence: [evidence],
  conflict_with: [],
});
export function fixture() {
  const c = memoryCore();
  const ref: any = {
    kind: "document",
    work_ref: c.work,
    document_id: "document_original",
    revision_id: "revision_original",
    sha256: sha(before),
  };
  c.sources.set(canonical(ref), { source_ref: ref, content: before });
  return { c, ref, before };
}
const base = (r: any, key: string) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: key,
});
async function create(c: any, refs: any[] = []) {
  const r = await c.invoke("save_project", {
    content: newProject("雨港来信"),
    source_refs: refs,
    expected_revision: 0,
    expected_sha256: "",
    operation_key: "create",
  });
  assert.equal(r.status, "succeeded", JSON.stringify(r));
  return r.data;
}
function value(r: any) {
  assert.equal(r.status, "succeeded", JSON.stringify(r));
  return r.data;
}
const bad = (r: any, code?: string) => {
  assert.equal(r.status, "failed", JSON.stringify(r));
  if (code) assert.equal(r.error.code, code);
};
test("默认数据与闭合Schema", () => {
  validate(newProject());
  const p = newProject();
  p.extra = true;
  assert.throws(() => validate(p));
});
test("未知动作与多余参数拒绝", async () => {
  const { c } = fixture();
  bad(await c.invoke("not_a_tool", {}), "not_found");
  bad(await c.invoke("list_projects", { secret: "x" }));
});
test("CAS、历史读取、同键重放与异输入冲突", async () => {
  const { c } = fixture();
  let r = await create(c);
  const input = {
    ...base(r, "update"),
    content: { ...r.object.content, title: "第二版" },
  };
  r = value(await c.invoke("save_project", input));
  assert.equal(r.object.revision, 2);
  assert.equal(value(await c.invoke("save_project", input)).sha256, r.sha256);
  bad(
    await c.invoke("save_project", {
      ...input,
      content: { ...input.content, title: "换输入" },
    }),
    "idempotency_conflict",
  );
  bad(
    await c.invoke("save_project", { ...input, operation_key: "old" }),
    "revision_conflict",
  );
  assert.equal(
    value(
      await c.invoke("get_project", {
        object_id: r.object.object_id,
        revision: 1,
      }),
    ).object.content.title,
    "雨港来信",
  );
});
test("响应丢失沿原键恢复，未重复写入", async () => {
  const { c } = fixture();
  const r = await create(c),
    i = {
      ...base(r, "lost"),
      content: { ...r.object.content, title: "丢失响应" },
    };
  c.failAfterWrite = true;
  bad(await c.invoke("save_project", i));
  const op = value(await c.invoke("get_operation", { operation_key: "lost" }));
  assert.equal(op.object.revision, 2);
  assert.equal(value(await c.invoke("save_project", i)).sha256, op.sha256);
  assert.equal(c.writes, 2);
});
test("未知原操作不能继续写", async () => {
  const { c } = fixture();
  c.unknown = true;
  bad(
    await c.invoke("save_project", {
      content: newProject(),
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "unknown",
    }),
    "unknown",
  );
  assert.equal(c.writes, 0);
});
test("固定来源不存在失败", async () => {
  const { c, ref } = fixture();
  const badRef = { ...ref, sha256: "f".repeat(64) };
  bad(
    await c.invoke("save_project", {
      content: newProject(),
      source_refs: [badRef],
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "bad-source",
    }),
    "not_found",
  );
});
test("来源只追加，不重定向旧索引", async () => {
  const { c, ref } = fixture();
  const r = await create(c, [ref]);
  bad(
    await c.invoke("save_project", {
      ...base(r, "replace"),
      source_refs: [],
      content: r.object.content,
    }),
    "hetu.stale_evidence",
  );
});
test("列表、搜索、比较和固定导出分块", async () => {
  const { c } = fixture();
  let r = await create(c);
  assert.equal(
    value(await c.invoke("list_projects", { query: "雨港" })).objects.length,
    1,
  );
  r = value(
    await c.invoke("save_project", {
      ...base(r, "second"),
      content: { ...r.object.content, title: "雨港新版" },
    }),
  );
  assert.deepEqual(
    value(
      await c.invoke("compare_versions", {
        object_id: r.object.object_id,
        from_revision: 1,
        to_revision: 2,
      }),
    ).changes,
    ["title"],
  );
  let out = "",
    offset = 0;
  do {
    const x = value(
      await c.invoke("export_project", {
        object_id: r.object.object_id,
        revision: 2,
        format: "json",
        offset,
        max_bytes: 71,
      }),
    );
    assert.equal(sha(x.content), x.content_sha256);
    out += x.content;
    if (x.next_offset === null) break;
    offset = x.next_offset;
  } while (true);
  assert.equal(JSON.parse(out).project.title, "雨港新版");
  bad(
    await c.invoke("export_project", {
      object_id: r.object.object_id,
      format: "json",
      offset: 999999,
    }),
  );
});
test("专业对象大小与标题字节预算", async () => {
  const { c } = fixture();
  const p = newProject("雨".repeat(180));
  bad(
    await c.invoke("save_project", {
      content: p,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "long",
    }),
  );
});
{
  test("偏好、证据、范围与冲突引用", async () => {
    const { c, ref } = fixture();
    let r = await create(c, [ref]);
    r = value(await c.invoke("put_rule", { ...base(r, "rule"), rule: rule() }));
    assert.equal(r.object.content.rules.length, 1);
    bad(
      await c.invoke("put_rule", {
        ...base(r, "badquote"),
        rule: { ...rule("r2"), evidence: [{ ...evidence, quote: "不符" }] },
      }),
    );
    bad(
      await c.invoke("put_rule", {
        ...base(r, "badindex"),
        rule: { ...rule("r2"), evidence: [{ ...evidence, source_index: 1 }] },
      }),
    );
    bad(
      await c.invoke("put_rule", {
        ...base(r, "badscope"),
        rule: { ...rule("r2"), scope: { kind: "character", target: null } },
      }),
    );
    bad(
      await c.invoke("put_rule", {
        ...base(r, "self"),
        rule: { ...rule("r2"), conflict_with: ["r2"] },
      }),
    );
  });
  test("比较引用宿主候选，不复制全文；删除被引用规则拒绝", async () => {
    const { c, ref } = fixture();
    let r = await create(c, [ref]);
    r = value(await c.invoke("put_rule", { ...base(r, "r1"), rule: rule() }));
    r = value(
      await c.invoke("put_rule", {
        ...base(r, "r2"),
        rule: { ...rule("r2"), conflict_with: ["r1"] },
      }),
    );
    bad(
      await c.invoke("remove_rule", {
        ...base(r, "remove-used"),
        rule_id: "r1",
      }),
    );
    const comparison = {
      id: "c1",
      title: "方向比较",
      goal: "让读者先知道谁在等信",
      candidates: [
        {
          id: "a",
          source_index: 0,
          strategy: "从林溪等待切入",
          tradeoffs: ["悬念缓慢"],
        },
        {
          id: "b",
          source_index: 0,
          strategy: "从失踪信件切入",
          tradeoffs: ["人物延后"],
        },
      ],
    };
    r = value(
      await c.invoke("put_comparison", { ...base(r, "compare"), comparison }),
    );
    bad(
      await c.invoke("put_comparison", {
        ...base(r, "single"),
        comparison: {
          ...comparison,
          id: "c2",
          candidates: comparison.candidates.slice(0, 1),
        },
      }),
    );
    r = value(
      await c.invoke("remove_comparison", {
        ...base(r, "remove-compare"),
        comparison_id: "c1",
      }),
    );
    assert.equal(r.object.content.comparisons.length, 0);
  });
  test("局部修改保留CRLF、重复句、emoji与所有范围外字节", () => {
    const p = preview(before, [
      { byte_start: 0, byte_end: 6, replacement: "海港" },
    ]);
    assert.equal(p.content, "海港" + before.slice(2));
    assert.equal(verify(before, p.content, p.patches).verified, true);
    assert.throws(() =>
      verify(before, p.content.replace("等一等", "快走"), p.patches),
    );
    assert.throws(() =>
      preview(before, [{ byte_start: 1, byte_end: 3, replacement: "坏" }]),
    );
    assert.throws(() =>
      preview(before, [
        { byte_start: 3, byte_end: 6, replacement: "x" },
        { byte_start: 0, byte_end: 3, replacement: "y" },
      ]),
    );
  });
  test("实际候选核验与精修专业记录", async () => {
    const { c, ref } = fixture();
    let r = await create(c, [ref]);
    const prev = value(
      await c.invoke("preview_refinement", {
        object_id: r.object.object_id,
        source_index: 0,
        replacements: [{ byte_start: 0, byte_end: 6, replacement: "海港" }],
      }),
    );
    const ref2 = {
      ...ref,
      revision_id: "revision_candidate",
      sha256: sha(prev.content),
    };
    const { canonical } = await import("../src/domain/model.ts");
    c.sources.set(canonical(ref2), { content: prev.content });
    r = value(
      await c.invoke("save_project", {
        ...base(r, "append"),
        source_refs: [ref, ref2],
        content: r.object.content,
      }),
    );
    const f = {
      id: "f1",
      title: "只改地点",
      baseline_source_index: 0,
      candidate_source_index: 1,
      patches: prev.patches,
    };
    assert.equal(
      value(
        await c.invoke("verify_refinement", {
          object_id: r.object.object_id,
          refinement: f,
        }),
      ).verified,
      true,
    );
    r = value(
      await c.invoke("put_refinement", {
        ...base(r, "save-refinement"),
        refinement: f,
      }),
    );
    assert.equal(r.object.content.refinements.length, 1);
  });
  test("上下文预算不隐藏必要约束，来源省略透明", async () => {
    const { c, ref } = fixture();
    let r = await create(c, [ref]);
    r = value(await c.invoke("put_rule", { ...base(r, "rule"), rule: rule() }));
    bad(
      await c.invoke("build_context", {
        object_id: r.object.object_id,
        goal: "a".repeat(150),
        max_chars: 100,
      }),
      "hetu.budget_exceeded",
    );
    const ctx = value(
      await c.invoke("build_context", {
        object_id: r.object.object_id,
        goal: "接续",
        source_indices: [0],
        max_chars: 1000,
      }),
    );
    assert.equal(ctx.token_count, null);
    assert.equal(ctx.complete, true);
  });
}
test("同包Skill与动作Schema齐全", async () => {
  const { readFile } = await import("node:fs/promises");
  const skill = manifest.contributions.skills[0];
  for (const file of [
    skill.entry,
    "skills/" + skill.name + "/references/workflow.md",
    "skills/" + skill.name + "/references/operations.md",
  ])
    assert.ok((await readFile(file, "utf8")).length > 100);
  for (const action of manifest.contributions.actions) {
    assert.ok(action.input_schema.required);
    assert.ok(
      action.effect === "read" || action.input_schema.properties.operation_key,
    );
  }
});

test("精修核验返回真实前后选区文本，冲突偏好不会丢失", async () => {
  const v = preview(before, [
    { byte_start: 0, byte_end: 6, replacement: "海港" },
  ]);
  assert.deepEqual(
    verify(before, v.content, v.patches).changes.map((p: any) => ({
      before: p.before,
      after: p.after,
    })),
    [{ before: "雨港", after: "海港" }],
  );
  const { c, ref } = fixture();
  let r = await create(c, [ref]);
  r = value(await c.invoke("put_rule", { ...base(r, "r1"), rule: rule() }));
  r = value(
    await c.invoke("put_rule", {
      ...base(r, "r2"),
      rule: {
        ...rule("r2"),
        text: "此人物故意直接解释",
        conflict_with: ["r1"],
      },
    }),
  );
  const ctx = value(
    await c.invoke("build_context", {
      object_id: r.object.object_id,
      goal: "比较冲突的适用范围",
      max_chars: 4000,
    }),
  );
  assert.ok(ctx.content.includes("conflict_with"));
});
