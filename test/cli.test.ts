import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = (...args: string[]) =>
  promisify(execFile)('node_modules/.bin/tsx', ['scripts/cli.ts', ...args]).then(
    (r) => ({ code: 0, ...r }),
    (e: { code: number; stdout: string; stderr: string }) => ({ code: e.code, stdout: e.stdout, stderr: e.stderr }),
  );

describe('command line', () => {
  it('draws the sample with a preset and options', async () => {
    const out = 'out/test-cli.svg';
    const r = await run('--sample', '--preset', 'gallery', '--title', 'CLI Test', '--units', 'mi', '--distance', 'monthly', '--out', out);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('300 drawn');
    const svg = await readFile(out, 'utf8');
    expect(svg).toContain('>CLI TEST<'); // Gallery sets the title in capitals
    expect(svg).toContain('class="distance"');
  }, 30_000);

  it('refuses bad values with a clear message, not a broken image', async () => {
    for (const [args, message] of [
      [['--aspect', '2:1'], '--aspect must be one of'],
      [['--mode', 'freq'], '--mode must be one of: pace, frequency'],
      [['--fit', '120'], '--fit must be a number from 50 to 100'],
      [['--color-a', 'blue'], '--color-a must be a color'],
      [['--preset', 'nope'], 'Unknown preset "nope"'],
    ] as const) {
      const r = await run('--sample', ...args);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(message);
    }
  }, 60_000);
});
