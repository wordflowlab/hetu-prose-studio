# 文风工坊

> 河图洛书的文风工坊插件，由外部 Agent 操作，作者在专业工作面阅读、比较和反馈。

## 简介

作品、正文、正式设定及采纳由河图核心持有；本包只维护自己的专业数据。机器操作通过稳定 CLI/MCP 发现和调用，不依赖运行中的桌面窗口。

## 角色分流

- 使用与能力 Review → [功能清单](CAPABILITIES.md)。
- 接入 Codex → [包内 Skill](skills/hetu-prose-studio/SKILL.md)。
- 开发与验收 → [文档入口](docs/README.md)。

## 安装与使用

从[固定发行](https://github.com/wordflowlab/hetu-prose-studio/releases/tag/v0.1.0)下载运行包，由已连接的Agent核验归档和解压包摘要后通过河图安装。需要河图0.11.5或以上。安装后重新发现实际能力并读取同包Skill，无需另装同名Codex插件。

## 快速上手

开发需要 Node.js 25 与 npm，安装依赖后构建最终包：

```bash
npm ci
npm run build
npm run check
npm run test:unit
npm run test:machine
npm run test:ui
```

最终 `dist/` 由河图公开插件生命周期入口安装。执行前发现实际 Schema 与当前作品范围，先读取固定来源与已有成果。

## 边界

本包不内置 Agent、聊天或模型渠道。正文采纳、定稿、内容外发及外部副作用沿宿主独立合同决定。未知结果先回读原操作，冲突保留输入。
