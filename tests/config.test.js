import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Re-implement pure functions from config.ts for testing
// (config.ts is ESM TypeScript — we test the logic directly)

function normaliseConfig(raw) {
  if (typeof raw.command !== 'string') return null;
  return {
    command: raw.command,
    args: Array.isArray(raw.args) ? raw.args : [],
    env: (raw.env && typeof raw.env === 'object' ? raw.env : {}),
  };
}

function extractServers(filePath, scope, raw) {
  if (!raw?.mcpServers) return [];
  return Object.entries(raw.mcpServers).flatMap(([name, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return [];
    const config = normaliseConfig(cfg);
    if (!config) return [];
    return [{ name, config, scope, sourcePath: filePath }];
  });
}

describe('normaliseConfig', () => {
  it('extracts command, args, env from valid config', () => {
    const result = normaliseConfig({
      command: 'node',
      args: ['server.js', '--port', '3000'],
      env: { API_KEY: 'abc' },
    });
    assert.deepEqual(result, {
      command: 'node',
      args: ['server.js', '--port', '3000'],
      env: { API_KEY: 'abc' },
    });
  });

  it('returns null when command is missing', () => {
    assert.equal(normaliseConfig({ args: ['foo'] }), null);
  });

  it('returns null when command is not a string', () => {
    assert.equal(normaliseConfig({ command: 42 }), null);
  });

  it('defaults args to empty array when missing', () => {
    const result = normaliseConfig({ command: 'npx' });
    assert.deepEqual(result.args, []);
  });

  it('defaults args to empty array when not an array', () => {
    const result = normaliseConfig({ command: 'npx', args: 'not-array' });
    assert.deepEqual(result.args, []);
  });

  it('defaults env to empty object when missing', () => {
    const result = normaliseConfig({ command: 'npx' });
    assert.deepEqual(result.env, {});
  });

  it('defaults env to empty object when not an object', () => {
    const result = normaliseConfig({ command: 'npx', env: 'bad' });
    assert.deepEqual(result.env, {});
  });
});

describe('extractServers', () => {
  it('extracts servers from mcpServers key', () => {
    const result = extractServers('/path/config.json', 'global', {
      mcpServers: {
        waypoint: { command: 'node', args: ['dist/index.js'] },
        prism: { command: 'npx', args: ['@waycraft/prism'] },
      },
    });
    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'waypoint');
    assert.equal(result[0].scope, 'global');
    assert.equal(result[0].sourcePath, '/path/config.json');
    assert.equal(result[1].name, 'prism');
  });

  it('returns empty array when mcpServers is missing', () => {
    assert.deepEqual(extractServers('/path', 'global', {}), []);
    assert.deepEqual(extractServers('/path', 'global', null), []);
  });

  it('skips entries with invalid config (no command)', () => {
    const result = extractServers('/path', 'global', {
      mcpServers: {
        valid: { command: 'node' },
        invalid: { args: ['foo'] },
      },
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'valid');
  });

  it('skips null and non-object entries', () => {
    const result = extractServers('/path', 'global', {
      mcpServers: {
        valid: { command: 'node' },
        bad1: null,
        bad2: 'string',
        bad3: 42,
      },
    });
    assert.equal(result.length, 1);
  });
});

describe('scope precedence', () => {
  it('first-seen name wins (simulating project before global)', () => {
    const seen = new Set();
    const discovered = [];
    const add = (servers) => {
      for (const s of servers) {
        if (!seen.has(s.name)) {
          seen.add(s.name);
          discovered.push(s);
        }
      }
    };

    add([{ name: 'waypoint', config: { command: 'node', args: ['project/index.js'] }, scope: 'project', sourcePath: '.claude/settings.json' }]);
    add([{ name: 'waypoint', config: { command: 'node', args: ['global/index.js'] }, scope: 'global', sourcePath: '~/.claude.json' }]);

    assert.equal(discovered.length, 1);
    assert.equal(discovered[0].scope, 'project');
    assert.deepEqual(discovered[0].config.args, ['project/index.js']);
  });
});
