---
name: hetu-prose-studio
description: 在河图洛书中使用hetu-prose-studio专业插件；经宿主动态发现、读取固定作品与已有成果，维护专业结构、核对依据并接续创作。
---

# 专业插件协作

这是河图插件同包方法，由稳定CLI/MCP的skills.read读取；不是独立Codex插件。

1. 发现宿主实际能力、安装插件和当前动作Schema，固定确切management_ref、WorkRef、package_sha256与capabilities_sha256。不要复用其他作品或旧包的范围。
2. 读取[工作流程](references/workflow.md)与[操作地图](references/operations.md)。先读固定文稿、设定和已有专业对象，不以目录代替整书阅读。
3. 根据作者目标准备完整专业成果，用显式来源与UTF-8半开区间说明依据；不要求作者填写JSON或操作画布。
4. 写入保留原输入、CAS和operation_key。未知先get_operation；明确not_found才沿原输入执行，冲突保留输入并比较新基线。
5. 回读固定对象、专业检查和可视化投影。候选、报告和规划状态不等于正文采纳、正式设定或定稿；独立决定通过宿主已有合同。
6. 能力不足先完善宿主公开能力，不直写受管文件、不另建模型调用、不偷读其他插件目录。安装启用后不增加逐插件作品授权。

停用、升级或卸载后重新发现，旧能力不可继续调用。只报告实际阅读范围、真实检查和已回读结果。
