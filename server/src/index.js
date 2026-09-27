import { randomUUID } from "node:crypto";
import express from "express";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const app = express();
const transports = new Map();
const port = Number(process.env.PORT ?? 8000);

app.use(express.json());
app.use((request, response, next) => {
  response.setHeader("Access-Control-Allow-Origin", ["http://127.0.0.1:7000", "https://mcp-demo-liard.vercel.app/", "https://mcp-demo-ms1j.onrender.com/"]);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, mcp-session-id, mcp-protocol-version, last-event-id");
  response.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.get("/health", (_request, response) => {
  response.json({ status: "ok", service: "mcp-demo-server" });
});

function createMcpServer() {
  const server = new McpServer({ name: "demo-tools", version: "1.0.0" });

  server.registerTool(
    "calculate",
    {
      title: "Calculate",
      description: "Calculate two numbers using +, -, *, or /.",
      inputSchema: { expression: z.string().describe("For example: 12 * 5") },
    },
    async ({ expression }) => {
      const normalized = expression.replace(/\s+/g, "");
      const match = normalized.match(/^(-?\d+(?:\.\d+)?)([+*/-])(-?\d+(?:\.\d+)?)$/);
      if (!match) {
        return { content: [{ type: "text", text: "Use two numbers and one operator: +, -, *, or /." }], isError: true };
      }
      const left = Number(match[1]);
      const right = Number(match[3]);
      const result = {
        "+": left + right,
        "-": left - right,
        "*": left * right,
        "/": left / right,
      }[match[2]];
      if (!Number.isFinite(result)) {
        return { content: [{ type: "text", text: "That calculation does not have a finite result." }], isError: true };
      }
      return {
        content: [{ type: "text", text: String(result) }],
        structuredContent: { expression, result },
      };
    },
  );

  server.registerTool(
    "get_current_time",
    {
      title: "Get current time",
      description: "Get the current date and time in ISO 8601 format.",
      inputSchema: {},
    },
    async () => {
      const now = new Date();
      return {
        content: [{ type: "text", text: now.toISOString() }],
        structuredContent: { iso: now.toISOString(), local: now.toString() },
      };
    },
  );

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Repeat a message back exactly as provided.",
      inputSchema: { message: z.string().describe("The text to repeat") },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
      structuredContent: { message },
    }),
  );

  return server;
}

app.post("/mcp", async (request, response) => {
  const sessionId = request.headers["mcp-session-id"];
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport && isInitializeRequest(request.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => transports.set(id, transport),
    });
    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };
    await createMcpServer().connect(transport);
    await transport.handleRequest(request, response, request.body);
    return;
  }

  if (!transport) {
    response.status(400).json({ error: "Bad Request: missing or expired MCP session." });
    return;
  }
  await transport.handleRequest(request, response, request.body);
});

app.get("/mcp", async (request, response) => {
  const transport = transports.get(request.headers["mcp-session-id"]);
  if (!transport) {
    response.status(400).send("Missing or expired MCP session.");
    return;
  }
  await transport.handleRequest(request, response);
});

app.delete("/mcp", async (request, response) => {
  const transport = transports.get(request.headers["mcp-session-id"]);
  if (!transport) {
    response.status(400).send("Missing or expired MCP session.");
    return;
  }
  await transport.handleRequest(request, response);
});

app.listen(port, () => {
  console.log(`MCP server listening at http://127.0.0.1:${port}/mcp`);
});
