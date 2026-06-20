import { spawn, type ChildProcess } from 'child_process';
import type { ManagedServer, ConnectionEvent, ManagerConfig, McpServerConfig, McpScope } from './types.js';
import { notifyDrop, notifyReconnect, notifyFailed, notifyDegraded } from './notifier.js';
import { discoverAllServers } from './config.js';

const BACKOFF = [5000, 15000, 45000];
const PING_TIMEOUT_MS = 5000;

const UNRECOVERABLE_PATTERNS = [
  'Cannot find module',
  'MODULE_NOT_FOUND',
  'ENOENT',
  'command not found',
  'is not recognized',
  'Permission denied',
  'EACCES',
];

export class McpDaemon {
  private servers = new Map<string, ManagedServer>();
  private processes = new Map<string, ChildProcess>();
  private history: ConnectionEvent[] = [];
  private pingTimers = new Map<string, NodeJS.Timeout>();
  private stderrBuffers = new Map<string, string>();
  private config: ManagerConfig;

  constructor(config: ManagerConfig) {
    this.config = config;
  }

  registerServer(name: string, serverConfig: McpServerConfig, scope: McpScope = 'global', sourcePath = ''): void {
    if (this.config.ignoreServers.includes(name)) return;
    this.servers.set(name, {
      name,
      config: serverConfig,
      scope,
      sourcePath,
      state: 'unknown',
      restartAttempts: 0,
    });
    this.startProcess(name);
  }

  private startProcess(name: string): void {
    const server = this.servers.get(name);
    if (!server) return;

    const { command, args = [], env = {} } = server.config;
    try {
      const proc = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.on('spawn', () => {
        const s = this.servers.get(name)!;
        s.pid = proc.pid;
        s.state = 'connected';
        s.lastSeen = new Date();
        s.restartAttempts = 0;
        this.logEvent(name, 'connected');
        if (this.config.notifications) notifyReconnect(name);
        this.schedulePing(name);
      });

      proc.on('exit', (code) => {
        const s = this.servers.get(name);
        if (!s) return;
        s.state = 'dropped';
        const exitMsg = `exited with code ${code ?? 'null'}`;
        const stderr = this.stderrBuffers.get(name)?.trim();
        s.lastError = stderr ? `${exitMsg} — ${stderr}` : exitMsg;
        this.stderrBuffers.delete(name);
        this.logEvent(name, 'dropped', s.lastError);
        this.clearPing(name);

        const unrecoverable = stderr && UNRECOVERABLE_PATTERNS.some(p => stderr.includes(p));
        if (unrecoverable) {
          s.state = 'failed';
          this.logEvent(name, 'failed', `unrecoverable: ${stderr}`);
          if (this.config.notifications) notifyFailed(name);
          return;
        }

        if (this.config.notifications) {
          notifyDrop(name, () => this.restart(name));
        }
        if (this.config.autoRestart) this.scheduleRestart(name, s.restartAttempts);
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const s = this.servers.get(name);
        const text = data.toString().slice(0, 300);
        if (s) s.lastError = text;
        const existing = this.stderrBuffers.get(name) ?? '';
        this.stderrBuffers.set(name, (existing + text).slice(-500));
      });

      this.processes.set(name, proc);
    } catch (err) {
      const s = this.servers.get(name)!;
      s.state = 'failed';
      s.lastError = String(err);
      this.logEvent(name, 'failed', s.lastError);
    }
  }

  private schedulePing(name: string): void {
    this.clearPing(name);
    const timer = setInterval(() => this.ping(name), this.config.pingInterval);
    this.pingTimers.set(name, timer);
  }

  private clearPing(name: string): void {
    const t = this.pingTimers.get(name);
    if (t) { clearInterval(t); this.pingTimers.delete(name); }
  }

  private ping(name: string): void {
    const proc = this.processes.get(name);
    const server = this.servers.get(name);
    if (!proc || !server) return;

    const start = Date.now();
    const id = Math.floor(Math.random() * 100000);
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' }) + '\n';

    let responded = false;
    const timeout = setTimeout(() => {
      if (!responded) {
        server.state = 'dropped';
        this.logEvent(name, 'dropped', 'ping timeout');
        this.clearPing(name);
        if (this.config.notifications) notifyDrop(name, () => this.restart(name));
        if (this.config.autoRestart) this.scheduleRestart(name);
      }
    }, PING_TIMEOUT_MS);

    const onData = (data: Buffer) => {
      try {
        const lines = data.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            responded = true;
            clearTimeout(timeout);
            proc.stdout?.off('data', onData);
            const ms = Date.now() - start;
            server.lastPingMs = ms;
            server.lastSeen = new Date();
            if (ms > this.config.degradedThresholdMs) {
              if (server.state !== 'degraded') {
                server.state = 'degraded';
                this.logEvent(name, 'degraded', undefined, ms);
                if (this.config.notifications) notifyDegraded(name, ms);
              }
            } else {
              server.state = 'connected';
            }
          }
        }
      } catch { /* ignore parse errors from non-ping output */ }
    };

    proc.stdout?.on('data', onData);
    try {
      proc.stdin?.write(msg);
    } catch {
      clearTimeout(timeout);
      proc.stdout?.off('data', onData);
    }
  }

  private scheduleRestart(name: string, attempt = 0): void {
    const server = this.servers.get(name);
    if (!server) return;
    if (attempt >= this.config.maxRestartAttempts) {
      server.state = 'failed';
      this.logEvent(name, 'failed', 'max restart attempts exceeded');
      if (this.config.notifications) notifyFailed(name);
      return;
    }
    const delay = BACKOFF[attempt] ?? 45000;
    setTimeout(() => {
      const s = this.servers.get(name);
      if (!s || s.state !== 'dropped') return;
      s.restartAttempts = attempt + 1;
      this.logEvent(name, 'restarted', `attempt ${attempt + 1}`);
      this.startProcess(name);
    }, delay);
  }

  restart(name: string): void {
    const proc = this.processes.get(name);
    if (proc) {
      try { proc.kill(); } catch { /* already dead */ }
      this.processes.delete(name);
    }
    this.clearPing(name);
    const server = this.servers.get(name);
    if (server) {
      server.state = 'unknown';
      server.restartAttempts = 0;
      const fresh = discoverAllServers().find(s => s.name === name);
      if (fresh) {
        server.config = fresh.config;
        server.sourcePath = fresh.sourcePath;
      }
    }
    this.startProcess(name);
  }

  restartAll(): void {
    for (const [name, server] of this.servers) {
      if (server.state === 'dropped' || server.state === 'failed') {
        this.restart(name);
      }
    }
  }

  private logEvent(
    serverName: string,
    event: ConnectionEvent['event'],
    detail?: string,
    latencyMs?: number,
  ): void {
    this.history.push({ timestamp: new Date(), serverName, event, detail, latencyMs });
    if (this.history.length > 500) this.history.shift();
  }

  getStatus(): ManagedServer[] {
    return Array.from(this.servers.values());
  }

  getHistory(limit = 50): ConnectionEvent[] {
    return this.history.slice(-limit).reverse();
  }

  stopAll(): void {
    for (const [name] of this.servers) {
      this.clearPing(name);
      const proc = this.processes.get(name);
      if (proc) {
        try { proc.kill(); } catch { /* ignore */ }
      }
    }
  }
}
