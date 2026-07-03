from datetime import datetime, timedelta

from app.api.chat import _build_turn_traces, _message_turn_ids_from_events
from app.db.models import AgentEvent, Message


def test_turn_trace_uses_router_skill_hint_for_legacy_step_event_without_skill_id() -> None:
    started_at = datetime(2026, 6, 5, 6, 35, 4)
    messages = [
        Message(
            id="msg_user",
            tenant_id="tenant_demo",
            session_id="session_test",
            role="user",
            content="帮我下单a2，实际发货a3",
            created_at=started_at,
        )
    ]
    events = [
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_test",
            event_type="user_message_received",
            payload_json={"message": "帮我下单a2，实际发货a3"},
            created_at=started_at,
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_test",
            event_type="router_decision_created",
            payload_json={
                "decision": "continue_current_skill",
                "target_skill_id": "skill_purchase_001",
                "target_step_id": "confirm_purchase",
                "user_intent": "下单",
                "reason": "继续购买流程",
            },
            created_at=started_at + timedelta(seconds=1),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_test",
            event_type="skill_step_changed",
            payload_json={"from_step_id": "confirm_purchase", "to_step_id": "end"},
            created_at=started_at + timedelta(seconds=2),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_test",
            event_type="assistant_message_created",
            payload_json={"reply": "已完成"},
            created_at=started_at + timedelta(seconds=3),
        ),
    ]

    traces = _build_turn_traces(messages, events, {"skill_purchase_001": "购买商品流程"})

    skill_lines = [
        line
        for line in traces[0]["lines"]
        if line["kind"] == "skill" and "购买商品流程" in line["text"]
    ]
    assert skill_lines
    assert skill_lines[0]["text"] == "推进技能 购买商品流程"
    assert skill_lines[0]["detail"] == "step end"


def test_turn_trace_falls_back_to_knowledge_citations_without_events() -> None:
    started_at = datetime(2026, 6, 20, 10, 0, 0)
    messages = [
        Message(
            id="msg_user",
            tenant_id="tenant_demo",
            session_id="session_citation",
            role="user",
            content="引用规则是什么？",
            created_at=started_at,
        ),
        Message(
            id="msg_assistant",
            tenant_id="tenant_demo",
            session_id="session_citation",
            role="assistant",
            content="回答需要展示知识引用。[1]",
            metadata_json={
                "knowledge_citations": [
                    {
                        "title": "知识引用测试说明 / 引用规则",
                        "source_title": "citation-demo.md",
                    }
                ]
            },
            created_at=started_at + timedelta(seconds=1),
        ),
    ]

    traces = _build_turn_traces(messages, [], {})

    assert len(traces) == 1
    assert traces[0]["turn_id"] == "msg_user"
    assert [line["text"] for line in traces[0]["lines"]] == [
        "执行记录",
        "识别为业务资料问答",
        "查询业务资料",
        "读取业务资料",
        "生成带引用回答",
    ]


def test_turn_trace_uses_message_id_for_repeated_user_text() -> None:
    started_at = datetime(2026, 7, 3, 10, 0, 0)
    messages = [
        Message(
            id="msg_user_first",
            tenant_id="tenant_demo",
            session_id="session_repeat",
            role="user",
            content="你好",
            created_at=started_at,
        ),
        Message(
            id="msg_assistant_first",
            tenant_id="tenant_demo",
            session_id="session_repeat",
            role="assistant",
            content="你好！",
            created_at=started_at + timedelta(seconds=2),
        ),
        Message(
            id="msg_user_second",
            tenant_id="tenant_demo",
            session_id="session_repeat",
            role="user",
            content="你好",
            created_at=started_at + timedelta(seconds=10),
        ),
        Message(
            id="msg_assistant_second",
            tenant_id="tenant_demo",
            session_id="session_repeat",
            role="assistant",
            content="请问有什么可以帮您？",
            created_at=started_at + timedelta(seconds=12),
        ),
    ]
    events = [
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="user_message_received",
            payload_json={"message_id": "msg_user_first", "message": "你好"},
            created_at=started_at,
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="assistant_message_created",
            payload_json={"reply": "你好！"},
            created_at=started_at + timedelta(seconds=2),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="user_message_received",
            payload_json={"message_id": "msg_user_second", "message": "你好"},
            created_at=started_at + timedelta(seconds=10),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="router_decision_created",
            payload_json={"decision": "answer_only", "user_intent": "问候", "reason": "第二轮问候"},
            created_at=started_at + timedelta(seconds=11),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="assistant_message_created",
            payload_json={"reply": "请问有什么可以帮您？"},
            created_at=started_at + timedelta(seconds=12),
        ),
    ]

    traces = _build_turn_traces(messages, events, {})

    assert [trace["turn_id"] for trace in traces] == ["msg_user_first", "msg_user_second"]
    assert traces[1]["user_message_id"] == "msg_user_second"
    assert any(line["text"] == "判断意图 问候" and line["detail"] == "第二轮问候" for line in traces[1]["lines"])


