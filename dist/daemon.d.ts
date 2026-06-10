import type { ManagedServer, ConnectionEvent, ManagerConfig, McpServerConfig, McpScope } from './types.js';
export declare class McpDaemon {
    private servers;
    private processes;
    private history;
    private pingTimers;
    private stderrBuffers;
    private config;
    constructor(config: ManagerConfig);
    registerServer(name: string, serverConfig: McpServerConfig, scope?: McpScope, sourcePath?: string): void;
    private startProcess;
    private schedulePing;
    private clearPing;
    private ping;
    private scheduleRestart;
    restart(name: string): void;
    restartAll(): void;
    private logEvent;
    getStatus(): ManagedServer[];
    getHistory(limit?: number): ConnectionEvent[];
    stopAll(): void;
}
//# sourceMappingURL=daemon.d.ts.map