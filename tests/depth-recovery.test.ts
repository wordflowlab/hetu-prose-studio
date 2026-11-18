import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonical } from "../vendor/project-store.ts";
import { memoryCore, hash } from "./support/memory-core.ts";
import { fixtureContent } from "./support/depth-scenario.ts";

async function fixture() {
  const c = memoryCore(),
    text = "雨港。\n",
    ev = { source_index: 0, byte_start: 0, byte_end: 9, quote: "雨港。" };
  const content = fixtureContent(ev);
  const ref = {
    kind: "document",
    work_ref: c.work,
    document_id: "document_depth",
    revision_id: "revision_depth",
    sha256: createHash("sha256").update(text).digest("hex"),
  };
  c.sources.set(canonical(ref), { source_ref: ref, content: text });
  const result = await c.invoke("save_project", {
    content,
    source_refs: [ref],
    expected_revision: 0,
    expected_sha256: "",
    operation_key: "recovery-create",
  });
  assert.equal(result.status, "succeeded", JSON.stringify(result));
  return { c, r: result.data };
}
const base = (r: any, key: string) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: key,
});
test("深化结果丢失沿原键恢复，CAS与unknown不重复写", async () => {
  const { c, r } = await fixture(),
    input = { ...base(r, "depth-lost"), depth: r.object.content.depth };
  c.failAfterWrite = true;
  assert.equal((await c.invoke("save_depth", input)).status, "failed");
  const recovered = await c.invoke("save_depth", input);
  assert.equal(recovered.status, "succeeded");
  assert.equal(recovered.data.object.revision, 2);
  assert.equal(c.writes, 2);
  assert.equal(
    (await c.invoke("save_depth", { ...input, operation_key: "stale" })).error
      ?.code,
    "revision_conflict",
  );
  c.unknown = true;
  assert.equal(
    (
      await c.invoke("save_depth", {
        ...base(recovered.data, "unknown"),
        depth: r.object.content.depth,
      })
    ).error?.code,
    "unknown",
  );
  assert.equal(c.writes, 2);
});
test("旧客户端不可裁掉深化结构，旧修订仍保留", async () => {
  const { c, r } = await fixture(),
    content = structuredClone(r.object.content);
  delete content.depth;
  const out = await c.invoke("save_project", {
    ...base(r, "drop-depth"),
    content,
  });
  assert.equal(out.status, "failed");
  assert.equal(out.error?.code, "hetu.stale_schema");
  assert.equal(c.writes, 1);
});
