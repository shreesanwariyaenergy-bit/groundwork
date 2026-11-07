// Copies dependency-free shared modules into supabase/functions/_shared so the
// Deno edge functions use exactly the same Think report logic as the apps.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../../../supabase/functions/_shared');
mkdirSync(target, { recursive: true });
for (const file of ['think.ts', 'assessment.ts', 'deep.ts']) {
  const src = readFileSync(resolve(here, '../src', file), 'utf8');
  writeFileSync(resolve(target, file),
    `// GENERATED from packages/shared/src/${file} — do not edit here. Run \`pnpm --filter @groundwork/shared sync:functions\`.\n` + src);
  console.log(`synced ${file} →`, target);
}
