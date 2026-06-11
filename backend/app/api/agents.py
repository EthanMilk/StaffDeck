from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.agents.schema import (
    AgentProfileCreateRequest,
    AgentProfileRead,
    AgentProfileUpdateRequest,
    AgentResourceBindingInput,
    AgentResourceBindingRead,
    AgentResourcesUpdateRequest,
)
from app.db import get_session
from app.db.models import AgentProfile, AgentResourceBinding, GeneralSkill, KnowledgeBase, Skill, utc_now
from app.security.tenant import ensure_tenant

enterprise_router = APIRouter(prefix="/api/enterprise/agents", tags=["enterprise:agents"])
chat_router = APIRouter(prefix="/api/chat/agents", tags=["chat:agents"])


@enterprise_router.get("", response_model=list[AgentProfileRead])
def list_agents(tenant_id: str = Query(...), db: Session = Depends(get_session)) -> list[AgentProfileRead]:
    ensure_tenant(db, tenant_id)
    rows = db.exec(
        select(AgentProfile).where(AgentProfile.tenant_id == tenant_id).order_by(AgentProfile.is_overall.desc(), AgentProfile.updated_at.desc())
    ).all()
    bindings = _bindings_by_agent(db, tenant_id)
    return [agent_read(row, bindings.get(row.id, [])) for row in rows]


