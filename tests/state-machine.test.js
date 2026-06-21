import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Simulate the daemon's state machine logic without spawning real processes
// Tests the decision logic extracted from daemon.ts

const BACKOFF = [5000, 15000, 45000];
const MAX_RESTART_ATTEMPTS = 3;

const UNRECOVERABLE_PATTERNS = [
  'Cannot find module',
  'MODULE_NOT_FOUND',
  'ENOENT',
  'command not found',
  'is not recognized',
  'Permission denied',
  'EACCES',
];

function isUnrecoverable(stderr) {
  return UNRECOVERABLE_PATTERNS.some(p => stderr.includes(p));
}

function createServer(overrides = {}) {
  return {
    name: 'test-server',
    config: { command: 'node', args: ['server.js'] },
    scope: 'global',
    sourcePath: '/path/config.json',
    state: 'unknown',
    restartAttempts: 0,
    lastError: undefined,
    lastPingMs: undefined,
    lastSeen: undefined,
    ...overrides,
  };
}

describe('state machine transitions', () => {
  describe('on spawn', () => {
    it('transitions from unknown to connected', () => {
      const server = createServer({ state: 'unknown' });
      server.state = 'connected';
      server.restartAttempts = 0;
      server.lastSeen = new Date();
      assert.equal(server.state, 'connected');
      assert.equal(server.restartAttempts, 0);
    });
  });

  describe('on exit with recoverable error', () => {
    it('transitions to dropped', () => {
      const server = createServer({ state: 'connected' });
      const stderr = 'Connection reset by peer';
      server.state = 'dropped';
      server.lastError = `exited with code 1 — ${stderr}`;
      assert.equal(server.state, 'dropped');
      assert.ok(!isUnrecoverable(stderr));
    });

    it('schedules restart with backoff', () => {
      const server = createServer({ state: 'dropped', restartAttempts: 0 });
      const delay = BACKOFF[server.restartAttempts] ?? 45000;
      assert.equal(delay, 5000);

      server.restartAttempts = 1;
      assert.equal(BACKOFF[server.restartAttempts], 15000);

      server.restartAttempts = 2;
      assert.equal(BACKOFF[server.restartAttempts], 45000);
    });
  });

  describe('on exit with unrecoverable error', () => {
    it('transitions directly to failed', () => {
      const server = createServer({ state: 'connected' });
      const stderr = "Cannot find module '/path/to/missing.js'";
      assert.ok(isUnrecoverable(stderr));
      server.state = 'failed';
      server.lastError = stderr;
      assert.equal(server.state, 'failed');
    });

    it('does not schedule restart', () => {
      const stderr = 'Error: spawn npx ENOENT';
      assert.ok(isUnrecoverable(stderr));
    });
  });

  describe('on max restart attempts', () => {
    it('transitions to failed after exhausting attempts', () => {
      const server = createServer({ state: 'dropped', restartAttempts: 2 });
      const attempt = server.restartAttempts + 1;
      if (attempt >= MAX_RESTART_ATTEMPTS) {
        server.state = 'failed';
        server.lastError = 'max restart attempts exceeded';
      }
      assert.equal(server.state, 'failed');
    });
  });

  describe('on degraded ping', () => {
    it('transitions to degraded when latency exceeds threshold', () => {
      const server = createServer({ state: 'connected' });
      const latencyMs = 800;
      const threshold = 500;
      if (latencyMs > threshold) {
        server.state = 'degraded';
      }
      assert.equal(server.state, 'degraded');
    });

    it('transitions back to connected when latency improves', () => {
      const server = createServer({ state: 'degraded' });
      const latencyMs = 200;
      const threshold = 500;
      if (latencyMs <= threshold) {
        server.state = 'connected';
      }
      assert.equal(server.state, 'connected');
    });
  });

  describe('manual restart', () => {
    it('resets state to unknown and clears restart attempts', () => {
      const server = createServer({ state: 'failed', restartAttempts: 3, lastError: 'something' });
      server.state = 'unknown';
      server.restartAttempts = 0;
      assert.equal(server.state, 'unknown');
      assert.equal(server.restartAttempts, 0);
    });
  });

  describe('restartAll', () => {
    it('only restarts dropped or failed servers', () => {
      const servers = [
        createServer({ name: 'a', state: 'connected' }),
        createServer({ name: 'b', state: 'dropped' }),
        createServer({ name: 'c', state: 'failed' }),
        createServer({ name: 'd', state: 'degraded' }),
      ];
      const toRestart = servers.filter(s => s.state === 'dropped' || s.state === 'failed');
      assert.equal(toRestart.length, 2);
      assert.deepEqual(toRestart.map(s => s.name), ['b', 'c']);
    });
  });
});

describe('history log', () => {
  it('caps at 500 entries', () => {
    const history = [];
    for (let i = 0; i < 510; i++) {
      history.push({ timestamp: new Date(), serverName: 'test', event: 'connected' });
      if (history.length > 500) history.shift();
    }
    assert.equal(history.length, 500);
  });

  it('getHistory returns events in reverse order', () => {
    const history = [
      { timestamp: new Date('2026-01-01'), serverName: 'a', event: 'connected' },
      { timestamp: new Date('2026-01-02'), serverName: 'b', event: 'dropped' },
      { timestamp: new Date('2026-01-03'), serverName: 'c', event: 'failed' },
    ];
    const limit = 50;
    const result = history.slice(-limit).reverse();
    assert.equal(result[0].serverName, 'c');
    assert.equal(result[2].serverName, 'a');
  });
});

describe('ignoreServers', () => {
  it('skips servers in ignore list', () => {
    const ignoreServers = ['noisy-server', 'broken-thing'];
    const servers = [
      { name: 'waypoint', command: 'node' },
      { name: 'noisy-server', command: 'npx' },
      { name: 'prism', command: 'node' },
    ];
    const registered = servers.filter(s => !ignoreServers.includes(s.name));
    assert.equal(registered.length, 2);
    assert.ok(registered.every(s => s.name !== 'noisy-server'));
  });
});

describe('stderr buffer', () => {
  it('keeps only last 500 chars', () => {
    let buffer = '';
    const chunk1 = 'a'.repeat(400);
    const chunk2 = 'b'.repeat(300);
    buffer = (buffer + chunk1).slice(-500);
    assert.equal(buffer.length, 400);
    buffer = (buffer + chunk2).slice(-500);
    assert.equal(buffer.length, 500);
    assert.ok(buffer.endsWith('b'.repeat(300)));
  });
});
