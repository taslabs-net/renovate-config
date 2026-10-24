// Exercise installed Renovate code; the executor's dependency adapters cannot run commands.
// RENOVATE_ENGINE_ROOT=/path/to/renovate node --experimental-vm-modules tests/grouped-refresh-engine.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const root = process.env.RENOVATE_ENGINE_ROOT;
assert.ok(root, 'Set RENOVATE_ENGINE_ROOT to the installed Renovate package');
const version = JSON.parse(readFileSync(root + '/package.json')).version;
assert.equal(version, '44.134.1', 'Revalidate this regression against an engine upgrade');
const preset = process.argv[2]
  ? JSON.parse(process.argv[2])
  : JSON.parse(readFileSync(new URL('../default.json', import.meta.url)));
const taskRule = preset.packageRules.find(r => r.matchPackageNames?.join() === '@homeflare/config' && r.postUpgradeTasks);
assert.ok(taskRule, 'Config refresh rule must exist');
const task = taskRule.postUpgradeTasks;
const { generateBranchConfig } = await import(pathToFileURL(root + '/dist/workers/repository/updates/generate.js'));
const { minimatch } = await import(pathToFileURL(root + '/dist/util/minimatch.js'));
const executorPath = root + '/dist/workers/repository/update/branch/execute-post-upgrade-commands.js';
const executorSource = readFileSync(executorPath, 'utf8');
const calls = [];
const reads = [];
let dirtyFiles = [];
const dirtyContents = new Map([
  ['bunfig.toml', Buffer.from('[install]\nexact = true\n')],
  ['.github/workflows/ci.yml', Buffer.from('name: refreshed\n')],
  ['unrelated.txt', Buffer.from('outside the refresh contract\n')],
]);
const config = { allowedCommands: ['^' + task.commands[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'], localDir: '/isolated-fixture' };
const noOp = () => {};
const adapters = {
  regEx: p => new RegExp(p), coerceArray: x => x ?? [], minimatch,
  GlobalConfig: { get: key => config[key] },
  logger: { debug: noOp, trace: noOp, warn: noOp },
  addMeta: noOp, mergeChildConfig: (a, b) => ({ ...a, ...b }),
  compile: value => value,
  isArray: Array.isArray, isNonEmptyArray: x => Array.isArray(x) && x.length > 0,
  isString: x => typeof x === 'string',
  localPathIsFile: async () => false,
  withGitEnvironment: () => async command => { calls.push(command); return {}; },
  getRepoStatus: async () => ({ modified: dirtyFiles, not_added: [], deleted: [] }),
  readLocalFile: async path => {
    assert.ok(dirtyContents.has(path), 'Unexpected fixture read: ' + path);
    reads.push(path);
    return dirtyContents.get(path);
  },
  isFileModeEnabled: async () => false,
};
const executor = new vm.SourceTextModule(executorSource, { identifier: executorPath });
await executor.link((specifier) => {
  const imports = [...executorSource.matchAll(/import \{([^}]+)\} from ["']([^"']+)["']/g)]
    .filter(m => m[2] === specifier).flatMap(m => m[1].split(',').map(s => s.trim()));
  const names = [...new Set([...imports, 'default'])];
  return new vm.SyntheticModule(names, function () {
    for (const name of names) this.setExport(name, adapters[name] ?? (() => {
      throw new Error('Unexpected dependency used: ' + specifier + ':' + name);
    }));
  });
});
await executor.evaluate();

const defaults = { commands: [], fileFilters: [], executionMode: 'update', installTools: {} };
function upgrade(depName, packageFile = 'package.json') {
  return {
    manager: 'npm', branchName: 'renovate/homeflare-kit',
    groupName: 'homeflare-kit', groupSlug: 'homeflare-kit', group: {},
    groupSingleUpdates: true, depType: 'devDependencies', datasource: 'npm',
    currentValue: '0.1.0', currentVersion: '0.1.0', newValue: '0.2.0',
    newVersion: '0.2.0', newMajor: 0, prBodyColumns: [], additionalReviewers: [],
    depName, packageFile, postUpgradeTasks: depName === '@homeflare/config' ? task : defaults,
  };
}
const cases = [
  ['alchemy then config', [upgrade('@homeflare/alchemy'), upgrade('@homeflare/config')], 1],
  ['config then alchemy', [upgrade('@homeflare/config'), upgrade('@homeflare/alchemy')], 1],
  ['config only', [upgrade('@homeflare/config')], 1],
  ['no config', [upgrade('@homeflare/alchemy')], 0],
  ['two config manifests', [upgrade('@homeflare/alchemy'), upgrade('@homeflare/config'), upgrade('@homeflare/config', 'nested/package.json')], 2],
];
let failures = 0;
for (const [name, upgrades, count] of cases) {
  calls.length = 0;
  const branch = generateBranchConfig(upgrades);
  branch.updatedPackageFiles = [{ path: 'package.json', type: 'modification' }];
  branch.updatedArtifacts = [];
  branch.artifactErrors = [];
  const result = await executor.namespace.default(branch);
  try {
    assert.equal(result.artifactErrors.length, 0, 'No blocked task or unexpected tool errors');
    assert.deepEqual(calls, Array(count).fill(task.commands[0]));
    assert.deepEqual(taskRule.matchPackageNames, ['@homeflare/config']);
    console.log('PASS ' + name + ': ' + calls.length + ' invocations');
  } catch (error) {
    failures++;
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
// The pinned executor and minimatch select actual returned artifacts from in-memory dirty files.
// Measured fixture input models the Bun preset migration and preserves the existing CI filter.
calls.length = 0;
dirtyFiles = [...dirtyContents.keys()];
const branch = generateBranchConfig([upgrade('@homeflare/config')]);
branch.updatedPackageFiles = [{ path: 'package.json', type: 'modification' }];
branch.updatedArtifacts = [];
branch.artifactErrors = [];
const selected = await executor.namespace.default(branch);
try {
  assert.equal(selected.artifactErrors.length, 0);
  assert.deepEqual(calls, [task.commands[0]]);
  const expected = ['.github/workflows/ci.yml', 'bunfig.toml'];
  assert.deepEqual(selected.updatedArtifacts.map(file => file.path).sort(), expected);
  assert.deepEqual(reads.sort(), expected);
  for (const artifact of selected.updatedArtifacts) {
    assert.equal(artifact.type, 'addition');
    assert.deepEqual(artifact.contents, dirtyContents.get(artifact.path));
  }
  console.log('PASS artifact selection: bunfig and existing CI file included; unrelated sentinel excluded');
} catch (error) {
  failures++;
  console.error('FAIL artifact selection: ' + error.message);
}
console.log(JSON.stringify({ version, cases: cases.length + 1, failures, commandExecution: 'recorded only; no subprocess or checkout writes', multiplicity: 'once per config upgrade; two manifests produce two refreshes' }));
process.exitCode = failures ? 1 : 0;
