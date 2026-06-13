from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from app.agents.branching import copy_overall_scope_to_agent, require_overall_agent, update_branch_skill, visible_skill_rows
from app.api.agents import _skill_branch_read
from app.db.models import AgentProfile, AgentSkillBranch, Skill, Tenant


def test_agent_skill_branch_is_copy_on_write_and_reports_branch_state() -> None:
    with _test_session() as db:
        db.add(Tenant(id="tenant_demo", name="Demo"))
        db.add(AgentProfile(id="agent_overall", tenant_id="tenant_demo", name="整体智能体", is_overall=True))
        agent = AgentProfile(id="agent_branch", tenant_id="tenant_demo", name="客服分支", is_overall=False)
        skill = Skill(
            tenant_id="tenant_demo",
            skill_id="skill_purchase",
            version="1.0.0",
            name="购买流程",
            business_domain="电商",
            description="购买商品",
            status="published",
            content_json=_graph("购买流程", "1.0.0"),
        )
        db.add(agent)
        db.add(skill)
        db.commit()

        copy_overall_scope_to_agent(db, "tenant_demo", agent)
        db.commit()

        visible = visible_skill_rows(db, "tenant_demo", agent.id)
        assert len(visible) == 1
        branch_read = _skill_branch_read(visible[0])
        assert branch_read["branch_sync_state"] == "synced"
        assert branch_read["branch_head_version"] == "1.0.0"

        update_branch_skill(db, "tenant_demo", agent.id, skill, _graph("分支购买流程", "1.0.0-branch.1"))
        db.commit()

        branch_visible = visible_skill_rows(db, "tenant_demo", agent.id)[0]
        global_skill = db.exec(select(Skill).where(Skill.skill_id == "skill_purchase")).first()
        assert branch_visible.name == "分支购买流程"
        assert global_skill is not None
        assert global_skill.name == "购买流程"
        assert _skill_branch_read(branch_visible)["branch_sync_state"] == "diverged"


def test_non_overall_agent_cannot_delete_global_resources() -> None:
    with _test_session() as db:
        db.add(Tenant(id="tenant_demo", name="Demo"))
        db.add(AgentProfile(id="agent_overall", tenant_id="tenant_demo", name="整体智能体", is_overall=True))
        db.add(AgentProfile(id="agent_branch", tenant_id="tenant_demo", name="客服分支", is_overall=False))
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            require_overall_agent(db, "tenant_demo", "agent_branch")

        assert exc_info.value.status_code == 403


def test_management_rows_keep_archived_global_and_inactive_branch_skills() -> None:
    with _test_session() as db:
        db.add(Tenant(id="tenant_demo", name="Demo"))
        db.add(AgentProfile(id="agent_overall", tenant_id="tenant_demo", name="整体智能体", is_overall=True))
        agent = AgentProfile(id="agent_branch", tenant_id="tenant_demo", name="客服分支", is_overall=False)
        global_archived = Skill(
            tenant_id="tenant_demo",
            skill_id="global_archived",
            version="1.0.0",
            name="主干下线技能",
            business_domain="电商",
            description="已下线但仍应管理可见",
            status="archived",
            content_json=_graph("主干下线技能", "1.0.0"),
        )
        branch_skill = Skill(
            tenant_id="tenant_demo",
            skill_id="branch_inactive",
            version="1.0.0",
            name="分支下线技能",
            business_domain="电商",
            description="分支下线但仍应管理可见",
            status="published",
            content_json=_graph("分支下线技能", "1.0.0"),
        )
        db.add(agent)
        db.add(global_archived)
        db.add(branch_skill)
        db.commit()

        copy_overall_scope_to_agent(db, "tenant_demo", agent)
        branch = db.exec(
            select(AgentSkillBranch).where(
                AgentSkillBranch.tenant_id == "tenant_demo",
                AgentSkillBranch.agent_id == agent.id,
                AgentSkillBranch.skill_id == branch_skill.skill_id,
            )
        ).one()
        branch.status = "inactive"
        db.add(branch)
        db.commit()

        overall_ids = {row.skill_id for row in visible_skill_rows(db, "tenant_demo")}
        branch_rows = visible_skill_rows(db, "tenant_demo", agent.id)
        branch_by_id = {row.skill_id: row for row in branch_rows}

        assert "global_archived" in overall_ids
        assert branch_by_id["branch_inactive"].status == "archived"


def _graph(name: str, version: str) -> dict[str, object]:
    return {
        "skill_id": "skill_purchase",
        "version": version,
        "name": name,
        "business_domain": "电商",
        "description": "购买商品",
        "nodes": [
            {
                "node_id": "collect",
                "type": "collect_info",
                "name": "收集信息",
                "instruction": "收集用户信息",
                "expected_user_info": ["user_name"],
                "allowed_actions": ["ask_user", "continue_flow"],
            },
            {
                "node_id": "reply",
                "type": "response",
                "name": "回复用户",
                "instruction": "回复用户",
                "allowed_actions": ["answer_user"],
            },
        ],
        "edges": [{"source_node_id": "collect", "next_node_id": "reply"}],
        "start_node_id": "collect",
        "terminal_node_ids": ["reply"],
    }


def _test_session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)
