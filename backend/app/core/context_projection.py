from __future__ import annotations

from typing import Any

from app.core.conversation_context import build_conversation_context


CONTROL_CONTEXT_TOKEN_BUDGET = 12_000
KNOWLEDGE_HISTORY_LIMIT = 1
KNOWLEDGE_EVIDENCE_LIMIT = 6
KNOWLEDGE_CONCEPT_LIMIT = 8
KNOWLEDGE_DOCUMENT_LIMIT = 5


def compact_knowledge_context(
    items: list[dict[str, Any]] | None,
    *,
    max_items: int = KNOWLEDGE_HISTORY_LIMIT,
) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    selected = [item for item in items if isinstance(item, dict)][-max(1, max_items) :]
    return [_compact_knowledge_result(item) for item in selected]


def compact_step_result(payload: dict[str, Any]) -> dict[str, Any]:
    projected = dict(payload)
    projected["knowledge_results"] = compact_knowledge_context(
        payload.get("knowledge_results") if isinstance(payload.get("knowledge_results"), list) else []
    )
    return projected


def compact_conversation_context(
    context: dict[str, object] | None,
    *,
    token_budget: int = CONTROL_CONTEXT_TOKEN_BUDGET,
) -> dict[str, object]:
    if not isinstance(context, dict):
        return build_conversation_context([], token_budget)
    messages = context.get("messages")
    if not isinstance(messages, list):
        return {key: value for key, value in context.items() if key != "messages"}
    return build_conversation_context(
        [message for message in messages if isinstance(message, dict)], token_budget
    )


def compact_current_step(
    content: dict[str, Any] | None,
    step_id: str | None,
) -> dict[str, Any] | None:
    if not isinstance(content, dict):
        return None
    resolved_step_id = step_id or _optional_text(content.get("start_node_id"))
    node = next(
        (
            item
            for item in _skill_nodes(content)
            if isinstance(item, dict)
            and _optional_text(item.get("node_id") or item.get("step_id")) == resolved_step_id
        ),
        None,
    )
    return _project_node(node) if node else None


def compact_step_skill_context(
    content: dict[str, Any] | None,
    step_id: str | None,
    *,
    skill_id: str | None = None,
    name: str | None = None,
    description: str | None = None,
) -> dict[str, Any] | None:
    if not isinstance(content, dict):
        return None
    current_step = compact_current_step(content, step_id)
    current_step_id = _optional_text((current_step or {}).get("node_id"))
    adjacent_edges = [
        _project_edge(edge)
        for edge in content.get("edges", [])
        if isinstance(edge, dict)
        and _optional_text(edge.get("source_node_id")) == current_step_id
    ]
    target_ids = {
        _optional_text(edge.get("next_node_id") or edge.get("target_node_id"))
        for edge in adjacent_edges
    }
    target_steps = [
        _project_node(node)
        for node in _skill_nodes(content)
        if isinstance(node, dict)
        and _optional_text(node.get("node_id") or node.get("step_id")) in target_ids
    ]
    return _without_empty(
        {
            "skill_id": skill_id or content.get("skill_id"),
            "name": name or content.get("name"),
            "description": description or content.get("description"),
            "required_info": content.get("required_info"),
            "slot_filling_policy": content.get("slot_filling_policy"),
            "response_rules": content.get("response_rules"),
            "current_step": current_step,
            "adjacent_edges": adjacent_edges,
            "target_steps": target_steps,
        }
    )


def compact_router_decision(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    projected = _without_empty(
        {
            key: payload.get(key)
            for key in (
                "decision",
                "selected_task_id",
                "target_skill_id",
                "target_step_id",
                "confidence",
                "user_intent",
                "reason",
                "clarification_question",
                "slot_hints",
            )
        }
    )
    return projected or None


def compact_response_step_result(payload: dict[str, Any]) -> dict[str, Any] | None:
    projected = _without_empty(
        {
            key: payload.get(key)
            for key in ("reply", "next_step_id", "is_step_completed", "handoff")
        }
    )
    return projected or None


def compact_citation_hints(citations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            key: item.get(key)
            for key in (
                "label",
                "kind",
                "title",
                "source_path",
                "section_path",
            )
            if item.get(key) not in (None, "")
        }
        for item in citations
        if isinstance(item, dict)
    ]


def compact_memory_context(items: list[dict[str, Any]] | None) -> str:
    if not isinstance(items, list):
        return ""
    lines: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        content = _short_text(item.get("content"), 1_000)
        if content and content not in lines:
            lines.append(content)
    return "\n".join(f"- {line}" for line in lines)


