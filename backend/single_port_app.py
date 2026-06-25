from pathlib import Path

from fastapi.responses import FileResponse, RedirectResponse
from starlette.staticfiles import StaticFiles

from app.main import app


ROOT_DIR = Path(__file__).resolve().parents[1]
ENTERPRISE_DIST = ROOT_DIR / "frontend-enterprise" / "dist"
CHAT_DIST = ROOT_DIR / "frontend-chat" / "dist"

app.mount(
    "/enterprise/assets",
    StaticFiles(directory=ENTERPRISE_DIST / "assets", check_dir=False),
    name="enterprise-assets",
)
app.mount("/chat/assets", StaticFiles(directory=CHAT_DIST / "assets", check_dir=False), name="chat-assets")


@app.get("/", include_in_schema=False)
def root_redirect() -> RedirectResponse:
    return RedirectResponse(url="/chat/")


@app.get("/enterprise", include_in_schema=False)
@app.get("/enterprise/{path:path}", include_in_schema=False)
def enterprise_app(path: str = "") -> FileResponse:
    return FileResponse(ENTERPRISE_DIST / "index.html")


@app.get("/login", include_in_schema=False)
@app.get("/chat", include_in_schema=False)
@app.get("/chat/{path:path}", include_in_schema=False)
def chat_app(path: str = "") -> FileResponse:
    return FileResponse(CHAT_DIST / "index.html")