def test_turn_trace_does_not_merge_interleaved_repeated_turns() -> None:
    started_at = datetime(2026, 7, 3, 10, 30, 0)
    messages = [
        Message(
            id="msg_user_first",
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            role="user",
            content="你好",
            created_at=started_at,
        ),
        Message(
            id="msg_assistant_first",
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            role="assistant",
            content="我是第一个回答。",
            created_at=started_at + timedelta(seconds=12),
        ),
        Message(
            id="msg_user_second",
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            role="user",
            content="你好",
            created_at=started_at + timedelta(seconds=2),
        ),
        Message(
            id="msg_assistant_second",
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            role="assistant",
            content="我是第二个回答。",
            created_at=started_at + timedelta(seconds=14),
        ),
    ]
    events = [
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            event_type="user_message_received",
            payload_json={"message_id": "msg_user_first", "message": "你好"},
            created_at=started_at,
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            event_type="router_decision_created",
            payload_json={"decision": "answer_only", "user_intent": "问候", "reason": "第一轮问候"},
            created_at=started_at + timedelta(seconds=1),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            event_type="user_message_received",
            payload_json={"message_id": "msg_user_second", "message": "你好"},
            created_at=started_at + timedelta(seconds=2),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            event_type="router_decision_created",
            payload_json={"decision": "answer_only", "user_intent": "问候", "reason": "第二轮问候"},
            created_at=started_at + timedelta(seconds=3),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            event_type="assistant_message_created",
            payload_json={
                "message_id": "msg_assistant_first",
                "user_message_id": "msg_user_first",
                "reply": "我是第一个回答。",
            },
            created_at=started_at + timedelta(seconds=12),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_interleaved",
            event_type="assistant_message_created",
            payload_json={
                "message_id": "msg_assistant_second",
                "user_message_id": "msg_user_second",
                "reply": "我是第二个回答。",
            },
            created_at=started_at + timedelta(seconds=14),
        ),
    ]

    traces = _build_turn_traces(messages, events, {})

    assert [trace["turn_id"] for trace in traces] == ["msg_user_first", "msg_user_second"]
    assert traces[0]["completed_at"] == (started_at + timedelta(seconds=12)).isoformat()
    assert traces[1]["completed_at"] == (started_at + timedelta(seconds=14)).isoformat()
    first_details = [line.get("detail") for line in traces[0]["lines"]]
    second_details = [line.get("detail") for line in traces[1]["lines"]]
    assert "第一轮问候" in first_details
    assert "第二轮问候" not in first_details
    assert "第二轮问候" in second_details
    assert "第一轮问候" not in second_details


def test_turn_trace_without_message_id_does_not_bind_user_messages() -> None:
    started_at = datetime(2026, 7, 3, 11, 0, 0)
    messages = [
        Message(
            id="msg_user_first",
            tenant_id="tenant_demo",
            session_id="session_sequence",
            role="user",
            content="第一句",
            created_at=started_at,
        ),
        Message(
            id="msg_user_second",
            tenant_id="tenant_demo",
            session_id="session_sequence",
            role="user",
            content="第二句",
            created_at=started_at + timedelta(seconds=10),
        ),
    ]
    events = [
        AgentEvent(
            id="evt_user_first",
            tenant_id="tenant_demo",
            session_id="session_sequence",
            event_type="user_message_received",
            payload_json={"message": "第二句"},
            created_at=started_at,
        ),
        AgentEvent(
            id="evt_assistant_first",
            tenant_id="tenant_demo",
            session_id="session_sequence",
            event_type="assistant_message_created",
            payload_json={"reply": "收到"},
            created_at=started_at + timedelta(seconds=1),
        ),
        AgentEvent(
            id="evt_user_second",
            tenant_id="tenant_demo",
            session_id="session_sequence",
            event_type="user_message_received",
            payload_json={"message": "第二句"},
            created_at=started_at + timedelta(seconds=10),
        ),
    ]

    traces = _build_turn_traces(messages, events, {})

    assert [trace["turn_id"] for trace in traces] == ["evt_user_first", "evt_user_second"]
    assert [trace["user_message_id"] for trace in traces] == [None, None]


def test_message_turn_ids_from_events_use_ids_not_message_text() -> None:
    started_at = datetime(2026, 7, 3, 12, 0, 0)
    events = [
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="user_message_received",
            payload_json={"message_id": "msg_user_first", "message": "你好"},
            created_at=started_at,
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="assistant_message_created",
            payload_json={
                "message_id": "msg_assistant_first",
                "user_message_id": "msg_user_first",
                "reply": "你好！",
            },
            created_at=started_at + timedelta(seconds=1),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="user_message_received",
            payload_json={"message_id": "msg_user_second", "message": "你好"},
            created_at=started_at + timedelta(seconds=10),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="assistant_message_created",
            payload_json={
                "message_id": "msg_assistant_second",
                "turn_id": "msg_user_second",
                "reply": "请问有什么可以帮您？",
            },
            created_at=started_at + timedelta(seconds=11),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="user_message_received",
            payload_json={"message": "你好"},
            created_at=started_at + timedelta(seconds=20),
        ),
        AgentEvent(
            tenant_id="tenant_demo",
            session_id="session_repeat",
            event_type="assistant_message_created",
            payload_json={"message_id": "msg_assistant_without_user_id", "reply": "旧事件不应猜测归属"},
            created_at=started_at + timedelta(seconds=21),
        ),
    ]

    assert _message_turn_ids_from_events(events) == {
        "msg_user_first": "msg_user_first",
        "msg_assistant_first": "msg_user_first",
        "msg_user_second": "msg_user_second",
        "msg_assistant_second": "msg_user_second",
    }
