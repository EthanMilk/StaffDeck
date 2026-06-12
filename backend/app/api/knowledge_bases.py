from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.agents.branching import (
    get_agent,
    promote_knowledge_branch_to_overall,
    rollback_knowledge_branch,
    sync_knowledge_branch_from_overall,
    visible_knowledge_base_versions,
)
from app.db.models import (
    AgentKnowledgeBranch,
    AgentResourceBinding,
    KnowledgeBase,
    KnowledgeBucket,
    KnowledgeChunk,
    KnowledgeDocument,
    utc_now,
)
from app.knowledge.schema import (
    KnowledgeBaseCreateRequest,
    KnowledgeBaseRead,
    KnowledgeBaseRollbackRequest,
    KnowledgeBaseUpdateRequest,
)
from app.security.tenant import ensure_tenant

router = APIRouter(prefix="/api/enterprise/knowledge-bases", tags=["enterprise:knowledge-bases"])


@router.get("", response_model=list[KnowledgeBaseRead])
def list_knowledge_bases(
    tenant_id: str = Query(...),
    agent_id: str | None = Query(None),
    db: Session = Depends(get_session),
) -> list[KnowledgeBaseRead]:
    ensure_tenant(db, tenant_id)
    visible_versions = visible_knowledge_base_versions(db, tenant_id, agent_id)
    visible_ids = list(visible_versions.keys())
    rows = db.exec(
        select(KnowledgeBase)
        .where(KnowledgeBase.tenant_id == tenant_id, KnowledgeBase.id.in_(visible_ids) if visible_ids else KnowledgeBase.id == "__none__")
        .order_by(KnowledgeBase.updated_at.desc())
    ).all()
    stats = _knowledge_base_stats(db, tenant_id, [version.id for version in visible_versions.values()])
    branch_meta = _knowledge_branch_meta(db, tenant_id, agent_id)
    return [
        knowledge_base_read(
            row,
            stats.get(row.id, {}),
            version=visible_versions.get(row.id).version if visible_versions.get(row.id) else None,
            branch_meta=branch_meta.get(row.id),
        )
        for row in rows
    ]


