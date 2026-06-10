#!/usr/bin/env node
import { loadManagerConfig, loadClaudeConfig } from './config.js';
import { McpDaemon } from './daemon.js';
import { startDashboard } from './dashboard.js';
import { startMcpServer } from './mcp-server.js';

process.on('unhandledRejection', (reason) => {
  console.error('[mcp-manager] Unhandled rejection:', reason);
});

async function main(): Promise<void> {
  const managerConfig = loadManagerConfig();
  const claudeConfig = loadClaudeConfig();

  const daemon = new McpDaemon(managerConfig);

  if (claudeConfig) {
    const servers = claudeConfig.config.mcpServers ?? {};
    const names = Object.keys(servers);
    console.error(`[mcp-manager] Found ${names.length} server(s) in ${claudeConfig.path}`);
    for (const [name, cfg] of Object.entries(servers)) {
      // Don't monitor ourselves to avoid loops
      if (name === 'mcp-manager') continue;
      daemon.registerServer(name, cfg);
    }
  } else {
    console.error('[mcp-manager] No claude_desktop_config.json or .mcp.json found — monitoring 0 servers');
  }

  startDashboard(managerConfig.dashboardPort, daemon);
  await startMcpServer(daemon, claudeConfig);

  process.on('SIGINT', () => {
    daemon.stopAll();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    daemon.stopAll();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[mcp-manager] Fatal:', err);
  process.exit(1);
});
