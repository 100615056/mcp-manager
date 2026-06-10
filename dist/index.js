#!/usr/bin/env node
import { loadManagerConfig, discoverAllServers, getScopeLabel } from './config.js';
import { McpDaemon } from './daemon.js';
import { startDashboard } from './dashboard.js';
import { startMcpServer } from './mcp-server.js';
process.on('unhandledRejection', (reason) => {
    console.error('[mcp-manager] Unhandled rejection:', reason);
});
async function main() {
    const managerConfig = loadManagerConfig();
    const allServers = discoverAllServers();
    const daemon = new McpDaemon(managerConfig);
    if (allServers.length === 0) {
        console.error('[mcp-manager] No servers found in any config source');
    }
    else {
        for (const s of allServers) {
            if (s.name === 'mcp-manager')
                continue;
            console.error(`[mcp-manager] Registering "${s.name}" (${getScopeLabel(s.scope)})`);
            daemon.registerServer(s.name, s.config, s.scope, s.sourcePath);
        }
    }
    startDashboard(managerConfig.dashboardPort, daemon);
    await startMcpServer(daemon, allServers);
    process.on('SIGINT', () => { daemon.stopAll(); process.exit(0); });
    process.on('SIGTERM', () => { daemon.stopAll(); process.exit(0); });
}
main().catch((err) => {
    console.error('[mcp-manager] Fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map