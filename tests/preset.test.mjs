// Invariants of the shared preset that the lander (homeflare-ct100 src/lander) depends on.
// Run: node --test tests/  (no dependencies; Node 20+).
//
// ★ WHY THESE AND NOT A SNAPSHOT. The lander merges a green Renovate pull only when it carries
//   `lander:eligible` and no `hold`. Renovate merges a group's labels as a union and its automerge
//   as an AND (workers/repository/updates/generate.js), so the label is a faithful signal only if
//   EVERY rule that decides automerge also decides the label, the same way. These tests pin that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
const preset = load('default.json');
const lander = load('lander.json');

const ELIGIBLE = ['dependencies', 'lander:eligible'];
const HOLD = ['dependencies', 'hold'];

test('every rule that decides automerge decides the lander label the same way', () => {
  for (const rule of preset.packageRules) {
    if (!('automerge' in rule)) {
      assert.equal('labels' in rule, false, `labels without automerge: ${rule.description}`);
      continue;
    }
    assert.deepEqual(rule.labels, rule.automerge ? ELIGIBLE : HOLD, rule.description);
    assert.equal('addLabels' in rule, false, 'addLabels is a union and cannot drop hold');
  }
});

test('the top-level, lock-file and security lanes carry the label their automerge implies', () => {
  assert.deepEqual(preset.labels, ['dependencies']);
  assert.equal(preset.lockFileMaintenance.automerge, true);
  assert.deepEqual(preset.lockFileMaintenance.labels, ELIGIBLE);
  const vuln = preset.vulnerabilityAlerts;
  assert.equal(vuln.automerge, true);
  assert.deepEqual(vuln.labels, ['dependencies', 'security', 'lander:eligible']);
  assert.equal(vuln.minimumReleaseAge, null);
  assert.equal(vuln.dependencyDashboardApproval, false);
});

test('eligible pulls are rebased when behind; everything else only when conflicted', () => {
  assert.equal(preset.rebaseWhen, 'auto');
  assert.equal(preset.keepUpdatedLabel, 'lander:eligible');
  for (const rule of preset.packageRules) assert.equal('rebaseWhen' in rule, false);
});

test('a pull is opened at once: CI runs on pull_request only, so not-pending never cleared', () => {
  assert.equal(preset.prCreation, 'immediate');
  assert.equal(preset.internalChecksFilter, 'strict');
});

test('third-party majors wait for a dashboard tick; the kit rule turns that back off', () => {
  const rules = preset.packageRules;
  const major = rules.findIndex((r) => r.matchUpdateTypes?.join() === 'major' && !r.matchPackageNames);
  const kit = rules.findIndex((r) => r.matchPackageNames?.includes('@homeflare/**') && r.groupSlug);
  assert.ok(major >= 0 && kit > major, 'kit rule must come after the major rule');
  assert.equal(rules[major].dependencyDashboardApproval, true);
  assert.equal(rules[kit].dependencyDashboardApproval, false);
  assert.equal(rules[kit].prPriority, 10);
  assert.equal(rules[kit].automerge, true);
});

test('kit: a one-hour soak, a canary that takes it at once, and majors held', () => {
  const rules = preset.packageRules;
  const kit = rules.findIndex((r) => r.groupSlug === 'homeflare-kit');
  assert.equal(rules[kit].minimumReleaseAge, '1 hour');
  const canary = rules.findIndex((r) => r.matchRepositories && r.matchPackageNames?.includes('@homeflare/**'));
  assert.ok(canary > kit, 'canary must come after the kit rule to win');
  assert.deepEqual(rules[canary].matchRepositories, ['taslabs-net/homeflare-wiki']);
  assert.equal(rules[canary].minimumReleaseAge, null);
  assert.equal('automerge' in rules[canary], false);
  const major = rules.findIndex((r, i) => i > kit && r.matchPackageNames?.includes('@homeflare/**') && r.matchUpdateTypes?.join() === 'major');
  assert.ok(major > kit);
  assert.equal(rules[major].automerge, false);
  assert.deepEqual(rules[major].labels, HOLD);
});

test('release age: 7 days for npm and PyPI minor/major, before the kit rule that replaces it', () => {
  const rules = preset.packageRules;
  const age = rules.findIndex((r) => r.minimumReleaseAge === '7 days');
  const kit = rules.findIndex((r) => r.groupSlug === 'homeflare-kit');
  assert.ok(age >= 0 && age < kit);
  assert.deepEqual(rules[age].matchDatasources, ['npm', 'pypi']);
  assert.deepEqual(rules[age].matchUpdateTypes, ['minor', 'major']);
  // Only first-party rules set an age besides it, so docker, Go and Actions are never held
  // by a missing timestamp.
  const others = rules.filter(
    (r, i) => i !== age && 'minimumReleaseAge' in r && !r.matchPackageNames?.includes('@homeflare/**'),
  );
  assert.deepEqual(others, []);
});

test('vendored content stays disabled', () => {
  const rule = preset.packageRules.find((r) => r.matchFileNames?.includes('**/talos/charts/**'));
  assert.deepEqual(rule.matchFileNames, ['**/talos/charts/**', '**/os-core-lock/**']);
  assert.equal(rule.enabled, false);
});

test('lander mode leaves Renovate no way to merge', () => {
  assert.equal(lander.automerge, false);
  assert.equal(lander.platformAutomerge, false);
  assert.equal(lander.lockFileMaintenance.automerge, false);
  assert.equal(lander.vulnerabilityAlerts.automerge, false);
  const last = lander.packageRules.at(-1);
  assert.equal(last.automerge, false);
  for (const type of ['major', 'minor', 'patch', 'digest', 'pinDigest', 'lockFileMaintenance']) {
    assert.ok(last.matchUpdateTypes.includes(type), type);
  }
  assert.equal('labels' in lander, false, 'lander mode must not change eligibility');
});
