import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { it } from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src', import.meta.url));

const sourceFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(target)
        : Promise.resolve(/\.(ts|tsx)$/.test(entry.name) ? [target] : []);
    }),
  );
  return nested.flat();
};

void it('keeps the internal AI service credential out of frontend source', async () => {
  const contents = await Promise.all(
    (await sourceFiles(sourceRoot)).map((file) => readFile(file, 'utf8')),
  );
  assert.equal(
    contents.some((content) => content.includes('AI_SERVICE_API_KEY')),
    false,
  );
  assert.equal(
    contents.some((content) => content.includes('X-CampusConnect-AI-Key')),
    false,
  );
});
