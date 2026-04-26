// Phase 10.5b — drift guard between docs/*.md and src/ui/help/*.ts.
//
// Runs the same generator as `npm run docs:build` in check mode. If any
// generated section in docs/LIMITATIONS.md or docs/HOW-IT-WORKS.md differs
// from what the TS data files would produce, fail the test with a hint
// to run `npm run docs:build` and commit. This keeps the in-app /help
// content (which reads the TS data directly) and the markdown docs
// (which the reviewer reads on disk) from silently diverging.

import { describe, it, expect } from 'vitest';
import { generateAll } from '../../scripts/generate-docs.ts';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');

describe('Phase 10.5b — docs drift guard', () => {
  it('docs/LIMITATIONS.md and docs/HOW-IT-WORKS.md are in sync with src/ui/help/*.ts', async () => {
    const result = await generateAll({ check: true, rootDir: repoRoot });
    if (!result.ok) {
      const list = result.changed.join(', ');
      throw new Error(
        `Docs drift detected in: ${list}.\n` +
          'Run `npm run docs:build` and commit the regenerated files.'
      );
    }
    expect(result.ok).toBe(true);
    expect(result.changed.length).toBe(0);
  });
});
