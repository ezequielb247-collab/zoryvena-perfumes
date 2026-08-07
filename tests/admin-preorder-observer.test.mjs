import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../admin/preorder.js', import.meta.url), 'utf8');

assert.doesNotMatch(source, /observer\.observe\(document\.documentElement/);
assert.match(source, /if \(supplier && supplier\.textContent !== supplierText\) supplier\.textContent = supplierText;/);
assert.match(source, /function scheduleEnhance\(\)/);
assert.match(source, /window\.requestAnimationFrame/);
assert.match(source, /observer\.observe\(productBody/);
assert.match(source, /observer\.observe\(ordersBody/);

console.log('admin preorder observer regression tests: ok');
