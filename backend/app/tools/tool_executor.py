from __future__ import annotations

import os
import re
from typing import Any

import httpx
from sqlmodel import Session, select

from app.config import get_settings
from app.db.models import Tool
from app.tools.tool_schema import ToolCall, ToolError, ToolResult


SECRET_PATTERN = re.compile(r"\$\{secret\.([A-Z0-9_]+)\}")


class ToolExecutor:
    def __init__(self, db: Session):
        self.db = db
        self.settings = get_settings()

    def execute(
        self,
        tenant_id: str,
        tool_call: ToolCall,
        active_skill_id: str | None = None,
    ) -> ToolResult:
        with self.db.no_autoflush:
            tool = self.db.exec(
                select(Tool).where(Tool.tenant_id == tenant_id, Tool.name == tool_call.name)
            ).first()
        if not tool:
            return self._error(tool_call.name, "NOT_FOUND", "工具不存在或未配置。")
        if not tool.enabled:
            return self._error(tool.name, "DISABLED", "工具当前未启用。")
        if active_skill_id and tool.allowed_skills_json and active_skill_id not in tool.allowed_skills_json:
            return self._error(tool.name, "NOT_ALLOWED", "当前技能不允许调用该工具。")

        headers = self._resolve_headers(tool.headers_json or {}, tool.auth_json or {})
        try:
            with httpx.Client(timeout=self.settings.tool_timeout_seconds) as client:
                if tool.method.upper() == "GET":
                    response = client.request(
                        tool.method.upper(), tool.url, headers=headers, params=tool_call.arguments
                    )
                else:
                    response = client.request(
                        tool.method.upper(), tool.url, headers=headers, json=tool_call.arguments
                    )
                response.raise_for_status()
                return ToolResult(tool_name=tool.name, success=True, data=response.json(), error=None)
        except httpx.TimeoutException:
            return self._error(tool.name, "TIMEOUT", "工具调用超时。")
        except httpx.HTTPStatusError as exc:
            return self._error(
                tool.name,
                "HTTP_ERROR",
                f"工具返回异常状态码：{exc.response.status_code}",
            )
        except Exception as exc:
            return self._error(tool.name, "EXECUTION_ERROR", str(exc))

    def _resolve_headers(self, headers: dict[str, Any], auth: dict[str, Any]) -> dict[str, str]:
        resolved = {key: self._resolve_secret(str(value)) for key, value in headers.items()}
        if auth.get("type") == "bearer" and auth.get("token"):
            resolved["Authorization"] = f"Bearer {self._resolve_secret(str(auth['token']))}"
        return resolved

    def _resolve_secret(self, value: str) -> str:
        def repl(match: re.Match[str]) -> str:
            return os.getenv(match.group(1), "")

        return SECRET_PATTERN.sub(repl, value)

    def _error(self, tool_name: str, code: str, message: str) -> ToolResult:
        return ToolResult(tool_name=tool_name, success=False, data=None, error=ToolError(code=code, message=message))
