from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.db import get_session
from app.db.models import MemoryRecord
from app.memory.service import memory_read, memory_rows_for_read
from app.security.tenant import ensure_tenant


router = APIRouter(prefix="/api/enterprise/memories", tags=["enterprise:memories"])


@router.get("")
def list_memories(
    tenant_id: str = Query(...),
    user_id: str | None = Query(default=None),
    username: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_session),
) -> list[dict]:
    ensure_tenant(db, tenant_id)
    statement = select(MemoryRecord).where(
        MemoryRecord.tenant_id == tenant_id,
        MemoryRecord.kind != "conversation",
    )
    if user_id:
        statement = statement.where(MemoryRecord.user_id == user_id)
    if username:
        statement = statement.where(MemoryRecord.username == username)
    rows = memory_rows_for_read(list(db.exec(statement.order_by(MemoryRecord.updated_at.desc()).limit(limit)).all()))
    if q:
        needle = q.strip().lower()
        rows = [row for row in rows if needle in row.content.lower() or needle in (row.username or "").lower()]
    return [memory_read(row) for row in rows]
