import { z } from 'zod';
import type { DiscoveredServer } from './types.js';
declare const ManagerConfigSchema: z.ZodObject<{
    pingInterval: z.ZodDefault<z.ZodNumber>;
    maxRestartAttempts: z.ZodDefault<z.ZodNumber>;
    degradedThresholdMs: z.ZodDefault<z.ZodNumber>;
    notifications: z.ZodDefault<z.ZodBoolean>;
    dashboardPort: z.ZodDefault<z.ZodNumber>;
    ignoreServers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    autoRestart: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    pingInterval: number;
    maxRestartAttempts: number;
    degradedThresholdMs: number;
    notifications: boolean;
    dashboardPort: number;
    ignoreServers: string[];
    autoRestart: boolean;
}, {
    pingInterval?: number | undefined;
    maxRestartAttempts?: number | undefined;
    degradedThresholdMs?: number | undefined;
    notifications?: boolean | undefined;
    dashboardPort?: number | undefined;
    ignoreServers?: string[] | undefined;
    autoRestart?: boolean | undefined;
}>;
export type ManagerConfig = z.infer<typeof ManagerConfigSchema>;
export declare function loadManagerConfig(): ManagerConfig;
export declare function discoverAllServers(): DiscoveredServer[];
export declare function getScopeLabel(scope: DiscoveredServer['scope']): string;
export {};
//# sourceMappingURL=config.d.ts.map