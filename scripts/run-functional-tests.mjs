#!/usr/bin/env node
import { spawn } from 'node:child_process';
import net from 'node:net';

function parseDbTarget(rawUrl) {
  if (!rawUrl) return { host: 'localhost', port: 5432, source: 'default' };
  try {
    const u = new URL(rawUrl);
    return {
      host: u.hostname || 'localhost',
      port: Number(u.port || 5432),
      source: 'DATABASE_URL/TEST_DATABASE_URL',
    };
  } catch {
    return { host: 'localhost', port: 5432, source: 'default' };
  }
}

function canConnect({ host, port }, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function main() {
  const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  const target = parseDbTarget(dbUrl);
  const reachable = await canConnect(target);

  if (!reachable) {
    const msg = `[functional-test-preflight] PostgreSQL unreachable at ${target.host}:${target.port} (${target.source}).`;
    if (process.env.CI === 'true') {
      console.error(`${msg} Failing in CI.`);
      process.exit(1);
    }

    console.warn(`${msg} Skipping functional suite locally. Set TEST_DATABASE_URL or start DB to run full tests.`);
    process.exit(0);
  }

  const child = spawn('npx', ['vitest', '--run', 'tests/functional'], {
    stdio: 'inherit',
    env: process.env,
    shell: false,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error('[functional-test-preflight] Unexpected error:', err);
  process.exit(1);
});
