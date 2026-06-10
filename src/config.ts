import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import type { ClaudeDesktopConfig, ManagerConfig } from './types.js';

const ManagerConfigSchema = z.object({
  pingInterval: z.number().default(10000),
  maxRestartAttempts: z.number().default(3),
  degradedThresholdMs: z.number().default(500),
  notifications: z.boolean().default(true),
  dashboardPort: z.number().default(3131),
  ignoreServers: z.array(z.string()).default([]),
  autoRestart: z.boolean().default(true),
});

export function loadManagerConfig(): ManagerConfig {
  const configPath = join(process.cwd(), 'mcp-manager.config.json');
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf8'));
      return ManagerConfigSchema.parse(raw);
    } catch {
      // fall through to defaults
    }
  }
  return ManagerConfigSchema.parse({});
}

function claudeDesktopConfigPath(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'win32') {
    return join(process.env.APPDATA ?? homedir(), 'Claude', 'claude_desktop_config.json');
  }
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function mcpJsonPath(): string[] {
  return [
    join(process.cwd(), '.mcp.json'),
    join(homedir(), '.mcp.json'),
  ];
}

export function loadClaudeConfig(): { path: string; config: ClaudeDesktopConfig } | null {
  // Try claude_desktop_config.json first
  const desktopPath = claudeDesktopConfigPath();
  if (existsSync(desktopPath)) {
    try {
      const config = JSON.parse(readFileSync(desktopPath, 'utf8')) as ClaudeDesktopConfig;
      return { path: desktopPath, config };
    } catch (e) {
      console.error(`Failed to parse ${desktopPath}:`, e);
    }
  }

  // Try .mcp.json locations
  for (const p of mcpJsonPath()) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        // .mcp.json may have mcpServers at root or nested
        const config: ClaudeDesktopConfig = raw.mcpServers ? raw : { mcpServers: raw };
        return { path: p, config };
      } catch (e) {
        console.error(`Failed to parse ${p}:`, e);
      }
    }
  }

  return null;
}
