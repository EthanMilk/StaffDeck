# Skill Agent Loop Service

End-to-end MVP for an enterprise Skill Agent Loop service.

## Projects

- `backend`: FastAPI service with skill runtime, model config, tool execution, chat API, and trace APIs.
- `frontend-enterprise`: React/Vite enterprise console for skills, models, tools, and persona configuration.
- `frontend-chat`: React/Vite user chat client.
- `docs`: API and schema notes.

## Quick Start

Use the root dev scripts to run the app on one local port. `scripts/dev_up.sh`
builds both frontends, serves `/chat`, `/enterprise`, and `/api` from one
FastAPI process, writes real process IDs under `.dev/`, and writes logs under
`.dev/logs/`.

```bash
scripts/dev_up.sh
```

Leave that terminal open while developing. To start in the background from a
normal shell, use:

```bash
DETACH=1 scripts/dev_up.sh
```

Stop or inspect the services:

```bash
scripts/dev_status.sh
scripts/dev_down.sh
```

Default URLs:

- chat: `http://127.0.0.1:5173/chat/`
- enterprise: `http://127.0.0.1:5173/enterprise/dashboard`
- API docs: `http://127.0.0.1:5173/docs`

For public tunnel testing, keep the single-port app and pass the public origin
to the backend:

```bash
PUBLIC_APP_ORIGIN="http://<public-host>:<app-port>" \
scripts/dev_up.sh
```

To use the legacy three-port development layout for frontend debugging:

```bash
SINGLE_PORT=0 scripts/dev_up.sh
```

The single-port layout avoids browsers rewriting frontend requests to
`127.0.0.1` on external clients.

Set `DEMO_MODEL_API_KEY` in `backend/.env` before first startup if you want to seed the demo OpenAI-compatible model config. The key is encrypted before it is stored in the database and is never committed.

## Manual Starts

Manual starts are still supported for focused debugging. The default manual
entry is still one port:

```bash
cd backend
.venv/bin/uvicorn single_port_app:app --host 127.0.0.1 --port 5173
```

For low-level frontend debugging, use the legacy split mode explicitly:

```bash
SINGLE_PORT=0 scripts/dev_up.sh
```

Or start each piece yourself:

```bash
cd frontend-enterprise
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev

cd frontend-chat
VITE_API_BASE_URL=http://127.0.0.1:8000 npm run dev
```