@enterprise_router.post("", response_model=AgentProfileRead)
def create_agent(request: AgentProfileCreateRequest, db: Session = Depends(get_session)) -> AgentProfileRead:
    ensure_tenant(db, request.tenant_id)
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Agent name cannot be empty")
    existing = db.exec(
        select(AgentProfile).where(AgentProfile.tenant_id == request.tenant_id, AgentProfile.name == name)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Agent name already exists")
    row = AgentProfile(
        tenant_id=request.tenant_id,
        name=name,
        description=request.description,
        persona_prompt=request.persona_prompt,
        is_overall=request.is_overall,
        status="active",
        metadata_json=request.metadata,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return agent_read(row, [])


@enterprise_router.get("/{agent_id}", response_model=AgentProfileRead)
def get_agent(agent_id: str, tenant_id: str = Query(...), db: Session = Depends(get_session)) -> AgentProfileRead:
    row = _get_agent(db, tenant_id, agent_id)
    return agent_read(row, _bindings_by_agent(db, tenant_id).get(row.id, []))


@enterprise_router.put("/{agent_id}", response_model=AgentProfileRead)
def update_agent(agent_id: str, request: AgentProfileUpdateRequest, db: Session = Depends(get_session)) -> AgentProfileRead:
    row = _get_agent(db, request.tenant_id, agent_id)
    if request.name is not None:
        name = request.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Agent name cannot be empty")
        conflict = db.exec(
            select(AgentProfile).where(
                AgentProfile.tenant_id == request.tenant_id,
                AgentProfile.name == name,
                AgentProfile.id != row.id,
            )
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Agent name already exists")
        row.name = name
    if request.description is not None:
        row.description = request.description
    if request.persona_prompt is not None:
        row.persona_prompt = request.persona_prompt
    if request.status is not None:
        row.status = request.status
    if request.metadata is not None:
        row.metadata_json = request.metadata
    row.updated_at = utc_now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return agent_read(row, _bindings_by_agent(db, request.tenant_id).get(row.id, []))


@enterprise_router.delete("/{agent_id}")
def delete_agent(agent_id: str, tenant_id: str = Query(...), db: Session = Depends(get_session)) -> dict[str, str]:
    row = _get_agent(db, tenant_id, agent_id)
    if row.is_overall:
        raise HTTPException(status_code=400, detail="Overall agent cannot be deleted")
    bindings = db.exec(select(AgentResourceBinding).where(AgentResourceBinding.agent_id == row.id)).all()
    for binding in bindings:
        db.delete(binding)
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@enterprise_router.get("/{agent_id}/resources", response_model=list[AgentResourceBindingRead])
def get_agent_resources(
    agent_id: str,
    tenant_id: str = Query(...),
    db: Session = Depends(get_session),
) -> list[AgentResourceBindingRead]:
    _get_agent(db, tenant_id, agent_id)
    rows = db.exec(
        select(AgentResourceBinding)
        .where(AgentResourceBinding.tenant_id == tenant_id, AgentResourceBinding.agent_id == agent_id)
        .order_by(AgentResourceBinding.resource_type, AgentResourceBinding.created_at)
    ).all()
    return [binding_read(row) for row in rows]


@enterprise_router.put("/{agent_id}/resources", response_model=list[AgentResourceBindingRead])
def update_agent_resources(
    agent_id: str,
    request: AgentResourcesUpdateRequest,
    db: Session = Depends(get_session),
) -> list[AgentResourceBindingRead]:
    agent = _get_agent(db, request.tenant_id, agent_id)
    if agent.is_overall:
        raise HTTPException(status_code=400, detail="Overall agent uses the global resource pool")
    existing = db.exec(
        select(AgentResourceBinding).where(
            AgentResourceBinding.tenant_id == request.tenant_id,
            AgentResourceBinding.agent_id == agent_id,
        )
    ).all()
    by_key = {(row.resource_type, row.resource_id): row for row in existing}
    desired_keys: set[tuple[str, str]] = set()
    for item in request.resources:
        _ensure_resource_exists(db, request.tenant_id, item)
        key = (item.resource_type, item.resource_id)
        desired_keys.add(key)
        row = by_key.get(key)
        if row:
            row.status = item.status
            row.metadata_json = item.metadata
            row.updated_at = utc_now()
        else:
            row = AgentResourceBinding(
                tenant_id=request.tenant_id,
                agent_id=agent_id,
                resource_type=item.resource_type,
                resource_id=item.resource_id,
                status=item.status,
                metadata_json=item.metadata,
            )
        db.add(row)
    for key, row in by_key.items():
        if key not in desired_keys:
            db.delete(row)
    db.commit()
    return get_agent_resources(agent_id, request.tenant_id, db)


@chat_router.get("", response_model=list[AgentProfileRead])
def list_chat_agents(tenant_id: str = Query(...), db: Session = Depends(get_session)) -> list[AgentProfileRead]:
    ensure_tenant(db, tenant_id)
    rows = db.exec(
        select(AgentProfile).where(
            AgentProfile.tenant_id == tenant_id,
            AgentProfile.status == "active",
            AgentProfile.is_overall == False,  # noqa: E712
        ).order_by(AgentProfile.updated_at.desc())
    ).all()
    bindings = _bindings_by_agent(db, tenant_id)
    return [agent_read(row, bindings.get(row.id, [])) for row in rows]


def agent_read(row: AgentProfile, bindings: list[AgentResourceBinding]) -> AgentProfileRead:
    return AgentProfileRead(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        description=row.description,
        persona_prompt=row.persona_prompt,
        is_overall=row.is_overall,
        status=row.status,
        metadata=row.metadata_json or {},
        resources=[binding_read(binding) for binding in bindings],
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def binding_read(row: AgentResourceBinding) -> AgentResourceBindingRead:
    return AgentResourceBindingRead(
        id=row.id,
        tenant_id=row.tenant_id,
        agent_id=row.agent_id,
        resource_type=row.resource_type,  # type: ignore[arg-type]
        resource_id=row.resource_id,
        status=row.status,
        metadata=row.metadata_json or {},
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _get_agent(db: Session, tenant_id: str, agent_id: str) -> AgentProfile:
    ensure_tenant(db, tenant_id)
    row = db.get(AgentProfile, agent_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Agent not found")
    return row


def _bindings_by_agent(db: Session, tenant_id: str) -> dict[str, list[AgentResourceBinding]]:
    rows = db.exec(
        select(AgentResourceBinding)
        .where(AgentResourceBinding.tenant_id == tenant_id)
        .order_by(AgentResourceBinding.created_at.asc())
    ).all()
    grouped: dict[str, list[AgentResourceBinding]] = {}
    for row in rows:
        grouped.setdefault(row.agent_id, []).append(row)
    return grouped


def _ensure_resource_exists(db: Session, tenant_id: str, item: AgentResourceBindingInput) -> None:
    model = {
        "skill": Skill,
        "general_skill": GeneralSkill,
        "knowledge_base": KnowledgeBase,
    }[item.resource_type]
    row = db.get(model, item.resource_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail=f"Resource not found: {item.resource_type}:{item.resource_id}")
