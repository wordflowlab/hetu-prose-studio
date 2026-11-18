import { writeFile } from "node:fs/promises";
import { _electron as electron, expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";
import { fixtureContent } from "../support/depth-scenario.ts";
import { importText } from "../support/import.ts";
import { host, start } from "../support/machine.ts";

test("有数据的专业深化工作面、真实计算、浅暗窄窗与键盘", async ({}, info) => {
  const c = await start();
  let app: any;
  try {
    const refs = await importText(c, ["雨港。林溪在旧邮局等信。\n雨港。\n"]),
      ev = { source_index: 0, byte_start: 0, byte_end: 9, quote: "雨港。" };
    const content = fixtureContent(ev);
    content.depth.samples = [
      {
        id: "sample",
        before: ev,
        after: ev,
        feedback: "让停顿传递情绪，只用于这个人物",
        usage: "reusable",
      },
    ];
    const record = await c.invoke("save_project", {
      content,
      source_refs: refs,
      expected_revision: 0,
      expected_sha256: "",
      operation_key: "ui-depth",
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
    await app.evaluate(
      ({ dialog }: any, { workspace }: any) => {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [workspace],
        });
        dialog.showMessageBox = async () => ({
          response: 1,
          checkboxChecked: false,
        });
      },
      { workspace: c.workspace },
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
    await shell.getByRole("button", { name: "文风工坊", exact: true }).click();
    await expect
      .poll(() =>
        app
          .context()
          .pages()
          .some((p: any) => p.url().startsWith("hetu-plugin:")),
      )
      .toBe(true);
    const page: any = app
        .context()
        .pages()
        .find((p: any) => p.url().startsWith("hetu-plugin:")),
      errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    await expect(
      page.getByRole("heading", {
        name: record.object.content.title,
        exact: true,
      }),
    ).toBeVisible();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value: string) => {
        document.documentElement.style.colorScheme = value;
      }, theme);
      for (const [width, height] of [
        [1360, 900],
        [760, 860],
      ]) {
        await page.setViewportSize({ width, height });
        for (const label of ["文风深化"]) {
          await page.getByRole("button", { name: label, exact: true }).click();
          await page.screenshot({
            path: info.outputPath(
              "before-" + theme + "-" + width + "-" + label + ".png",
            ),
            fullPage: true,
          });
          await writeFile(
            info.outputPath(
              "before-" + theme + "-" + width + "-" + label + ".txt",
            ),
            await page.locator("body").innerText(),
          );
          expect(errors).toEqual([]);
          await page.getByLabel("本次文本类型",{exact:true}).selectOption("");
          await page.getByLabel("本次场景",{exact:true}).selectOption("");
          await page
            .getByLabel("本次人物", { exact: true })
            .selectOption("lin");
          await page.getByLabel("本次章节", { exact: true }).selectOption("");
          await expect(
            page.getByRole("button", { name: "编译本次上下文", exact: true }),
          ).toBeDisabled();
          await page
            .getByLabel("本次文本类型", { exact: true })
            .selectOption("dialogue");
          await page
            .getByLabel("本次场景", { exact: true })
            .selectOption("quiet");
          await page
            .getByRole("button", { name: "编译本次上下文", exact: true })
            .click();
          await expect(page.getByLabel("编译结果")).toContainText(
            "已选 2 条规则",
          );
          await expect(page.getByRole("alert")).toHaveCount(0);
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true);
          await page.screenshot({
            path: info.outputPath(theme + "-" + width + "-" + label + ".png"),
            fullPage: true,
          });
        }
      }
    }
    await page.getByRole("button", { name: "让AI处理", exact: true }).focus();
    await expect(
      page.getByRole("button", { name: "让AI处理", exact: true }),
    ).toBeFocused();
    expect(errors).toEqual([]);
  } finally {
    await app?.close();
    await c.client.close();
  }
});
