const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.APOGEE_TEST_MODE = '1';

const testVault = path.join(os.tmpdir(), `apogee-project-state-test-${Date.now()}`);
const projectDir = path.join(testVault, '03_Active_Engine', 'Perfume Vending Validation');
const projectPath = path.join(projectDir, '_Project_Context.md');

fs.mkdirSync(projectDir, { recursive: true });

const originalState = `- Initial test state.
- Second line of state.`;

const projectContext = `# Project
- Name: Perfume Vending Machine
- Owner: Apogee SKOPE LLP
- Status: TESTING / VALIDATION
- Last updated: 2026-09-04

## Current state
${originalState}

## Next actions
- [ ] Preserve this action.

## Decisions, risks, and dependencies
- Test fixture only.
`;

fs.writeFileSync(projectPath, projectContext, 'utf8');
process.env.APOGEE_VAULT_PATH = testVault;

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
const unknownProject = core.updateProjectCurrentState('Unknown Project', 'Some state');
assert.strictEqual(unknownProject.ok, false);
assert.match(unknownProject.reason, /Unknown project/i);

const emptyState = core.updateProjectCurrentState('Perfume Vending Machine', '');
assert.strictEqual(emptyState.ok, false);
assert.match(emptyState.reason, /new current state is required/i);

const missingProjectPath = path.join(projectDir, '_Project_Context.md');
fs.renameSync(missingProjectPath, missingProjectPath + '.missing');
const missingFile = core.updateProjectCurrentState('Perfume Vending Machine', 'Should not be written.');
assert.strictEqual(missingFile.ok, false);
assert.match(missingFile.reason, /does not exist/i);
fs.renameSync(missingProjectPath + '.missing', missingProjectPath);


const request = 'Update the current state for Perfume Vending Machine to Customer interviews are now underway.';

assert.deepStrictEqual(
    core.classifyRequestedActions(request).map(({ capability }) => capability),
    ['PROJECT_STATE_UPDATE']
);

const preflight = core.buildCapabilityPreflight(request);
assert.deepStrictEqual(preflight.actions.map(({ capability }) => capability), ['PROJECT_STATE_UPDATE']);
assert.strictEqual(preflight.handoffs.length, 0);
assert.strictEqual(preflight.answerNowTranscript, '');

(async () => {
    const claudeBefore = core.providerCallCounts.claude;
    const ollamaBefore = core.providerCallCounts.ollama;

    const result = await core.runSystemPipeline(request);

    assert.strictEqual(result.operationalMode, 'Deterministic Project State Update');
    assert.strictEqual(result.projectStateUpdate.verified, true);
    assert.match(result.reply, /verified the written state/i);

    assert.strictEqual(core.providerCallCounts.claude - claudeBefore, 0);
    assert.strictEqual(core.providerCallCounts.ollama - ollamaBefore, 0);

    const written = fs.readFileSync(projectPath, 'utf8');
    assert.match(written, /## Current state/);
    assert.match(written, /Customer interviews are now underway\./);
    assert.match(written, /## Next actions/);
    assert.match(written, /Preserve this action\./);
    assert.doesNotMatch(written, /Initial test state/);

    console.log('Project state update scenarios passed.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
