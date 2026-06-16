from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.api.chat import _bind_request_to_session_agent, _ensure_chat_agent_available
from app.db.models import AgentProfile, ChatSession, Tenant
from app.session.session_schema import ChatTurnRequest


def test_existing_chat_session_cannot_switch_agent() -> None:
    with _test_session() as db:
        db.add(Tenant(id="tenant_demo", name="Demo"))
        db.add(AgentProfile(id="agent_a", tenant_id="tenant_demo", name="客服 A", is_overall=False))
        db.add(AgentProfile(id="agent_b", tenant_id="tenant_demo", name="客服 B", is_overall=False))
        session = ChatSession(
            id="session_bound",
            tenant_id="tenant_demo",
            user_id="user_demo",
            agent_id="agent_a",
        )
        db.add(session)
        db.commit()

        request = ChatTurnRequest(
            tenant_id="tenant_demo",
            session_id=session.id,
            user_id="user_demo",
            agent_id="agent_b",
            message="你好",
        )

        with pytest.raises(HTTPException) as exc_info:
            _bind_request_to_session_agent(db, request, session)

        assert exc_info.value.status_code == 409
        assert db.get(ChatSession, session.id).agent_id == "agent_a"


def test_chat_agent_must_be_active_non_overall_agent() -> None:
    with _test_session() as db:
        db.add(Tenant(id="tenant_demo", name="Demo"))
        db.add(AgentProfile(id="agent_overall", tenant_id="tenant_demo", name="整体", is_overall=True))
        db.add(AgentProfile(id="agent_archived", tenant_id="tenant_demo", name="已归档", is_overall=False, status="archived"))
        db.commit()

        with pytest.raises(HTTPException) as missing:
            _ensure_chat_agent_available(db, "tenant_demo", None)
        with pytest.raises(HTTPException) as overall:
            _ensure_chat_agent_available(db, "tenant_demo", "agent_overall")
        with pytest.raises(HTTPException) as archived:
            _ensure_chat_agent_available(db, "tenant_demo", "agent_archived")

        assert missing.value.status_code == 400
        assert overall.value.status_code == 404
        assert archived.value.status_code == 404


def _test_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)