def compact_pending_tasks(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not isinstance(items, list):
        return []
    tasks: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        task = _without_empty(
            {
                "task_id": item.get("task_id"),
                "status": item.get("status"),
                "skill_id": item.get("skill_id") or item.get("target_skill_id"),
                "step_id": item.get("step_id") or item.get("target_step_id"),
                "slots": item.get("slots") or item.get("slot_hints"),
                "intent_summary": _short_text(
                    item.get("intent_summary") or item.get("user_intent"), 300
                ),
                "source_message": _short_text(item.get("source_message"), 500),
                "resume_policy": item.get("resume_policy"),
            }
        )
        if task:
            tasks.append(task)
    return tasks


def compact_awaiting_input(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    projected = _without_empty(
        {
            "skill_id": value.get("skill_id"),
            "step_id": value.get("step_id"),
            "expected_fields": value.get("expected_fields"),
            "question_summary": _short_text(value.get("question_summary"), 500),
        }
    )
    return projected or None


def _compact_knowledge_result(item: dict[str, Any]) -> dict[str, Any]:
    evidence = _compact_evidence(item.get("evidence_pack"))
    if not evidence:
        evidence = _compact_evidence(item.get("chunks"))
    return {
        "query": item.get("query"),
        "selected_documents": _compact_documents(item.get("selected_documents")),
        "selected_buckets": _compact_buckets(item.get("selected_buckets")),
        "selected_concepts": _compact_concepts(item.get("selected_concepts")),
        "okf_citations": _compact_citations(item.get("okf_citations")),
        "evidence_pack": evidence,
    }


def _compact_documents(value: object) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for item in _dict_items(value, KNOWLEDGE_DOCUMENT_LIMIT):
        documents.append(
            {
                "title": _short_text(item.get("title") or item.get("filename"), 180),
                "filename": _short_text(item.get("filename"), 180),
                "summary": _short_text(item.get("summary"), 600),
            }
        )
    return documents


def _compact_buckets(value: object) -> list[dict[str, Any]]:
    buckets: list[dict[str, Any]] = []
    for item in _dict_items(value, KNOWLEDGE_DOCUMENT_LIMIT):
        buckets.append(
            {
                "title": _short_text(item.get("title"), 180),
                "summary": _short_text(item.get("summary"), 600),
            }
        )
    return buckets


def _compact_concepts(value: object) -> list[dict[str, Any]]:
    concepts: list[dict[str, Any]] = []
    for item in _dict_items(value, KNOWLEDGE_CONCEPT_LIMIT):
        concepts.append(
            {
                "title": _short_text(item.get("title") or item.get("name"), 180),
                "summary": _short_text(item.get("summary"), 300),
                "content": _short_text(item.get("content") or item.get("content_md"), 600),
            }
        )
    return concepts


def _compact_citations(value: object) -> list[dict[str, Any]]:
    citations: list[dict[str, Any]] = []
    for item in _dict_items(value, KNOWLEDGE_EVIDENCE_LIMIT):
        citations.append(
            {
                "title": _short_text(item.get("title") or item.get("label"), 180),
                "source_path": _short_text(
                    item.get("source_path") or item.get("path") or item.get("uri"), 300
                ),
            }
        )
    return citations


def _compact_evidence(value: object) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for item in _dict_items(value, KNOWLEDGE_EVIDENCE_LIMIT):
        evidence.append(
            {
                "source_path": _short_text(item.get("source_path") or item.get("source_ref"), 300),
                "section_path": _short_text(item.get("section_path"), 300),
                "summary": _short_text(item.get("summary"), 300),
                "content": _short_text(item.get("content") or item.get("excerpt"), 800),
                "relevance_score": item.get("relevance_score"),
            }
        )
    return evidence


def _dict_items(value: object, limit: int) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)][:limit]


def _skill_nodes(content: dict[str, Any]) -> list[dict[str, Any]]:
    value = content.get("nodes")
    if not isinstance(value, list):
        value = content.get("steps")
    return [item for item in value or [] if isinstance(item, dict)]


def _project_node(node: dict[str, Any]) -> dict[str, Any]:
    projected = {"node_id": node.get("node_id") or node.get("step_id")}
    projected.update(
        {
            key: node.get(key)
            for key in (
                "type",
                "name",
                "instruction",
                "optional",
                "condition",
                "expected_user_info",
                "allowed_actions",
                "knowledge_scope",
                "retry_policy",
            )
        }
    )
    return _without_empty(projected)


def _project_edge(edge: dict[str, Any]) -> dict[str, Any]:
    return _without_empty(
        {
            key: edge.get(key)
            for key in (
                "source_node_id",
                "target_node_id",
                "next_node_id",
                "condition",
                "label",
                "priority",
            )
        }
    )


def _short_text(value: object, limit: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _optional_text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _without_empty(value: dict[str, Any]) -> dict[str, Any]:
    return {
        key: item
        for key, item in value.items()
        if item is not None and item != "" and item != [] and item != {}
    }
