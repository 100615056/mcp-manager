export type ServerState = 'connected' | 'dropped' | 'degraded' | 'unknown' | 'failed';

export type McpScope =
  | 'desktop'         // ~/Library/Application Support/Claude/claude_desktop_config.json
  | 'global'          // ~/.claude.json
  | 'user-settings'   // ~/.claude/settings.json
  | 'project'         // .claude/settings.json in cwd
  | 'mcp-json';       // .mcp.json

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeDesktopConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface DiscoveredServer {
  name: string;
  config: McpServerConfig;
  scope: McpScope;
  sourcePath: string;
}

export interface ManagedServer {
  name: string;
  config: McpServerConfig;
  scope: McpScope;
  sourcePath: string;
  state: ServerState;
  pid?: number;
  lastPingMs?: number;
  lastSeen?: Date;
  restartAttempts: number;
  lastError?: string;
}

export interface ConnectionEvent {
  timestamp: Date;
  serverName: string;
  event: 'connected' | 'dropped' | 'restarted' | 'failed' | 'degraded';
  detail?: string;
  latencyMs?: number;
}

export interface ManagerConfig {
  pingInterval: number;
  maxRestartAttempts: number;
  degradedThresholdMs: number;
  notifications: boolean;
  dashboardPort: number;
  ignoreServers: string[];
  autoRestart: boolean;
}
