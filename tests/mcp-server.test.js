import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Re-implement humanizeError from mcp-server.ts for testing
function humanizeError(stderr) {
  if (stderr.includes('Cannot find module')) {
    const mod = stderr.match(/Cannot find module '([^']+)'/)?.[1] ?? 'unknown';
    return `Missing module "${mod}" — check that the package is installed (npm install) and the path is correct.`;
  }
  if (stderr.includes('ENOENT')) {
    const path = stderr.match(/ENOENT[^']*'([^']+)'/)?.[1] ?? '';
    return `File or command not found${path ? `: ${path}` : ''}. Check the command path in your MCP config.`;
  }
  if (stderr.includes('EACCES') || stderr.includes('Permission denied'))
    return 'Permission denied — the server process does not have access to a required file or port.';
  if (stderr.includes('EADDRINUSE'))
    return 'Port already in use — another process is using the same port. Stop the other process or change the port.';
  if (stderr.includes('command not found') || stderr.includes('is not recognized'))
    return 'Command not found — the executable is not installed or not in PATH.';
  if (stderr.includes('SyntaxError'))
    return 'JavaScript syntax error in the server code — check for typos or incompatible Node version.';
  if (stderr.includes('ETIMEOUT') || stderr.includes('ETIMEDOUT'))
    return 'Connection timed out — check network connectivity and firewall settings.';
  return stderr.length > 120 ? stderr.slice(0, 120) + '…' : stderr;
}

describe('humanizeError', () => {
  it('extracts module name from Cannot find module', () => {
    const result = humanizeError("Error: Cannot find module '/usr/local/lib/server.js'");
    assert.ok(result.includes('/usr/local/lib/server.js'));
    assert.ok(result.includes('npm install'));
  });

  it('handles Cannot find module without path', () => {
    const result = humanizeError('Cannot find module somewhere');
    assert.ok(result.includes('unknown'));
  });

  it('extracts path from ENOENT', () => {
    const result = humanizeError("Error: ENOENT: no such file or directory, open '/missing/file'");
    assert.ok(result.includes('/missing/file'));
  });

  it('handles ENOENT without path', () => {
    const result = humanizeError('spawn npx ENOENT');
    assert.ok(result.includes('File or command not found'));
  });

  it('handles EACCES', () => {
    const result = humanizeError('Error: EACCES: permission denied');
    assert.ok(result.includes('Permission denied'));
  });

  it('handles Permission denied', () => {
    const result = humanizeError('Permission denied (publickey)');
    assert.ok(result.includes('Permission denied'));
  });

  it('handles EADDRINUSE', () => {
    const result = humanizeError('Error: listen EADDRINUSE: address already in use');
    assert.ok(result.includes('Port already in use'));
  });

  it('handles command not found', () => {
    const result = humanizeError('zsh: command not found: nonexistent');
    assert.ok(result.includes('not installed or not in PATH'));
  });

  it('handles is not recognized (Windows)', () => {
    const result = humanizeError("'npxx' is not recognized as an internal command");
    assert.ok(result.includes('not installed or not in PATH'));
  });

  it('handles SyntaxError', () => {
    const result = humanizeError('SyntaxError: Unexpected token');
    assert.ok(result.includes('syntax error'));
  });

  it('handles ETIMEDOUT', () => {
    const result = humanizeError('Error: connect ETIMEDOUT 1.2.3.4:443');
    assert.ok(result.includes('timed out'));
  });

  it('truncates long unknown errors', () => {
    const long = 'x'.repeat(200);
    const result = humanizeError(long);
    assert.ok(result.length < 200);
    assert.ok(result.endsWith('…'));
  });

  it('returns short unknown errors as-is', () => {
    assert.equal(humanizeError('something went wrong'), 'something went wrong');
  });
});
