import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { McpDaemon } from './daemon.js';
import type { DiscoveredServer } from './types.js';
import { getScopeLabel } from './config.js';

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

export async function startMcpServer(
  daemon: McpDaemon,
  allServers: DiscoveredServer[],
): Promise<void> {
  const server = new Server(
    { name: 'mcp-manager', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'mcp_status',
        description: 'Live connection state right now — lists all MCP servers with state (connected/dropped/degraded/unknown/failed), latency, and scope. Use this to see what is working. For how servers are configured on disk, use mcp_config.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'mcp_restart',
        description: 'Restart a specific MCP server by name. By default skips the server if it is already healthy — set force: true to restart regardless of state.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Server name to restart' },
            force: { type: 'boolean', description: 'Set to true to restart even if the server is currently healthy. Default: false (skips healthy servers).' },
          },
          required: ['name'],
        },
      },
      {
        name: 'mcp_restart_all',
        description: 'Restart all dropped or failed MCP servers at once. Skips servers that are currently healthy.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'mcp_history',
        description: 'Show recent connection events with timestamps. Drop events include the exit code and last stderr output so you can see what the server printed before it crashed.',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number', description: 'Number of events to return (default 50)' } },
        },
      },
      {
        name: 'mcp_config',
        description: 'Disk configuration — shows how each MCP server is defined in settings files, grouped by scope (project / user-settings / global / desktop). Use this to verify launch commands and file paths. For live connection state, use mcp_status.',
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
          return text('No servers found in any config source (project/.claude/settings.json, ~/.claude/settings.json, ~/.claude.json, claude_desktop_config.json).');
        }
        const rows = servers.map((s) => {
          const ping = s.lastPingMs != null ? `${s.lastPingMs}ms` : '—';
          const seen = s.lastSeen ? s.lastSeen.toLocaleTimeString() : '—';
          const error = s.lastError ? ` | error: ${s.lastError}` : '';
          return `• ${s.name} [${s.scope}]: ${s.state.toUpperCase()} | latency: ${ping} | last seen: ${seen} | restarts: ${s.restartAttempts}${error}`;
        });
        return text(`MCP Server Status (${new Date().toLocaleTimeString()})\n\n${rows.join('\n')}`);
      }

      case 'mcp_restart': {
        const name = args.name as string;
        const force = args.force as boolean | undefined;
        const servers = daemon.getStatus();
        const server = servers.find((s) => s.name === name);
        if (!server) {
          return text(`Unknown server: "${name}". Available: ${servers.map((s) => s.name).join(', ')}`);
        }
        if (!force && (server.state === 'connected' || server.state === 'degraded')) {
          return text(`"${name}" is currently ${server.state} — skipping restart. Use force: true to restart a healthy server.`);
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
        if (allServers.length === 0) {
          return text('No MCP servers found in any config source.');
        }

        // Group by scope
        const byScope = new Map<string, DiscoveredServer[]>();
        for (const s of allServers) {
          const label = getScopeLabel(s.scope);
          if (!byScope.has(label)) byScope.set(label, []);
          byScope.get(label)!.push(s);
        }

        const sections: string[] = [];
        for (const [label, servers] of byScope) {
          const rows = servers.map((s) => {
            const cmd = [s.config.command, ...(s.config.args ?? [])].join(' ');
            const isWaypoint = s.name.includes('waypoint') ? ' [waypoint-mcp detected]' : '';
            return `  • ${s.name}: ${cmd}${isWaypoint}`;
          });
          sections.push(`${label}\n${rows.join('\n')}`);
        }

        return text(`Discovered MCP Servers (${allServers.length} total)\n\n${sections.join('\n\n')}`);
      }

      default:
        return text(`Unknown tool: ${req.params.name}`);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp-manager] MCP server running on stdio');
}
