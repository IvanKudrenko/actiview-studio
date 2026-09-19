import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../web/platform.js', import.meta.url), 'utf8'));

const encoder = new TextEncoder();
const input = new Map([
  ['manifest.json', encoder.encode('{"format":"actiview-export"}\n')],
  ['project/project.json', encoder.encode('{"format":"actiview-project","formatVersion":1}\n')],
]);
const first = ActiViewZip.createZip(input);
const second = ActiViewZip.createZip(input);
assert.deepEqual(first, second, 'browser ZIP output must be deterministic');
const restored = await ActiViewZip.readZip(first);
assert.equal(new TextDecoder().decode(restored.get('project/project.json')), '{"format":"actiview-project","formatVersion":1}\n');
console.log('browser ZIP deterministic export/import: ok');