@router.post("", response_model=KnowledgeBaseRead)
def create_knowledge_base(
    request: KnowledgeBaseCreateRequest,
    agent_id: str | None = Query(None),
    db: Session = Depends(get_session),
) -> KnowledgeBaseRead:
    ensure_tenant(db, request.tenant_id)
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Knowledge base name cannot be empty")
    existing = db.exec(
        select(KnowledgeBase).where(KnowledgeBase.tenant_id == request.tenant_id, KnowledgeBase.name == name)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Knowledge base name already exists")
    row = KnowledgeBase(
        tenant_id=request.tenant_id,
        name=name,
        description=request.description,
        metadata_json=request.metadata,
        status="active",
    )
    db.add(row)
    db.flush()
    agent = get_agent(db, request.tenant_id, agent_id)
    if agent and not agent.is_overall:
        db.add(
            AgentResourceBinding(
                tenant_id=request.tenant_id,
                agent_id=agent.id,
                resource_type="knowledge_base",
                resource_id=row.id,
                status="active",
                metadata_json={"created_from_agent": True},
            )
        )
        sync_knowledge_branch_from_overall(db, request.tenant_id, agent.id, row.id)
    db.commit()
    db.refresh(row)
    return knowledge_base_read(row, {})


@router.get("/{knowledge_base_id}", response_model=KnowledgeBaseRead)
def get_knowledge_base(
    knowledge_base_id: str,
    tenant_id: str = Query(...),
    agent_id: str | None = Query(None),
    db: Session = Depends(get_session),
) -> KnowledgeBaseRead:
    row = _get_knowledge_base(db, tenant_id, knowledge_base_id)
    visible_versions = visible_knowledge_base_versions(db, tenant_id, agent_id)
    stats = _knowledge_base_stats(
        db,
        tenant_id,
        [visible_versions[row.id].id] if row.id in visible_versions else None,
    )
    branch_meta = _knowledge_branch_meta(db, tenant_id, agent_id).get(row.id)
    return knowledge_base_read(
        row,
        stats.get(row.id, {}),
        version=visible_versions.get(row.id).version if visible_versions.get(row.id) else None,
        branch_meta=branch_meta,
    )


@router.put("/{knowledge_base_id}", response_model=KnowledgeBaseRead)
def update_knowledge_base(
    knowledge_base_id: str,
    request: KnowledgeBaseUpdateRequest,
    db: Session = Depends(get_session),
) -> KnowledgeBaseRead:
    row = _get_knowledge_base(db, request.tenant_id, knowledge_base_id)
    if request.name is not None:
        name = request.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Knowledge base name cannot be empty")
        conflict = db.exec(
            select(KnowledgeBase).where(
                KnowledgeBase.tenant_id == request.tenant_id,
                KnowledgeBase.name == name,
                KnowledgeBase.id != row.id,
            )
        ).first()
        if conflict:
            raise HTTPException(status_code=409, detail="Knowledge base name already exists")
        row.name = name
    if request.description is not None:
        row.description = request.description
    if request.status is not None:
        row.status = request.status
    if request.metadata is not None:
        row.metadata_json = request.metadata
    row.updated_at = utc_now()
    db.add(row)
    db.commit()
    db.refresh(row)
    return knowledge_base_read(row, _knowledge_base_stats(db, request.tenant_id).get(row.id, {}))


@router.delete("/{knowledge_base_id}")
def delete_knowledge_base(
    knowledge_base_id: str,
    tenant_id: str = Query(...),
    agent_id: str | None = Query(None),
    db: Session = Depends(get_session),
) -> dict[str, str]:
    agent = get_agent(db, tenant_id, agent_id)
    if agent and not agent.is_overall:
        raise HTTPException(status_code=403, detail="Only the overall agent can delete knowledge bases")
    row = _get_knowledge_base(db, tenant_id, knowledge_base_id)
    document_count = db.exec(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.tenant_id == tenant_id,
            KnowledgeDocument.knowledge_base_id == knowledge_base_id,
        )
    ).one()
    if int(document_count or 0) > 0:
        row.status = "archived"
        row.updated_at = utc_now()
        db.add(row)
        db.commit()
        return {"status": "archived"}
    db.delete(row)
    db.commit()
    return {"status": "deleted"}


