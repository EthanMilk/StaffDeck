# Chat Client

```bash
npm install
npm run dev
```

Environment:

- `VITE_API_BASE_URL`, default same origin.
- `VITE_TENANT_ID`, default `tenant_demo`
- `VITE_USER_ID`, default `user_demo`
- `VITE_SHOW_DEBUG=true` to show session state in the chat window

From the repository root, prefer `scripts/dev_up.sh`; it builds this frontend
and serves `/chat` from the same port as `/api`. The Vite dev server is only
for legacy split-mode debugging, where it proxies `/api` to
`http://127.0.0.1:8000`.
