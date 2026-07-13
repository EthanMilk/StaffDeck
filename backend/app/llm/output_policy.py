from __future__ import annotations


# Internal control-plane calls should not inherit the user-visible reply budget.
# Long-form code/content generation intentionally keeps a larger allowance.
OPERATION_MAX_OUTPUT_TOKENS: dict[str, int] = {
    "router.scene": 1024,
    "router.task_scheduler": 512,
    "reflection.review": 512,
    "general_skill.select": 512,
    "general_skill.plan": 16384,
    "general_skill.repair": 16384,
    "general_skill.review": 512,
    "general_skill.reply": 1536,
    "knowledge.document_route": 512,
    "knowledge.bucket_route": 512,
    "knowledge.discovery": 4096,
    "knowledge.ingest_bucket": 8192,
    "memory.rerank": 512,
    "memory.capture": 1024,
    "session.title": 512,
    "scheduled_task.detect": 1024,
    "feedback.analyze": 1024,
}

JSON_OUTPUT_CONTRACT = """

统一输出约束：
- 直接输出一个合法 JSON object；不要输出思考过程、分析、说明、Markdown 或代码围栏。
- 只保留任务 schema 和业务执行所需字段；未使用的可选字段可以省略。
- 不要复述输入、对话、记忆、文档或规则。reason、rationale、summary 等解释字段只写结论，默认一句话。
- code、content、reply 等承载实际结果的字段按任务需要完整输出，其他文本字段保持最短可用。
""".strip()


def operation_output_tokens(operation: str, configured_tokens: int) -> int:
    configured = max(1, int(configured_tokens or 1))
    limit = OPERATION_MAX_OUTPUT_TOKENS.get(operation)
    return configured if limit is None else min(configured, limit)


def compact_json_system_prompt(system_prompt: str) -> str:
    prompt = system_prompt.rstrip()
    if JSON_OUTPUT_CONTRACT in prompt:
        return prompt
    return f"{prompt}\n\n{JSON_OUTPUT_CONTRACT}"
