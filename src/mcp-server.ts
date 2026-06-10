import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpDaemon } from './daemon.js';
import type { ClaudeDesktopConfig } from './types.js';

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

export async function startMcpServer(
  daemon: McpDaemon,
  claudeConfig: { path: string; config: ClaudeDesktopConfig } | null,
): Promise<void> {
  const server = new Server(
    { name: 'mcp-manager', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'mcp_status',
        description: 'List all configured MCP servers with their current state (connected/dropped/degraded/unknown/failed)',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'mcp_restart',
        description: 'Restart a specific MCP server by name',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'Server name to restart' } },
          required: ['name'],
        },
      },
      {
        name: 'mcp_restart_all',
        description: 'Restart all dropped or failed MCP servers at once',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'mcp_history',
        description: 'Show recent connection events with timestamps and details',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Number of events to return (default 50)' } },
        },
      },
      {
        name: 'mcp_config',
        description: 'Show parsed MCP server configuration from claude_desktop_config.json or .mcp.json',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    switch (req.params.name) {
      case 'mcp_status': {
        const servers = daemon.getStatus();
        if (servers.length === 0) {
          return text('No servers configured. Ensure claude_desktop_config.json or .mcp.json is present.');
        }
        const rows = servers.map((s) => {
          const ping = s.lastPingMs != null ? `${s.lastPingMs}ms` : '—';
          const seen = s.lastSeen ? s.lastSeen.toLocaleTimeString() : '—';
          const error = s.lastError ? ` | error: ${s.lastError}` : '';
          return `• ${s.name}: ${s.state.toUpperCase()} | latency: ${ping} | last seen: ${seen} | restarts: ${s.restartAttempts}${error}`;
        });
        return text(`MCP Server Status (${new Date().toLocaleTimeString()})\n\n${rows.join('\n')}`);
      }

      case 'mcp_restart': {
        const name = args.name as string;
        const servers = daemon.getStatus();
        if (!servers.find((s) => s.name === name)) {
          return text(`Unknown server: "${name}". Available: ${servers.map((s) => s.name).join(', ')}`);
        }
        daemon.restart(name);
        return text(`Restarting "${name}"...`);
      }

      case 'mcp_restart_all': {
        const dropped = daemon.getStatus().filter((s) => s.state === 'dropped' || s.state === 'failed');
        if (dropped.length === 0) return text('No dropped or failed servers to restart.');
        daemon.restartAll();
        return text(`Restarting ${dropped.length} server(s): ${dropped.map((s) => s.name).join(', ')}`);
      }

      case 'mcp_history': {
        const limit = typeof args.limit === 'number' ? args.limit : 50;
        const events = daemon.getHistory(limit);
        if (events.length === 0) return text('No connection events recorded yet.');
        const rows = events.map((e) => {
          const ts = new Date(e.timestamp).toLocaleTimeString();
          const detail = e.detail ? ` — ${e.detail}` : '';
          const latency = e.latencyMs != null ? ` (${e.latencyMs}ms)` : '';
          return `[${ts}] ${e.serverName}: ${e.event}${detail}${latency}`;
        });
        return text(rows.join('\n'));
      }

      case 'mcp_config': {
        if (!claudeConfig) {
          return text('No config file found. Checked claude_desktop_config.json and .mcp.json.');
        }
        const servers = claudeConfig.config.mcpServers ?? {};
        const rows = Object.entries(servers).map(([name, cfg]) => {
          const cmd = [cfg.command, ...(cfg.args ?? [])].join(' ');
          return `• ${name}: ${cmd}`;
        });
        const isWaypoint = Object.keys(servers).some((n) => n.includes('waypoint'));
        const waypointNote = isWaypoint ? '\n\n[waypoint-mcp detected in config]' : '';
        return text(`Config: ${claudeConfig.path}\n\n${rows.join('\n') || '(no servers)'}${waypointNote}`);
      }

      default:
        return text(`Unknown tool: ${req.params.name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp-manager] MCP server running on stdio');
}
