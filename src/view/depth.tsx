import React, { useState } from "react";
import { selection } from "../domain/depth.ts";
export function DepthView({
  p,
  invoke,
  onError,
}: {
  p: any;
  invoke: (a: string, i: any) => Promise<any>;
  onError: (e: any) => void;
}) {
  const [chapter, setChapter] = useState<string | null>(null),
    [character, setCharacter] = useState<string | null>(null),
    [result, setResult] = useState<any>(),
    [kind, setKind] = useState<string | null>(null),
    [tags, setTags] = useState<string[] | null>(null);
  const target = {
      chapter_ref: chapter,
      character_refs: character ? [character] : null,
      text_kind: kind,
      tags,
    },
    selected = selection(p, target);
  const option = (kind: string) => [
    ...new Set<string>(
      p.rules
        .filter((r: any) => r.scope.kind === kind)
        .map((r: any) => r.scope.target),
    ),
  ];
  return (
    <section aria-label="文风深化">
      <div className="row">
        <h3>本次适用范围</h3>
        <label>
          章节
          <select
            aria-label="本次章节"
            value={chapter ?? ""}
            onChange={(e) => setChapter(e.target.value || null)}
          >
            <option value="">尚未指定</option>
            {option("chapter").map((id, i) => (
              <option key={id} value={id}>
                章节规则 {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          人物
          <select
            aria-label="本次人物"
            value={character ?? ""}
            onChange={(e) => setCharacter(e.target.value || null)}
          >
            <option value="">尚未指定</option>
            {option("character").map((id, i) => (
              <option key={id} value={id}>
                人物规则 {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          文本类型
          <select
            aria-label="本次文本类型"
            value={kind ?? ""}
            onChange={(e) => setKind(e.target.value || null)}
          >
            <option value="">尚未指定</option>
            {[
              ...new Set<string>(
                (p.depth?.applications ?? []).flatMap((a: any) => a.text_kinds),
              ),
            ].map((id) => (
              <option key={id} value={id}>
                {id === "dialogue" ? "对白" : id}
              </option>
            ))}
          </select>
        </label>
        <label>
          场景
          <select
            aria-label="本次场景"
            value={tags === null ? "" : (tags[0] ?? "__none__")}
            onChange={(e) =>
              setTags(
                !e.target.value
                  ? null
                  : e.target.value === "__none__"
                    ? []
                    : [e.target.value],
              )
            }
          >
            <option value="">尚未指定</option>
            <option value="__none__">没有所列标签</option>
            {[
              ...new Set<string>(
                (p.depth?.applications ?? []).flatMap((a: any) => [
                  ...a.required_tags,
                  ...a.excluded_tags,
                ]),
              ),
            ].map((id) => (
              <option key={id} value={id}>
                {id === "quiet"
                  ? "平静场景"
                  : id === "battle"
                    ? "战斗场景"
                    : id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted">按本次人物与章节选择；未指定条件保留为未知。</p>
      {[
        ["适用规则", selected.matched],
        ["排除规则", selected.excluded],
        ["待补充条件", selected.uncertain],
      ].map(([label, rows]: any) => (
        <section key={label}>
          <h3>
            {label} {rows.length}
          </h3>
          {rows.map((r: any) => (
            <article key={r.rule_id}>
              <p>{p.rules.find((v: any) => v.id === r.rule_id)?.text}</p>
              <small>{r.reasons.join("；")}</small>
            </article>
          ))}
        </section>
      ))}
      {selected.conflicts.map((c: any, i: number) => (
        <p className="error" key={i}>
          偏好存在冲突：
          {c.rule_ids
            .map((id: string) => p.rules.find((r: any) => r.id === id)?.text)
            .join(" ／ ")}
        </p>
      ))}
      <button
        disabled={!selected.complete}
        onClick={() =>
          void invoke("compile_context", {
            target,
            goal: "沿固定偏好继续创作",
            max_chars: 12000,
          })
            .then(setResult)
            .catch(onError)
        }
      >
        编译本次上下文
      </button>
      {result && (
        <aside aria-label="编译结果">
          <p>
            已选 {result.selected_rule_ids.length} 条规则，{result.chars} 字符。
          </p>
          {result.selected_rule_ids.map((id:string)=><p key={id}>{p.rules.find((r:any)=>r.id===id)?.text}</p>)}<details><summary>固定上下文详情</summary><pre>{result.content}</pre></details>
        </aside>
      )}
      <h3>修改学习</h3>
      {!p.depth?.samples.length && (
        <p>尚未选择学习样本。向Agent说明哪次修改值得沿用。</p>
      )}
      {p.depth?.samples.map((s: any) => (
        <article key={s.id}>
          <div className="compare">
            <blockquote>{s.before.quote}</blockquote>
            <blockquote>{s.after.quote}</blockquote>
          </div>
          <p>{s.feedback || "尚无作者解释，推导只作为假设"}</p>
          <small>{s.usage === "once" ? "仅本次试写" : "可作为偏好依据"}</small>
        </article>
      ))}
      {p.depth?.derivations.map((d: any) => (
        <article key={d.id}>
          <h3>{d.rule.text}</h3>
          <p>{d.rationale}</p>
          <small>有据提议；未自动启用</small>
        </article>
      ))}
      <h3>本次冲突决定</h3>
      {p.depth?.resolutions.map((r: any) => (
        <p key={r.id}>{r.reason}</p>
      ))}
    </section>
  );
}
