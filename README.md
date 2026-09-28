# Fieldnote MCP demo

A small three-layer demo: browser UI, application backend/agent, and a separate Streamable HTTP MCP server.

## Run it

Create `backend/.env` from `backend/.env.example` and set your Groq key there. Never put the key in the UI or commit the `.env` file.

Use three terminals from the workspace root:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd backend
npm install
Copy-Item .env.example .env
# Edit .env and set GROQ_API_KEY
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open the Vite URL shown in the client terminal (normally `http://localhost:5173`). The UI calls the application backend at `http://127.0.0.1:7000`; the backend connects to the MCP server at `http://127.0.0.1:8000/mcp`.

## Demo tools

- `calculate`: one arithmetic operation on two numbers
- `get_current_time`: server date and time
- `echo`: repeat supplied text

Quick demo mode calls the application backend, which calls MCP tools. AI agent mode sends chat requests to the application backend; it owns the Groq key, connects to MCP, executes model-requested tools, and returns the final answer. The browser never connects to MCP or receives the API key. The local demo has no user authentication; keep all services bound to loopback and do not expose them to a network.

Set `VITE_BACKEND_URL` before starting the client to use a different application backend.

## Deployment environment

Deploy `server/` and `backend/` as separate Node services, and `client/` as the frontend.

- On the backend service, set `MCP_SERVER_URL=https://<mcp-server-host>/mcp` and `CLIENT_ORIGIN=https://mcp-demo-liard.vercel.app`.
- On the frontend service, set `VITE_BACKEND_URL=https://mcp-demo-ms1j.onrender.com`.
- Redeploy the backend after changing its environment. Rebuild and redeploy the frontend after changing `VITE_BACKEND_URL`, since Vite embeds it at build time.

Use the frontend origin without a path for `CLIENT_ORIGIN`. The MCP URL points to the service running `server/src/index.js`.
