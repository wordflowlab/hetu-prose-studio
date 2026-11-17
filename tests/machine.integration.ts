import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { test } from "node:test";
import manifest from "../contracts/plugin-manifest.json" with { type: "json" };
import { KIND, newProject } from "../src/domain/model.ts";
import { candidate } from "./support/creative.ts";
import { importText } from "./support/import.ts";
import { start } from "./support/machine.ts";
let n = 0;
const base = (r: any) => ({
  object_id: r.object.object_id,
  expected_revision: r.object.revision,
  expected_sha256: r.sha256,
  operation_key: "change-" + ++n,
});
function error(r: any) {
  return r.error?.code ?? r.data?.result?.error?.code;
}
test(
  "Codex稳定MCP与CLI全动作、固定小说、原操作、Skill和热插拔",
  { timeout: 600000 },
  async (t) => {
    const c = await start();
    t.diagnostic(c.directory);
    try {
      assert.equal(c.cap.access_mode, "open");
      assert.equal(c.cap.actions.length, manifest.contributions.actions.length);
      for (const resource of [
        undefined,
        "references/workflow.md",
        "references/operations.md",
      ]) {
        const r = await c.invoke("skills.read", {
          skill_id: manifest.contributions.skills[0].id,
          ...(resource ? { resource } : {}),
        });
        assert.ok(r.content.length > 100);
      }
      const originals = [
        "第1章 来信\r\n雨港。林溪守着旧邮局。\r\n",
        "第2章 来信\n雨港。陈舟带来一封空白的信。\n",
      ];
      const refs = await importText(c, originals);
      let content = newProject("雨港来信 · 专业方案");
      if (KIND === "novel_review") content.scope_indices = [0, 1];
      let r = await c.invoke("save_project", {
        content,
        source_refs: refs,
        expected_revision: 0,
        expected_sha256: "",
        operation_key: "project-create",
      });
      const initial = r;
      assert.equal(
        (await c.invoke("list_projects", { query: "雨港" })).objects.length,
        1,
      );
      assert.equal(
        (
          await c.invoke("get_source", {
            object_id: r.object.object_id,
            source_index: 0,
          })
        ).content,
        originals[0],
      );
      const q = Buffer.from(originals[0]),
        start = q.indexOf(Buffer.from("雨港。"));
      const ev = {
        source_index: 0,
        byte_start: start,
        byte_end: start + 9,
        quote: "雨港。",
      };
      const input = {
        ...base(r),
        content: { ...r.object.content, title: "雨港来信 · 第二版" },
      };
      r = await c.invoke("save_project", input);
      assert.equal((await c.invoke("save_project", input)).sha256, r.sha256);
      assert.equal(
        error(
          await c.raw("save_project", {
            ...input,
            content: { ...input.content, title: "不同输入" },
          }),
        ),
        "idempotency_conflict",
      );
      assert.equal(
        error(
          await c.raw("save_project", { ...input, operation_key: "stale" }),
        ),
        "revision_conflict",
      );
      assert.equal(
        (
          await c.invoke("get_operation", {
            operation_key: input.operation_key,
          })
        ).sha256,
        r.sha256,
      );
      if (KIND === "prose_studio") {
        const rule = {
          id: "pause",
          text: "对话保留停顿，不解释人物全部情绪",
          scope: { kind: "work", target: null },
          origin: "author_statement",
          status: "active",
          evidence: [ev],
          conflict_with: [],
        };
        r = await c.invoke("put_rule", { ...base(r), rule });
        r = await c.invoke("put_comparison", {
          ...base(r),
          comparison: {
            id: "directions",
            title: "开篇方向",
            goal: "比较等待与来信两种切入",
            candidates: [
              {
                id: "a",
                source_index: 0,
                strategy: "人物等待",
                tradeoffs: ["悬念缓慢"],
              },
              {
                id: "b",
                source_index: 1,
                strategy: "物件悬念",
                tradeoffs: ["人物延后"],
              },
            ],
          },
        });
        await c.invoke("build_context", {
          object_id: r.object.object_id,
          goal: "准备下一章",
          source_indices: [0, 1],
          max_chars: 12000,
        });
        const prev = await c.invoke("preview_refinement", {
          object_id: r.object.object_id,
          source_index: 0,
          replacements: [
            { byte_start: start, byte_end: start + 6, replacement: "海港" },
          ],
        });
        const generated = await candidate(c, prev.content, "refinement");
        r = await c.invoke("save_project", {
          ...base(r),
          source_refs: [...refs, generated.source_ref],
          content: r.object.content,
        });
        const refinement = {
          id: "fixed",
          title: "只改指定地点",
          baseline_source_index: 0,
          candidate_source_index: 2,
          patches: prev.patches,
        };
        const verified = await c.invoke("verify_refinement", {
          object_id: r.object.object_id,
          refinement,
        });
        assert.equal(verified.unchanged_outside, true);
        r = await c.invoke("put_refinement", { ...base(r), refinement });
        const taskRead = await c.ok("hetu_read_creative_task", {
          task_ref: generated.task.task_ref,
        });
        assert.ok(taskRead.request);
        await c.invoke("build_context", {
          object_id: r.object.object_id,
          goal: "沿精修意见继续下一章",
          source_indices: [0, 2],
          max_chars: 12000,
        });
        r = await c.invoke("remove_comparison", {
          ...base(r),
          comparison_id: "directions",
        });
        r = await c.invoke("remove_rule", { ...base(r), rule_id: "pause" });
      }
      if (KIND === "novel_review") {
        r = await c.invoke("put_check", {
          ...base(r),
          check: {
            id: "continuity-first",
            domain: "continuity",
            status: "inconclusive",
            source_indices: [0],
            summary: "尚缺寄件人的来源，保留疑点",
          },
        });
        r = await c.invoke("put_issue", {
          ...base(r),
          issue: {
            id: "letter",
            title: "寄件人未明",
            domain: "promises",
            severity: "suggestion",
            description: "确认这是有意悬念",
            evidence: [ev],
            disposition: "open",
            candidate_source_index: null,
            resolution: "",
            resolution_source_indices: [],
          },
        });
        r = await c.invoke("set_disposition", {
          ...base(r),
          issue_id: "letter",
          disposition: "dismissed",
          resolution: "作者有意保留到下一卷",
          resolution_source_indices: [],
        });
        await c.invoke("run_local_checks", {
          object_id: r.object.object_id,
          source_index: 0,
        });
        const cov = await c.invoke("get_coverage", {
          object_id: r.object.object_id,
        });
        assert.equal(cov.domains[1].sources[0].status, "unchecked");
        await c.invoke("build_review_context", {
          object_id: r.object.object_id,
          goal: "复核下一卷的悬念兑现",
          max_chars: 12000,
        });
      }
      if (KIND === "novel_atlas") {
        for (const [id, name] of [
          ["lin", "林溪"],
          ["chen", "陈舟"],
        ])
          r = await c.invoke("put_node", {
            ...base(r),
            node: {
              id,
              name,
              kind: "character",
              summary: "旧邮局来信的相关人物",
              status: "extracted",
              evidence: [ev],
              canonical_source_index: null,
              entity_ref: null,
              attributes: [],
            },
          });
        r = await c.invoke("put_relation", {
          ...base(r),
          relation: {
            id: "friends",
            from: "lin",
            to: "chen",
            kind: "旧识",
            summary: "来信串联的二人",
            evidence: [ev],
          },
        });
        r = await c.invoke("put_event", {
          ...base(r),
          event: {
            id: "arrival",
            title: "空白来信",
            summary: "陈舟带来一封空信",
            participants: ["lin", "chen"],
            story_time: null,
            narrative_order: 1,
            evidence: [ev],
          },
        });
        r = await c.invoke("set_layout", {
          ...base(r),
          layout: [
            { node_id: "lin", x: 150, y: 200 },
            { node_id: "chen", x: 550, y: 200 },
          ],
        });
        for (const view of [
          "overview",
          "characters",
          "relations",
          "locations",
          "timeline",
          "growth",
          "items",
        ])
          await c.invoke("get_projection", {
            object_id: r.object.object_id,
            view,
          });
        // project_blueprint错误类型仍必须实际命中并拒绝，成功投影由固定设定场景另验。
        const bp = await c.raw("project_blueprint", {
          object_id: r.object.object_id,
          source_index: 0,
        });
        assert.ok(error(bp));
        c.actions.add("project_blueprint");
        r = await c.invoke("remove_relation", {
          ...base(r),
          relation_id: "friends",
        });
        r = await c.invoke("remove_event", { ...base(r), event_id: "arrival" });
        r = await c.invoke("set_layout", { ...base(r), layout: [] });
        r = await c.invoke("remove_node", { ...base(r), node_id: "chen" });
      }
      const comp = await c.invoke("compare_versions", {
        object_id: r.object.object_id,
        from_revision: 1,
        to_revision: r.object.revision,
      });
      assert.equal(comp.from_ref.sha256, initial.sha256);
      for (const format of KIND === "novel_atlas"
        ? ["json", "markdown", "html"]
        : ["json", "markdown"]) {
        let offset = 0,
          body = "";
        do {
          const out = await c.invoke("export_project", {
            object_id: r.object.object_id,
            revision: r.object.revision,
            format,
            offset,
            max_bytes: 4096,
          });
          body += out.content;
          if (out.next_offset === null) break;
          offset = out.next_offset;
        } while (true);
        assert.ok(body.length > 100);
      }
      const fixed = await c.invoke("get_project", {
        object_id: r.object.object_id,
        revision: r.object.revision,
      });
      assert.equal(fixed.sha256, r.sha256);
      const cli = c.cli("hetu.plugins.invoke", {
        ...c.binding,
        capabilities_sha256: c.cap.capabilities_sha256,
        action: "get_project",
        arguments: {
          object_id: r.object.object_id,
          revision: r.object.revision,
        },
      });
      assert.equal(cli.data.result.data.sha256, r.sha256);
      await c.apply("disable");
      assert.notEqual(
        (await c.raw("get_project", { object_id: r.object.object_id })).status,
        "succeeded",
      );
      await c.apply("enable");
      await c.discover();
      assert.equal(
        (await c.invoke("get_project", { object_id: r.object.object_id }))
          .sha256,
        r.sha256,
      );
      await c.apply("uninstall");
      assert.notEqual(
        (await c.call("hetu_plugins_capabilities", c.binding)).status,
        "succeeded",
      );
      await c.apply("install");
      await c.discover();
      assert.equal(
        (await c.invoke("get_project", { object_id: r.object.object_id }))
          .sha256,
        r.sha256,
      );
      assert.deepEqual(
        (await c.client.listTools()).tools.map((x: any) => x.name),
        c.tools,
      );
      const missed = manifest.contributions.actions
        .map((x) => x.id)
        .filter((id) => !c.actions.has(id));
      assert.deepEqual(missed, []);
      await mkdir("docs/research", { recursive: true });
      await writeFile(
        "docs/research/runtime-acceptance.json",
        JSON.stringify(
          {
            date: new Date().toISOString(),
            platform: process.platform + " " + process.arch,
            package_sha256: c.pkg.package_sha256,
            actions: [...c.actions],
            cli_mcp: true,
            skill_resources: true,
            hotplug: true,
            uninstall_reinstall: true,
                windows: false,
            limits: [
              "固定候选生成与正式设定投影由独立旅程验收，未以错误分支代替成功证据。",
            ],
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      await c.client.close();
    }
  },
);
