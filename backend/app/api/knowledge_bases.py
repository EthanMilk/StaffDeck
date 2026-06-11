from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.db.models import KnowledgeBase, KnowledgeBucket, KnowledgeChunk, KnowledgeDocument, utc_now
from app.knowledge.schema import KnowledgeBaseCreateRequest, KnowledgeBaseRead, KnowledgeBaseUpdateRequest
from app.security.tenant import ensure_tenant

router = APIRouter(prefix="/api/enterprise/knowledge-bases", tags=["enterprise:knowledge-bases"])


@router.get("", response_model=list[KnowledgeBaseRead])
def list_knowledge_bases(
    tenant_id: str = Query(...),
    db: Session = Depends(get_session),
) -> list[KnowledgeBaseRead]:
    ensure_tenant(db, tenant_id)
    rows = db.exec(
        select(KnowledgeBase)
        .where(KnowledgeBase.tenant_id == tenant_id)
        .order_by(KnowledgeBase.updated_at.desc())
    ).all()
    stats = _knowledge_base_stats(db, tenant_id)
    return [knowledge_base_read(row, stats.get(row.id, {})) for row in rows]


@router.post("", response_model=KnowledgeBaseRead)
def create_knowledge_base(
    request: KnowledgeBaseCreateRequest,
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
    db.commit()
    db.refresh(row)
    return knowledge_base_read(row, {})


@router.get("/{knowledge_base_id}", response_model=KnowledgeBaseRead)
def get_knowledge_base(
    knowledge_base_id: str,
    tenant_id: str = Query(...),
    db: Session = Depends(get_session),
) -> KnowledgeBaseRead:
    row = _get_knowledge_base(db, tenant_id, knowledge_base_id)
    return knowledge_base_read(row, _knowledge_base_stats(db, tenant_id).get(row.id, {}))


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
    db: Session = Depends(get_session),
) -> dict[str, str]:
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


def knowledge_base_read(row: KnowledgeBase, stats: dict[str, int]) -> KnowledgeBaseRead:
    return KnowledgeBaseRead(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        description=row.description,
        status=row.status,
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


def _knowledge_base_stats(db: Session, tenant_id: str) -> dict[str, dict[str, int]]:
    stats: dict[str, dict[str, int]] = {}
    for knowledge_base_id, count in db.exec(
        select(KnowledgeDocument.knowledge_base_id, func.count(KnowledgeDocument.id))
        .where(KnowledgeDocument.tenant_id == tenant_id)
        .group_by(KnowledgeDocument.knowledge_base_id)
    ).all():
        stats.setdefault(knowledge_base_id, {})["document_count"] = int(count or 0)
    for knowledge_base_id, count in db.exec(
        select(KnowledgeBucket.knowledge_base_id, func.count(KnowledgeBucket.id))
        .where(KnowledgeBucket.tenant_id == tenant_id)
        .group_by(KnowledgeBucket.knowledge_base_id)
    ).all():
        stats.setdefault(knowledge_base_id, {})["bucket_count"] = int(count or 0)
    for knowledge_base_id, count in db.exec(
        select(KnowledgeChunk.knowledge_base_id, func.count(KnowledgeChunk.id))
        .where(KnowledgeChunk.tenant_id == tenant_id)
        .group_by(KnowledgeChunk.knowledge_base_id)
    ).all():
        stats.setdefault(knowledge_base_id, {})["chunk_count"] = int(count or 0)
    return stats
