import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { z } from 'zod';
const ManagerConfigSchema = z.object({
    pingInterval: z.number().default(10000),
    maxRestartAttempts: z.number().default(3),
    degradedThresholdMs: z.number().default(500),
    notifications: z.boolean().default(true),
    dashboardPort: z.number().default(3131),
    ignoreServers: z.array(z.string()).default([]),
    autoRestart: z.boolean().default(true),
});
export function loadManagerConfig() {
    const configPath = join(process.cwd(), 'mcp-manager.config.json');
    if (existsSync(configPath)) {
        try {
            return ManagerConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
        }
        catch { /* fall through */ }
    }
    return ManagerConfigSchema.parse({});
}
function readJson(filePath) {
    if (!existsSync(filePath))
        return null;
    try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
    }
    catch (e) {
        console.error(`[mcp-manager] Failed to parse ${filePath}:`, e);
        return null;
    }
}
function normaliseConfig(raw) {
    if (typeof raw.command !== 'string')
        return null;
    return {
        command: raw.command,
        args: Array.isArray(raw.args) ? raw.args : [],
        env: (raw.env && typeof raw.env === 'object' ? raw.env : {}),
    };
}
function extractServers(filePath, scope, raw) {
    if (!raw?.mcpServers)
        return [];
    return Object.entries(raw.mcpServers).flatMap(([name, cfg]) => {
        if (!cfg || typeof cfg !== 'object')
            return [];
        const config = normaliseConfig(cfg);
        if (!config)
            return [];
        return [{ name, config, scope, sourcePath: filePath }];
    });
}
export function discoverAllServers() {
    const home = homedir();
    const discovered = [];
    const seen = new Set();
    const add = (servers) => {
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
    // 5. Cursor: .cursor/mcp.json (project) and ~/.cursor/mcp.json (global)
    for (const p of [join(process.cwd(), '.cursor', 'mcp.json'), join(home, '.cursor', 'mcp.json')]) {
        add(extractServers(p, 'cursor', readJson(p)));
    }
    // 6. VS Code (Copilot): .vscode/mcp.json — uses "servers" key instead of "mcpServers"
    const vscodeMcp = join(process.cwd(), '.vscode', 'mcp.json');
    const vscodeRaw = readJson(vscodeMcp);
    if (vscodeRaw) {
        add(extractServers(vscodeMcp, 'vscode', { mcpServers: vscodeRaw.servers ?? vscodeRaw.mcpServers }));
    }
    // 7. Windsurf: ~/.codeium/windsurf/mcp_config.json
    const windsurfMcp = join(home, '.codeium', 'windsurf', 'mcp_config.json');
    add(extractServers(windsurfMcp, 'windsurf', readJson(windsurfMcp)));
    // 8. .mcp.json fallbacks
    for (const p of [join(process.cwd(), '.mcp.json'), join(home, '.mcp.json')]) {
        const raw = readJson(p);
        const servers = raw?.mcpServers
            ? extractServers(p, 'mcp-json', raw)
            : extractServers(p, 'mcp-json', { mcpServers: raw });
        add(servers);
    }
    return discovered;
}
export function getScopeLabel(scope) {
    return {
        project: 'project (.claude/settings.json)',
        'user-settings': 'user (~/.claude/settings.json)',
        global: 'global (~/.claude.json)',
        desktop: 'desktop (claude_desktop_config.json)',
        'mcp-json': '.mcp.json',
        cursor: 'cursor (.cursor/mcp.json)',
        vscode: 'vscode (.vscode/mcp.json)',
        windsurf: 'windsurf (mcp_config.json)',
    }[scope];
}
//# sourceMappingURL=config.js.map