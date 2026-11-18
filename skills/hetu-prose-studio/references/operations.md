# 操作地图

由正式清单生成，执行前发现当前安装版Schema。

| 动作 | 用途 | 必填参数 | 效果 |
| --- | --- | --- | --- |
| list_projects | 查找方案 |  | read |
| get_project | 读取固定方案 | object_id | read |
| save_project | 保存完整方案 | expected_revision, expected_sha256, operation_key, content | managed_write |
| put_rule | 维护偏好 | object_id, expected_revision, expected_sha256, operation_key, rule | managed_write |
| remove_rule | 移除专业记录 | object_id, expected_revision, expected_sha256, operation_key, rule_id | managed_write |
| put_comparison | 维护比较 | object_id, expected_revision, expected_sha256, operation_key, comparison | managed_write |
| remove_comparison | 移除专业记录 | object_id, expected_revision, expected_sha256, operation_key, comparison_id | managed_write |
| put_refinement | 维护精修 | object_id, expected_revision, expected_sha256, operation_key, refinement | managed_write |
| preview_refinement | 预览选区精修 | object_id, source_index, replacements | read |
| verify_refinement | 核验局部字节 | object_id, refinement | read |
| build_context | 准备写作上下文 | object_id, goal, max_chars | read |
| get_source | 读取固定依据 | object_id, source_index | read |
| compare_versions | 比较专业修订 | object_id, from_revision, to_revision | read |
| export_project | 导出固定报告 | object_id, format | read |
| get_operation | 回读原操作 | operation_key | read |
| preview_rule_selection | 按本次目标选择偏好 | object_id, target | read |
| compile_context | 编译有作用域的接续上下文 | object_id, target, goal, max_chars | read |
| put_learning_sample | 保存固定修改样本 | object_id, expected_revision, expected_sha256, operation_key, sample | managed_write |
| put_rule_derivation | 保存有据偏好提议 | object_id, expected_revision, expected_sha256, operation_key, derivation | managed_write |
| put_conflict_resolution | 保存本次偏好冲突决定 | object_id, expected_revision, expected_sha256, operation_key, resolution | managed_write |
| put_rule_applicability | 保存规则适用条件 | object_id, expected_revision, expected_sha256, operation_key, application | managed_write |
| export_style_template | 导出所选风格模板 | object_id, rule_ids | read |
| preview_template_import | 预览风格模板映射 | object_id, template, mappings | read |
| preview_composition | 组合固定候选片段 | object_id, baseline_source_index, byte_start, byte_end, segments | read |
| save_depth | 保存明确专业深化结构 | object_id, expected_revision, expected_sha256, operation_key, depth | managed_write |
| inspect_basis | 读取同作品固定专业依据 | object_id, basis_index | read |
