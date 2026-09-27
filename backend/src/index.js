import "dotenv/config";
import express from "express";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const app = express();
const port = Number(process.env.PORT ?? 7000);
const mcpUrl = process.env.MCP_SERVER_URL ?? "http://127.0.0.1:8000/mcp";
const llmUrl = process.env.GROQ_CHAT_COMPLETIONS_URL ?? "https://api.groq.com/openai/v1/chat/completions";
const allowedOrigins = new Set(["http://localhost:5173", "http://127.0.0.1:5173", process.env.CLIENT_ORIGIN].filter(Boolean));

app.use(express.json());
app.use((request, response, next) => {
  const origin = request.get("Origin");
  if (origin && allowedOrigins.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});

let mcpClient;
let availableTools = [];

async function getMcpClient() {
  if (mcpClient) return mcpClient;
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  mcpClient = new Client({ name: "fieldnote-agent-backend", version: "1.0.0" });
  await mcpClient.connect(transport);
  const result = await mcpClient.listTools();
  availableTools = result.tools;
  return mcpClient;
}

function toolDefinitions() {
  return availableTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: tool.inputSchema?.properties ?? {},
        required: tool.inputSchema?.required ?? [],
        additionalProperties: false,
      },
    },
  }));
}

function textFromToolResult(result) {
  if (result.structuredContent && Object.keys(result.structuredContent).length) return JSON.stringify(result.structuredContent);
  return result.content?.map((item) => item.text ?? "").join("\n") || "Tool returned no text.";
}

async function callMcpTool(name, args) {
  const client = await getMcpClient();
  const result = await client.callTool({ name, arguments: args });
  return textFromToolResult(result);
}

app.get("/health", async (_request, response) => {
  try {
    await getMcpClient();
    response.json({ status: "ok", service: "mcp-agent-backend", mcp: "connected", tools: availableTools.length });
  } catch (error) {
    response.status(503).json({ status: "error", service: "mcp-agent-backend", error: error.message });
  }
});

app.get("/api/tools", async (_request, response) => {
  try {
    await getMcpClient();
    response.json({ tools: availableTools });
  } catch (error) {
    response.status(503).json({ error: { message: `MCP server unavailable: ${error.message}` } });
  }
});

app.post("/api/tools/call", async (request, response) => {
  try {
    const output = await callMcpTool(request.body?.name, request.body?.arguments ?? {});
    response.json({ output });
  } catch (error) {
    response.status(502).json({ error: { message: `MCP tool call failed: ${error.message}` } });
  }
});

app.post("/api/chat", async (request, response) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: { message: "Configure GROQ_API_KEY in backend/.env to enable AI agent mode." } });
    return;
  }
  const { model, messages } = request.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    response.status(400).json({ error: { message: "A non-empty messages array is required." } });
    return;
  }

  try {
    await getMcpClient();
    const conversation = [...messages];
    const activity = [];
    for (let turn = 0; turn < 5; turn += 1) {
      const upstream = await fetch(llmUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model || process.env.GROQ_MODEL || "openai/gpt-oss-120b",
          messages: conversation,
          tools: toolDefinitions(),
          tool_choice: "auto",
        }),
      });
      const payload = await upstream.json();
      if (!upstream.ok) {
        response.status(upstream.status).json(payload);
        return;
      }
      const choice = payload.choices?.[0]?.message;
      if (!choice) throw new Error("The model returned an empty response.");
      conversation.push(choice);
      if (!choice.tool_calls?.length) {
        response.json({ message: choice.content || "The model returned no text.", activity });
        return;
      }
      for (const toolCall of choice.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || "{}");
        const output = await callMcpTool(toolCall.function.name, args);
        activity.unshift({ name: toolCall.function.name, args, output });
        conversation.push({ role: "tool", tool_call_id: toolCall.id, name: toolCall.function.name, content: output });
      }
    }
    response.json({ message: "I stopped after five tool rounds to keep this demo bounded.", activity });
  } catch (error) {
    console.error("Agent request failed:", error.message);
    response.status(502).json({ error: { message: error.message } });
  }
});

app.listen(port, () => console.log(`Application backend listening at http://127.0.0.1:${port}`));
