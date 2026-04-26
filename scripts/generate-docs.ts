// Phase 10.5b — doc generator.
//
// Single source of truth for the per-step caveats, the per-step "how it
// works" summary, and the citations list is the data files under
// src/ui/help/. The hand-written prose lives in docs/*.md. Everything
// between matching <!-- BEGIN GENERATED:topic --> and <!-- END
// GENERATED:topic --> markers is replaced on each run.
//
// Usage:
//   npm run docs:build   — regenerate, write changes
//   npm run docs:check   — verify in-sync, exit 1 on drift
//
// CI guard lives in tests/integration/docs-drift.test.ts and runs
// every `npm test`.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { STEP_EXPLAINERS } from '../src/ui/help/step-explainers.ts';
import { CITATIONS } from '../src/ui/help/citations.ts';

// ---------- section renderers ----------

/** LIMITATIONS.md per-step caveats (one ## heading + bullet list per step). */
export function renderLimitationsCaveats(): string {
  const out: string[] = [];
  for (const s of STEP_EXPLAINERS) {
    out.push(`## ${s.title}`);
    out.push('');
    for (const c of s.caveats) {
      out.push(`- ${c}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

/** HOW-IT-WORKS.md per-step summary (### heading + what + sensitivity). */
export function renderHowItWorksSteps(): string {
  const out: string[] = [];
  for (const s of STEP_EXPLAINERS) {
    out.push(`### ${s.title}`);
    out.push('');
    out.push(s.what);
    out.push('');
    out.push(`*Sensitivity:* ${s.sensitivity}`);
    out.push('');
  }
  return out.join('\n').trim();
}

/** HOW-IT-WORKS.md sources & citations list. */
export function renderCitationsList(): string {
  const out: string[] = [];
  for (const c of CITATIONS) {
    out.push(`### ${c.topic}`);
    out.push('');
    out.push(`**Value:** ${c.value}`);
    out.push('');
    out.push(`**Source:** ${c.source}`);
    out.push('');
    out.push(`**Reference:** ${c.reference}`);
    if (c.url) {
      out.push('');
      out.push(`**URL:** <${c.url}>`);
    }
    out.push('');
    out.push(`**Used by:** ${c.consumedBy.join(' · ')}`);
    if (c.notes) {
      out.push('');
      out.push(`**Notes:** ${c.notes}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

// ---------- splicer ----------

interface SectionGenerator {
  marker: string;
  render: () => string;
}

interface DocConfig {
  filePath: string;
  sections: SectionGenerator[];
}

const DOCS: DocConfig[] = [
  {
    filePath: 'docs/LIMITATIONS.md',
    sections: [{ marker: 'per-step-caveats', render: renderLimitationsCaveats }],
  },
  {
    filePath: 'docs/HOW-IT-WORKS.md',
    sections: [
      { marker: 'step-summaries', render: renderHowItWorksSteps },
      { marker: 'citations', render: renderCitationsList },
    ],
  },
];

/**
 * Replace the body between BEGIN/END markers for the given topic.
 * The markers themselves are preserved. Throws if either marker is
 * missing or out of order.
 */
export function spliceSection(content: string, marker: string, generated: string): string {
  const begin = `<!-- BEGIN GENERATED:${marker} -->`;
  const end = `<!-- END GENERATED:${marker} -->`;
  const beginIdx = content.indexOf(begin);
  const endIdx = content.indexOf(end);
  if (beginIdx < 0) {
    throw new Error(`Marker not found: ${begin}`);
  }
  if (endIdx < 0) {
    throw new Error(`Marker not found: ${end}`);
  }
  if (endIdx < beginIdx) {
    throw new Error(`END marker before BEGIN marker for ${marker}`);
  }
  const before = content.slice(0, beginIdx + begin.length);
  const after = content.slice(endIdx);
  return `${before}\n\n${generated}\n\n${after}`;
}

export interface GenerateResult {
  changed: string[];
  ok: boolean;
}

/**
 * Apply every generator to its target file. In `check` mode, returns
 * the list of files that WOULD be changed without writing. In write
 * mode, writes them and returns the same list.
 */
export async function generateAll(
  options: { check: boolean; rootDir?: string } = { check: false }
): Promise<GenerateResult> {
  const root = options.rootDir ?? process.cwd();
  const changed: string[] = [];
  for (const doc of DOCS) {
    const fullPath = path.join(root, doc.filePath);
    const oldText = await fs.readFile(fullPath, 'utf-8');
    let newText = oldText;
    for (const sec of doc.sections) {
      const generated = sec.render();
      newText = spliceSection(newText, sec.marker, generated);
    }
    if (newText !== oldText) {
      changed.push(doc.filePath);
      if (!options.check) {
        await fs.writeFile(fullPath, newText);
      }
    }
  }
  return { changed, ok: options.check ? changed.length === 0 : true };
}

// ---------- CLI entry ----------

const __filename = url.fileURLToPath(import.meta.url);
const isCli =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isCli) {
  const check = process.argv.includes('--check');
  generateAll({ check }).then(
    (r) => {
      if (check && !r.ok) {
        console.error('[docs-drift] generated content differs from these files:');
        for (const f of r.changed) console.error(`  - ${f}`);
        console.error('Run `npm run docs:build` and commit the result.');
        process.exit(1);
      }
      if (!check && r.changed.length > 0) {
        console.log(`Updated ${r.changed.length} file(s):`);
        for (const f of r.changed) console.log(`  - ${f}`);
      } else if (!check) {
        console.log('Docs already up to date.');
      } else {
        console.log('Docs are in sync.');
      }
    },
    (err) => {
      console.error('[docs-drift] error:', err);
      process.exit(2);
    }
  );
}
