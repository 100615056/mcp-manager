# mcp-manager

Monitor and recover MCP servers connected to Claude — without touching settings files or restarting Claude.

**What is this for?** MCP servers are external tools that AI assistants like Claude can call. They crash, hang, or lose connection — and when they do, your assistant silently loses capabilities. mcp-manager watches every server, auto-restarts failures, and gives your assistant tools to diagnose problems without leaving the conversation.

---

## Install

```sh
claude mcp add mcp-manager npx @waycraft/mcp-manager
```

Or add manually to `~/.claude/mcp.json` (global) or `.claude/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "mcp-manager": {
      "command": "npx",
      "args": ["@waycraft/mcp-manager"]
    }
  }
}
```

---

## Other editors

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` globally):

```json
{
  "mcpServers": {
    "mcp-manager": {
      "command": "npx",
      "args": ["@waycraft/mcp-manager"]
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (Copilot)</strong></summary>

Add to `.vscode/mcp.json` in your project root:

```json
{
  "servers": {
    "mcp-manager": {
      "command": "npx",
      "args": ["@waycraft/mcp-manager"]
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "mcp-manager": {
      "command": "npx",
      "args": ["@waycraft/mcp-manager"]
    }
  }
}
```

</details>

---

## What it does

When an MCP server drops, flaps, or fails to restart, diagnosing it normally means leaving the conversation to check logs or edit config files. mcp-manager exposes the live state, disk config, restart control, and event history of every connected server as MCP tools Claude can call directly.

---

## Tools

### `mcp_status`

Returns live connection state for every MCP server — name, state (connected / dropped / degraded / failed), latency, last seen, restart count, and any current error. Use this first when something feels off.

### `mcp_config`

Returns how each MCP is configured on disk — the exact launch command, config file path, and config scope (project, user-settings, or global). **Distinct from `mcp_status`:** status is the live runtime state (is it running?); config is the setup on disk (how is it launched?). Use config when you need to verify a command path, check the node version in use, or understand which settings file controls a server.

### `mcp_restart`

Restarts a specific server by name. **Skips the server if it's already healthy** — use `force: true` to restart regardless of health state. Healthy servers are never disrupted by default.

**Parameters:**
- `name` — server name exactly as shown in `mcp_status`
- `force` — (optional) set to `true` to restart even if the server is currently healthy

### `mcp_restart_all`

Restarts all servers that are not currently healthy. Healthy servers are skipped. Returns a summary of what was restarted and what was left alone.

### `mcp_history`

Returns a timestamped event log for a specific server — connect, drop, and restart events. Drop events include the process exit details and the **last stderr output** from the server at the time of the crash, so you can see what it actually printed before it died.

**Parameters:**
- `name` — server name to inspect

---

## Typical workflow

```
Something feels off
  → mcp_status          # find which server is dropped or degraded
  → mcp_restart name    # try a restart
  → still failing?
  → mcp_history name    # read the stderr from the crash
  → mcp_config          # verify the launch command and file path are correct
  → fix the root cause, restart again
```

---

## Pairs with

**[session-continuity](https://www.npmjs.com/package/session-continuity)** — if session-continuity drops mid-session, mcp-manager restarts it without leaving the conversation. No lost context.

```bash
claude mcp add session-continuity npx session-continuity
```

**[@waycraft/waypoint-mcp](https://www.npmjs.com/package/@waycraft/waypoint-mcp)** — if waypoint drops during a build cycle, mcp-manager brings it back instantly.

```bash
claude mcp add waypoint npx @waycraft/waypoint-mcp
```

---

## Troubleshooting

**"Cannot find module" or ENOENT errors**
The server's launch command points to a file that doesn't exist. Check the path in your MCP config — common causes: package not installed (`npm install`), wrong path after a project move, or `npx` can't resolve the package.

**Server restarts every few seconds then stops**
mcp-manager retries 3 times with backoff (5s → 15s → 45s), then marks the server as failed. Check `mcp_history` for the stderr output. If the error is unrecoverable (missing module, permission denied), it stops immediately.

**"Port already in use" (EADDRINUSE)**
Another process is using the same port. Find it with `lsof -i :PORT` and stop it, or change the port in the server's config.

**Server shows "connected" but tools don't work**
The server is running but may not be responding to tool calls correctly. Try `mcp_restart --force` to restart even healthy-looking servers.

**Config changes aren't picked up**
mcp-manager re-reads config from disk on manual restart (`mcp_restart`). If you changed a config file, restart the affected server.

---

## Feedback & Discussion

Something not working, a server mcp-manager doesn't handle well, or a feature you'd find useful?

→ [GitHub Discussions](https://github.com/100615056/mcp-manager/discussions)

---

## License

[MIT](LICENSE)
