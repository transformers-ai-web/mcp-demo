import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  LoaderCircle,
  MessageSquareText,
  Plug,
  Plus,
  Radio,
  RotateCw,
  Send,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from "lucide-react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:7000";
const STARTER_MESSAGE = {
  role: "assistant",
  text: "Your tools are ready when the server connects. Try a calculation, ask for the time, or echo a note.",
};

function localPlan(prompt) {
  const expression = prompt.match(/(-?\d+(?:\.\d+)?)\s*([+*×/\-])\s*(-?\d+(?:\.\d+)?)/);
  if (expression) {
    return { name: "calculate", args: { expression: `${expression[1]} ${expression[2].replace("×", "*")} ${expression[3]}` } };
  }
  if (/\b(time|date|clock|today)\b/i.test(prompt)) {
    return { name: "get_current_time", args: {} };
  }
  const echo = prompt.match(/^\s*(?:echo|repeat|say)\s*:??\s*(.*)$/i);
  if (echo?.[1]) return { name: "echo", args: { message: echo[1] } };
  return null;
}

export default function App() {
  const [connection, setConnection] = useState("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [tools, setTools] = useState([]);
  const [messages, setMessages] = useState([STARTER_MESSAGE]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("quick");
  const [model, setModel] = useState("openai/gpt-oss-120b");
  const [activity, setActivity] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    let active = true;
    const connect = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/tools`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || "Could not connect to the application backend.");
        if (active) {
          setTools(payload.tools);
          setConnection("connected");
          setConnectionError("");
        }
      } catch (error) {
        if (active) {
          setConnection("offline");
          setConnectionError(error.message || "Could not connect to the MCP server.");
        }
      }
    };
    connect();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function callTool(name, args) {
    const response = await fetch(`${BACKEND_URL}/api/tools/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, arguments: args }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || "MCP tool call failed.");
    const output = payload.output;
    setActivity((items) => [{ name, args, output, at: new Date() }, ...items].slice(0, 8));
    return output;
  }

  async function runQuickAgent(prompt) {
    const plan = localPlan(prompt);
    if (!plan) {
      return "I can use the demo tools for arithmetic, the current time, and echoing text. Try `18 * 7`, `what time is it?`, or `echo hello`. For broader requests, switch to AI agent mode and configure the LLM key on the server.";
    }
    const output = await callTool(plan.name, plan.args);
    if (plan.name === "calculate") return `${plan.args.expression} = ${JSON.parse(output).result}`;
    if (plan.name === "get_current_time") return `It is ${JSON.parse(output).local}.`;
    return JSON.parse(output).message;
  }

  async function runOpenAIAgent(prompt) {
    const conversation = [
      { role: "system", content: "You are a concise assistant. Use available MCP tools whenever they can answer the user. Be clear about tool results." },
      ...messages.filter((message) => message.role === "user" || message.role === "assistant").map(({ role, text }) => ({ role, content: text })),
      { role: "user", content: prompt },
    ];
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: model.trim() || "openai/gpt-oss-120b", messages: conversation }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || `Agent request failed (${response.status}).`);
    setActivity((items) => [...(payload.activity ?? []).map((item) => ({ ...item, at: new Date() })), ...items].slice(0, 8));
    return payload.message;
  }

  async function submit(prompt = draft) {
    const text = prompt.trim();
    if (!text || busy) return;
    setDraft("");
    setMessages((items) => [...items, { role: "user", text }]);
    setBusy(true);
    try {
      const answer = mode === "ai" ? await runOpenAIAgent(text) : await runQuickAgent(text);
      setMessages((items) => [...items, { role: "assistant", text: answer }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", text: error.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  async function reconnect() {
    setConnection("connecting");
    setConnectionError("");
    setClient(null);
    setTools([]);
    try {
      const response = await fetch(`${BACKEND_URL}/api/tools`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not connect to the application backend.");
      setTools(payload.tools);
      setConnection("connected");
    } catch (error) {
      setConnection("offline");
      setConnectionError(error.message || "Could not connect to the MCP server.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Fieldnote home">
          <span className="brand-mark"><Command size={17} strokeWidth={2.2} /></span>
          <span>fieldnote<span className="brand-dot">.</span></span>
        </a>
        <div className="topbar-center"><span className="crumb-muted">PLAYGROUND</span><span className="crumb-slash">/</span><span>MCP agent</span></div>
        <div className={`connection-pill ${connection}`}>
          <span className="status-indicator" />
          {connection === "connected" ? "Server online" : connection === "connecting" ? "Connecting" : "Server offline"}
        </div>
      </header>

      <section className="workspace-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" />A SMALL, WORKING MCP DEMO</div>
          <h1>Tools in the loop<span className="heading-period">.</span></h1>
          <p className="heading-copy">A lightweight agent connected to a live MCP server over HTTP.</p>
        </div>
        <div className="heading-meta"><span className="meta-label">APPLICATION BACKEND</span><code>{BACKEND_URL}</code></div>
      </section>

      <section className="workbench">
        <div className="conversation-panel">
          <div className="panel-heading">
            <div className="panel-title"><MessageSquareText size={17} /><h2>Agent session</h2><span className="count-badge">{messages.filter((item) => item.role === "user").length.toString().padStart(2, "0")}</span></div>
            <div className="mode-switch" role="group" aria-label="Agent mode">
              <button className={mode === "quick" ? "selected" : ""} onClick={() => setMode("quick")}><Sparkles size={13} />Quick demo</button>
              <button className={mode === "ai" ? "selected" : ""} onClick={() => setMode("ai")}><Bot size={14} />AI agent</button>
            </div>
          </div>

          <div className="conversation-feed" ref={scrollRef} aria-live="polite">
            <div className="date-stamp"><span />TODAY<span /></div>
            {messages.map((message, index) => (
              <article className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
                <div className={`avatar ${message.role}`}>{message.role === "assistant" ? <Sparkles size={14} /> : <span>Y</span>}</div>
                <div className="message-content">
                  <div className="message-meta"><strong>{message.role === "assistant" ? "Agent" : "You"}</strong><span>{message.error ? "Needs attention" : message.role === "assistant" ? "MCP assistant" : "Message"}</span></div>
                  <p className={message.error ? "message-error" : ""}>{message.text}</p>
                </div>
              </article>
            ))}
            {busy && <div className="thinking-row"><LoaderCircle size={15} className="spin" />{mode === "ai" ? "Thinking and checking tools" : "Calling MCP tool"}<span className="thinking-dots">...</span></div>}
            {messages.length === 1 && !busy && (
              <div className="suggestions">
                <span className="suggestion-label">GIVE IT A TRY</span>
                <div className="suggestion-list">
                  {["What is 18 * 7?", "What time is it?", "Echo: hello MCP"].map((sample) => <button key={sample} onClick={() => submit(sample)} disabled={connection !== "connected"}>{sample}<ArrowUpRight size={13} /></button>)}
                </div>
              </div>
            )}
          </div>

          <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label className="sr-only" htmlFor="message">Message the agent</label>
            <textarea id="message" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} placeholder={connection === "connected" ? "Ask something or call a tool..." : "Waiting for the MCP server..."} disabled={connection !== "connected" || busy} rows={2} />
            <div className="composer-footer"><span><kbd>Enter</kbd> to send <span className="key-separator">·</span> <kbd>Shift + Enter</kbd> for a new line</span><button className="send-button" aria-label="Send message" disabled={!draft.trim() || busy || connection !== "connected"}><Send size={15} /></button></div>
          </form>
          <div className="session-footer"><span><Radio size={13} /> Messages are kept in this page only</span><button onClick={() => { setMessages([STARTER_MESSAGE]); setActivity([]); }}><RotateCw size={12} />Reset session</button></div>
        </div>

        <aside className="inspector">
          <section className="inspector-section server-section">
            <div className="section-heading"><div><span className="section-kicker">CONNECTION</span><h2>Server</h2></div><button className="icon-button" onClick={reconnect} aria-label="Reconnect to server" title="Reconnect to server"><RotateCw size={15} /></button></div>
            <div className="server-address"><span className="server-icon"><Plug size={15} /></span><div><strong>Application backend</strong><code>{BACKEND_URL}</code></div><span className={`tiny-status ${connection}`} /></div>
            {connection === "offline" && <div className="connection-error"><CircleHelp size={14} /><span>{connectionError || "Start the server and reconnect."}</span></div>}
            <div className="server-stats"><div><span>DOWNSTREAM</span><strong>MCP server</strong></div><div><span>TOOLS</span><strong>{tools.length.toString().padStart(2, "0")} available</strong></div></div>
          </section>

          <section className="inspector-section tools-section">
            <div className="section-heading"><div><span className="section-kicker">DISCOVERED VIA MCP</span><h2>Available tools <span className="count-badge">{tools.length}</span></h2></div><button className="icon-button" onClick={reconnect} aria-label="Refresh tools" title="Refresh tools"><RotateCw size={15} /></button></div>
            <div className="tool-list">
              {tools.length ? tools.map((tool) => (
                <div className="tool-row" key={tool.name}>
                  <span className="tool-icon">{tool.name === "get_current_time" ? <Clock3 size={15} /> : tool.name === "calculate" ? <Terminal size={15} /> : <Wrench size={15} />}</span>
                  <div className="tool-description"><strong>{tool.name}</strong><p>{tool.description}</p></div>
                  <span className="tool-ready"><Check size={12} /></span>
                </div>
              )) : <div className="empty-tools"><LoaderCircle size={14} className={connection === "connecting" ? "spin" : ""} />{connection === "connecting" ? "Looking for tools" : "No tools found"}</div>}
            </div>
          </section>

          {mode === "ai" && <section className="inspector-section settings-section">
            <div className="section-heading"><div><span className="section-kicker">LLM PROVIDER</span><h2>Agent settings</h2></div><ChevronDown size={15} className="settings-chevron" /></div>
            <label className="field-label" htmlFor="model-name">Model</label>
            <input id="model-name" className="text-field" value={model} onChange={(event) => setModel(event.target.value)} />
            <p className="privacy-note"><Activity size={13} />LLM requests go through the local Node server. Configure OPENAI_API_KEY in server/.env.</p>
          </section>}

          <section className="activity-section">
            <div className="section-heading"><div><span className="section-kicker">LIVE TRACE</span><h2>Tool activity</h2></div><Activity size={15} className="activity-heading-icon" /></div>
            {activity.length ? <div className="activity-list">{activity.map((item, index) => <div className="activity-row" key={`${item.at.toISOString()}-${index}`}><div className="activity-timeline"><span /></div><div className="activity-details"><div><strong>{item.name}</strong><time>{item.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><code>{item.output}</code></div></div>)}</div> : <div className="activity-empty"><span className="empty-pulse" />Tool calls will appear here</div>}
          </section>
          <div className="inspector-bottom"><span>POWERED BY MODEL CONTEXT PROTOCOL</span><ArrowDownToLine size={13} /></div>
        </aside>
      </section>
      <footer className="page-footer"><span>FIELDNOTE LABS <span className="footer-separator">/</span> PROTOCOL PLAYGROUND</span><span>LOCAL DEMO <span className="footer-dot">●</span></span></footer>
    </main>
  );
}