@router.post("/{knowledge_base_id}/sync-from-overall")
def sync_knowledge_base_from_overall(
    knowledge_base_id: str,
    tenant_id: str = Query(...),
    agent_id: str = Query(...),
    db: Session = Depends(get_session),
) -> dict[str, object]:
    agent = get_agent(db, tenant_id, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_overall:
        raise HTTPException(status_code=400, detail="Overall agent is already the trunk")
    branch = sync_knowledge_branch_from_overall(db, tenant_id, agent_id, knowledge_base_id)
    db.commit()
    return {"status": "synced", "knowledge_base_id": knowledge_base_id, "head_version": branch.head_version}


@router.post("/{knowledge_base_id}/promote-to-overall")
def promote_knowledge_base_to_overall(
    knowledge_base_id: str,
    tenant_id: str = Query(...),
    agent_id: str = Query(...),
    db: Session = Depends(get_session),
) -> dict[str, object]:
    agent = get_agent(db, tenant_id, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_overall:
        raise HTTPException(status_code=400, detail="Overall agent does not have a branch to promote")
    version = promote_knowledge_branch_to_overall(db, tenant_id, agent_id, knowledge_base_id)
    db.commit()
    return {"status": "promoted", "knowledge_base_id": knowledge_base_id, "version": version.version}


@router.post("/{knowledge_base_id}/rollback")
def rollback_knowledge_base(
    knowledge_base_id: str,
    request: KnowledgeBaseRollbackRequest,
    db: Session = Depends(get_session),
) -> dict[str, object]:
    agent = get_agent(db, request.tenant_id, request.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if agent.is_overall:
        raise HTTPException(status_code=400, detail="Use overall version management for trunk knowledge base")
    branch = rollback_knowledge_branch(db, request.tenant_id, request.agent_id, knowledge_base_id, request.version)
    db.commit()
    return {"status": "rolled_back", "knowledge_base_id": knowledge_base_id, "head_version": branch.head_version}


def knowledge_base_read(
    row: KnowledgeBase,
    stats: dict[str, int],
    version: str | None = None,
    branch_meta: dict[str, str] | None = None,
) -> KnowledgeBaseRead:
    return KnowledgeBaseRead(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        description=row.description,
        status=row.status,
        version=version,
        branch_sync_state=(branch_meta or {}).get("sync_state"),
        branch_base_version=(branch_meta or {}).get("base_version"),
        branch_head_version=(branch_meta or {}).get("head_version"),
        metadata=row.metadata_json or {},
        document_count=int(stats.get("document_count", 0)),
        bucket_count=int(stats.get("bucket_count", 0)),
        chunk_count=int(stats.get("chunk_count", 0)),
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _get_knowledge_base(db: Session, tenant_id: str, knowledge_base_id: str) -> KnowledgeBase:
    ensure_tenant(db, tenant_id)
    row = db.get(KnowledgeBase, knowledge_base_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return row


def _knowledge_base_stats(
    db: Session,
    tenant_id: str,
    version_ids: list[str] | None = None,
) -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = {}
    doc_stmt = select(KnowledgeDocument.knowledge_base_id, func.count(KnowledgeDocument.id)).where(
        KnowledgeDocument.tenant_id == tenant_id
    )
    bucket_stmt = select(KnowledgeBucket.knowledge_base_id, func.count(KnowledgeBucket.id)).where(
        KnowledgeBucket.tenant_id == tenant_id
    )
    chunk_stmt = select(KnowledgeChunk.knowledge_base_id, func.count(KnowledgeChunk.id)).where(
        KnowledgeChunk.tenant_id == tenant_id
    )
    if version_ids is not None:
        doc_stmt = doc_stmt.where(KnowledgeDocument.knowledge_base_version_id.in_(version_ids))
        bucket_stmt = bucket_stmt.where(KnowledgeBucket.knowledge_base_version_id.in_(version_ids))
        chunk_stmt = chunk_stmt.where(KnowledgeChunk.knowledge_base_version_id.in_(version_ids))
    for knowledge_base_id, count in db.exec(doc_stmt.group_by(KnowledgeDocument.knowledge_base_id)).all():
        stats.setdefault(knowledge_base_id, {})["document_count"] = int(count or 0)
    for knowledge_base_id, count in db.exec(bucket_stmt.group_by(KnowledgeBucket.knowledge_base_id)).all():
        stats.setdefault(knowledge_base_id, {})["bucket_count"] = int(count or 0)
    for knowledge_base_id, count in db.exec(chunk_stmt.group_by(KnowledgeChunk.knowledge_base_id)).all():
        stats.setdefault(knowledge_base_id, {})["chunk_count"] = int(count or 0)
    return stats


def _knowledge_branch_meta(db: Session, tenant_id: str, agent_id: str | None) -> dict[str, dict[str, str]]:
    agent = get_agent(db, tenant_id, agent_id)
    if not agent or agent.is_overall:
        return {}
    rows = db.exec(
        select(AgentKnowledgeBranch).where(
            AgentKnowledgeBranch.tenant_id == tenant_id,
            AgentKnowledgeBranch.agent_id == agent.id,
        )
    ).all()
    return {
        row.knowledge_base_id: {
            "base_version": row.base_version,
            "head_version": row.head_version,
            "sync_state": row.sync_state,
            "status": row.status,
        }
        for row in rows
    }
