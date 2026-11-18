import { candidate } from "../support/creative.ts";
import { preview } from "../../src/application/project.ts";
import { _electron as electron, expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import manifest from "../../contracts/plugin-manifest.json" with { type: "json" };
import { KIND, newProject } from "../../src/domain/model.ts";
import { importText } from "../support/import.ts";
import { host, start } from "../support/machine.ts";
test("真实Electron专业工作面、AI交接、固定导出、冲突与重开", async ({}, info) => {
  const c = await start();
  let app: any;
  try {
    const text = "雨港。林溪在旧邮局等信。\n",
      refs = await importText(c, [text]),
      evidence = [
        { source_index: 0, byte_start: 0, byte_end: 9, quote: "雨港。" },
      ];
    const p = newProject("雨港来信 · 作者审阅");
    if (KIND === "prose_studio") {
      p.rules = [
        {
          id: "r1",
          text: "让停顿传达情绪，避免替人物解释",
          scope: { kind: "work", target: null },
          origin: "author_statement",
          status: "active",
          evidence,
          conflict_with: [],
        },
      ];
      p.comparisons = [
        {
          id: "c1",
          title: "从等待还是来信切入",
          goal: "比较开篇叙事方向",
          candidates: [
            {
              id: "a",
              source_index: 0,
              strategy: "从林溪等待切入",
              tradeoffs: ["人物贴近，悬念较慢"],
            },
            {
              id: "b",
              source_index: 0,
              strategy: "从陌生信件切入",
              tradeoffs: ["悬念直接，人物延后"],
            },
          ],
        },
      ];
    }
    if (KIND === "novel_review") {
      p.scope_indices = [0];
      p.checks = [
        {
          id: "c1",
          domain: "characters",
          status: "inconclusive",
          source_indices: [0],
          summary: "等待动机尚未交代，保留到后文复核",
        },
      ];
      p.issues = [
        {
          id: "i1",
          title: "等待动机需要后文回应",
          domain: "promises",
          severity: "suggestion",
          description: "核对这是否是有意保留的悬念",
          evidence,
          disposition: "open",
          candidate_source_index: null,
          resolution: "",
          resolution_source_indices: [],
        },
      ];
    }
    if (KIND === "novel_atlas") {
      p.nodes = [
        {
          id: "lin",
          name: "林溪",
          kind: "character",
          summary: "旧邮局里等待来信的人",
          status: "extracted",
          evidence,
          canonical_source_index: null,
          entity_ref: null,
          attributes: [{ key: "当前状态", value: "等待未知寄件人" }],
        },
        {
          id: "post",
          name: "雨港旧邮局",
          kind: "location",
          summary: "来信与旧事的交汇处",
          status: "extracted",
          evidence,
          canonical_source_index: null,
          entity_ref: null,
          attributes: [],
        },
      ];
      p.relations = [
        {
          id: "r1",
          from: "lin",
          to: "post",
          kind: "守候",
          summary: "林溪在此等信",
          evidence,
        },
      ];
      p.events = [
        {
          id: "e1",
          title: "等一封信",
          summary: "林溪独自在邮局守候",
          participants: ["lin"],
          story_time: null,
          narrative_order: 1,
          evidence,
        },
      ];
    }
    if (KIND === "prose_studio") {
      const result = preview(text, [
        { byte_start: 0, byte_end: 6, replacement: "海港" },
      ]);
      const generated = await candidate(c, result.content, "ui-refinement");
      refs.push(generated.source_ref);
      p.refinements = [
        {
          id: "f1",
          title: "只调整地点称呼",
          baseline_source_index: 0,
          candidate_source_index: 1,
          patches: result.patches,
        },
      ];
    }
    let record = await c.invoke("save_project", {
      content: p,
      source_refs: refs,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "ui-seed",
    });
    app = await electron.launch({
      executablePath:
        process.env.HETU_PACKAGED_APP ??
        createRequire(path.join(host, "package.json"))("electron"),
      args: process.env.HETU_PACKAGED_APP
        ? []
        : [path.join(host, "apps/desktop")],
      env: c.env,
    });
    const exportPath = path.join(
      c.directory,
      KIND === "novel_atlas" ? "图鉴.html" : "报告.md",
    );
    await app.evaluate(
      ({ dialog }: any, { workspace, exportPath }: any) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [workspace],
        });
        dialog.showSaveDialog = async () => ({
          canceled: false,
          filePath: exportPath,
        });
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
      },
      { workspace: c.workspace, exportPath },
    );
    const shell = await app.firstWindow();
    await shell
      .getByRole("button", { name: "打开作品", exact: true })
      .first()
      .click();
    await shell
      .getByRole("button", { name: "雨港来信", exact: false })
      .first()
      .click();
    const open = async () => {
      await shell
        .getByRole("button", { name: manifest.display["zh-CN"], exact: true })
        .click();
      await expect
        .poll(() =>
          app
            .context()
            .pages()
            .some((p: any) => p.url().startsWith("hetu-plugin:")),
        )
        .toBe(true);
      return app
        .context()
        .pages()
        .find((p: any) => p.url().startsWith("hetu-plugin:"));
    };
    let page: any = await open();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await page.setViewportSize({ width: 1360, height: 900 });
    await expect(
      page.getByRole("heading", { name: "雨港来信 · 作者审阅", exact: true }),
    ).toBeVisible();
    const buttons = await page
      .getByRole("navigation", { name: "专业视图" })
      .getByRole("button")
      .all();
    for (const [index, b] of buttons.entries()) {
      await b.click();
      await expect(b).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("alert")).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath(`view-${index}.png`),
        fullPage: true,
      });
    }
    if (KIND === "prose_studio") {
      await page.getByRole("button", { name: "局部精修", exact: true }).click();
      await page.getByRole("button", { name: "比较精修", exact: true }).click();
      await expect(page.getByLabel("固定依据")).toContainText("海港");
      await page.getByRole("button", { name: "关闭依据", exact: true }).click();
    }
    await buttons[0].click();
    const display=await page.context().newCDPSession(page);
    await display.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-transparency",value:"no-preference"},{name:"prefers-contrast",value:"no-preference"},{name:"forced-colors",value:"none"}]});
    expect(await page.evaluate(()=>matchMedia("(prefers-reduced-transparency:reduce)").matches)).toBe(false);

    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundImage,
      ),
    ).toContain("gradient");
    await display.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-transparency",value:"reduce"}]});
    expect(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage)).toBe("none");
    await display.send("Emulation.setEmulatedMedia",{features:[{name:"prefers-reduced-transparency",value:"no-preference"},{name:"prefers-contrast",value:"no-preference"}]});

    await page.getByRole("button", { name: "让AI处理", exact: true }).focus();
    await expect(
      page.getByRole("button", { name: "让AI处理", exact: true }),
    ).toBeFocused();
    await page.getByLabel("创作目标").fill("依据当前方案，准备下一轮创作");
    await page.getByRole("button", { name: "让AI处理", exact: true }).click();
    await expect(page.locator(".status")).toContainText("已复制接续说明");
    const copied = await app.evaluate(({ clipboard }: any) =>
      clipboard.readText(),
    );
    expect(copied).toContain(record.object.object_id);
    expect(copied).toContain("准备下一轮");
    await page.getByLabel("创作目标").fill("");
    await page.getByText("版本与高级操作", { exact: true }).click();
    await page.getByRole("button", { name: "导出报告", exact: true }).click();
    await expect(page.locator(".status")).toContainText("已准备固定版本交付");
    expect((await readFile(exportPath, "utf8")).length).toBeGreaterThan(100);
    await page.screenshot({
      path: info.outputPath("workspace-light.png"),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.colorScheme = "dark";
    });
    await page.screenshot({
      path: info.outputPath("workspace-dark.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 760, height: 860 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: info.outputPath("workspace-narrow.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "编辑专业数据", exact: true })
      .click();
    const editor = page.getByRole("textbox", { name: "专业数据", exact: true });
    const edited = { ...p, title: "保留作者的本地编辑" };
    await editor.fill(JSON.stringify(edited, null, 2));
    record = await c.invoke("save_project", {
      object_id: record.object.object_id,
      expected_revision: record.object.revision,
      expected_sha256: record.sha256,
      source_refs: refs,
      content: { ...p, title: "Agent已更新的版本" },
      operation_key: "concurrent",
    });
    await page
      .getByRole("button", { name: "保存专业修订", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(/变化|冲突|基线/);
    await expect(editor).toHaveValue(JSON.stringify(edited, null, 2));
    await expect(
      page.getByRole("button", { name: "回读原操作", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "返回作品", exact: true }).click();
    await expect
      .poll(
        () =>
          app
            .context()
            .pages()
            .filter((p: any) => p.url().startsWith("hetu-plugin:")).length,
      )
      .toBe(0);
    page = await open();
    await page.getByText("版本与高级操作", { exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "专业数据", exact: true }),
    ).toHaveValue(JSON.stringify(edited, null, 2));
    await page
      .getByRole("button", { name: "保存专业修订", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(/变化|冲突|基线/);
    await expect(
      page.getByRole("textbox", { name: "专业数据", exact: true }),
    ).toHaveValue(JSON.stringify(edited, null, 2));
    expect(errors).toEqual([]);
    expect(
      (await c.invoke("get_project", { object_id: record.object.object_id }))
        .sha256,
    ).toBe(record.sha256);
  } finally {
    await app?.close();
    await c.client.close();
  }
});
