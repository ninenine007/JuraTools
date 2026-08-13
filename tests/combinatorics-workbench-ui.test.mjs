import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const toolUrl = new URL('../utilities/combinatorics-workbench.html', import.meta.url);
const html = fs.readFileSync(toolUrl, 'utf8');
const utilityHub = fs.readFileSync(new URL('../utilities/index.html', import.meta.url), 'utf8');
const mainHub = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('hosted workbench is self-contained and every inline script parses', () => {
  assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2);
  scripts.forEach((source) => assert.doesNotThrow(() => new vm.Script(source)));
});

test('the Phase 1 operating controls are present and IDs are unique', () => {
  for (const id of [
    'calculateBtn', 'membersTable', 'constraintList', 'visualStage', 'resultContent',
    'generateBtn', 'pauseBtn', 'cancelBtn', 'csvInput', 'fileInput', 'shareBtn',
    'exportModelBtn', 'exportOutcomesBtn', 'printBtn', 'templateGrid', 'factorValues'
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(html, /new Worker\(/);
  assert.match(html, /BigInt/);
  assert.match(html, /role="tab"/);
  assert.match(html, /aria-selected=/);
  assert.match(html, /<progress[^>]+id="progressBar"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /\.inert=true/);
  assert.match(html, /surface seed d348f6e5/);
  assert.match(html, /juratools_combinatorics_workbench_v1/);
  assert.match(html, /Runs entirely|processing stays|stays in this browser/i);
  assert.match(html, /id="resetBtn"/);
  assert.match(html, /Reference tool only — not legal advice/);
  assert.match(html, /Streaming export is recommended/);
  assert.match(html, /constraint\.tag=tagName/);
  assert.match(html, /anonymized-combinatorics-model/);
  assert.match(html, /method==='distribution'.*method==='stars-bars'/s);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML IDs must be unique');
});

test('JuraTools hubs publish the workbench at a relative hosted path', () => {
  assert.match(utilityHub, /href="combinatorics-workbench\.html"/);
  assert.match(utilityHub, /Combinatorics Workbench/);
  assert.match(mainHub, /8 tools/);
  assert.match(mainHub, /Combinatorics Workbench/);
});
