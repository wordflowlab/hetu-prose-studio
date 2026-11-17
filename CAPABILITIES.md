# 文风工坊功能清单

本包拥有专业能力；宿主拥有正文、来源与作者决定。

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

默认流程、边界及验收见 [docs](docs/README.md)。
