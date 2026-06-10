import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import type { DiscoveredServer, McpServerConfig } from './types.js';

const ManagerConfigSchema = z.object({
  pingInterval: z.number().default(10000),
  maxRestartAttempts: z.number().default(3),
  degradedThresholdMs: z.number().default(500),
  notifications: z.boolean().default(true),
  dashboardPort: z.number().default(3131),
  ignoreServers: z.array(z.string()).default([]),
  autoRestart: z.boolean().default(true),
});

export type ManagerConfig = z.infer<typeof ManagerConfigSchema>;

export function loadManagerConfig(): ManagerConfig {
  const configPath = join(process.cwd(), 'mcp-manager.config.json');
  if (existsSync(configPath)) {
    try {
      return ManagerConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
    } catch { /* fall through */ }
  }
  return ManagerConfigSchema.parse({});
}

function readJson<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T;
  } catch (e) {
    console.error(`[mcp-manager] Failed to parse ${filePath}:`, e);
    return null;
  }
}

function normaliseConfig(raw: Record<string, unknown>): McpServerConfig | null {
  if (typeof raw.command !== 'string') return null;
  return {
    command: raw.command,
    args: Array.isArray(raw.args) ? (raw.args as string[]) : [],
    env: (raw.env && typeof raw.env === 'object' ? raw.env : {}) as Record<string, string>,
  };
}

function extractServers(
  filePath: string,
  scope: DiscoveredServer['scope'],
  raw: { mcpServers?: Record<string, unknown> } | null,
): DiscoveredServer[] {
  if (!raw?.mcpServers) return [];
  return Object.entries(raw.mcpServers).flatMap(([name, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return [];
    const config = normaliseConfig(cfg as Record<string, unknown>);
    if (!config) return [];
    return [{ name, config, scope, sourcePath: filePath }];
  });
}

export function discoverAllServers(): DiscoveredServer[] {
  const home = homedir();
  const discovered: DiscoveredServer[] = [];
  const seen = new Set<string>();

  const add = (servers: DiscoveredServer[]) => {
    for (const s of servers) {
      // Project scope wins over global for same name — first seen wins
      if (!seen.has(s.name)) {
        seen.add(s.name);
        discovered.push(s);
      }
    }
  };

  // 1. Project scope: .claude/settings.json in cwd (highest priority)
  const projectSettings = join(process.cwd(), '.claude', 'settings.json');
  add(extractServers(projectSettings, 'project', readJson(projectSettings)));

  // 2. User settings: ~/.claude/settings.json
  const userSettings = join(home, '.claude', 'settings.json');
  add(extractServers(userSettings, 'user-settings', readJson(userSettings)));

  // 3. Global Claude Code config: ~/.claude.json
  const claudeJson = join(home, '.claude.json');
  add(extractServers(claudeJson, 'global', readJson(claudeJson)));

  // 4. Claude Desktop: platform-specific claude_desktop_config.json
  const desktopPath = process.platform === 'win32'
    ? join(process.env.APPDATA ?? home, 'Claude', 'claude_desktop_config.json')
    : process.platform === 'darwin'
      ? join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : join(home, '.config', 'Claude', 'claude_desktop_config.json');
  add(extractServers(desktopPath, 'desktop', readJson(desktopPath)));

  // 5. .mcp.json fallbacks
  for (const p of [join(process.cwd(), '.mcp.json'), join(home, '.mcp.json')]) {
    const raw = readJson<{ mcpServers?: Record<string, unknown> }>(p);
    const servers = raw?.mcpServers
      ? extractServers(p, 'mcp-json', raw)
      : extractServers(p, 'mcp-json', { mcpServers: raw as Record<string, unknown> });
    add(servers);
  }

  return discovered;
}

export function getScopeLabel(scope: DiscoveredServer['scope']): string {
  return {
    project: 'project (.claude/settings.json)',
    'user-settings': 'user (~/.claude/settings.json)',
    global: 'global (~/.claude.json)',
    desktop: 'desktop (claude_desktop_config.json)',
    'mcp-json': '.mcp.json',
  }[scope];
}
