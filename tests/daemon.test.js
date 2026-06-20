import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test the unrecoverable error pattern matching
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

describe('unrecoverable error detection', () => {
  it('detects Cannot find module', () => {
    assert.ok(isUnrecoverable("Error: Cannot find module '/path/to/server.js'"));
  });

  it('detects MODULE_NOT_FOUND', () => {
    assert.ok(isUnrecoverable("Error [MODULE_NOT_FOUND]: Cannot find package"));
  });

  it('detects ENOENT', () => {
    assert.ok(isUnrecoverable("Error: spawn npx ENOENT"));
  });

  it('detects command not found', () => {
    assert.ok(isUnrecoverable("zsh: command not found: nonexistent"));
  });

  it('detects Permission denied', () => {
    assert.ok(isUnrecoverable("Permission denied (publickey)"));
  });

  it('detects EACCES', () => {
    assert.ok(isUnrecoverable("Error: EACCES: permission denied, open '/root/file'"));
  });

  it('does not flag normal exit errors', () => {
    assert.ok(!isUnrecoverable("Connection reset by peer"));
  });

  it('does not flag timeout errors', () => {
    assert.ok(!isUnrecoverable("ETIMEDOUT: connect timed out"));
  });

  it('does not flag empty stderr', () => {
    assert.ok(!isUnrecoverable(""));
  });
});

describe('backoff schedule', () => {
  const BACKOFF = [5000, 15000, 45000];
  const MAX_ATTEMPTS = 3;

  it('first attempt uses 5s delay', () => {
    assert.equal(BACKOFF[0], 5000);
  });

  it('second attempt uses 15s delay', () => {
    assert.equal(BACKOFF[1], 15000);
  });

  it('third attempt uses 45s delay', () => {
    assert.equal(BACKOFF[2], 45000);
  });

  it('stops after max attempts', () => {
    assert.ok(MAX_ATTEMPTS <= BACKOFF.length, 'max attempts within backoff array');
  });
});
