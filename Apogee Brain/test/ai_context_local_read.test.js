const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.APOGEE_TEST_MODE = '1';

const testVault = path.join(os.tmpdir(), `apogee-ai-context-read-test-${Date.now()}`);
const contextDir = path.join(testVault, '01_Apogee_Core', 'AI_Context');

fs.mkdirSync(contextDir, { recursive: true });

const contextPath = path.join(contextDir, 'Test_Context.md');
fs.writeFileSync(
    contextPath,
    `# Test Context

## Purpose
This is a deterministic AI Context test.

## My Thoughts
This section verifies section retrieval.
`,
    'utf8'
);

process.env.APOGEE_VAULT_PATH = testVault;

const core = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const request = 'Read the Test_Context.md';

assert.deepStrictEqual(
    core.classifyRequestedActions(request).map(({ capability }) => capability),
    ['LOCAL_READ']
);

return core.runSystemPipeline(request).then((result) => {
    assert.strictEqual(result.targetTrack, 'AI Context');
    assert.strictEqual(result.operationalMode, 'Deterministic Local Read');
    assert.ok(result.reply.includes('# Test Context'));
    assert.ok(result.reply.includes('This is a deterministic AI Context test.'));

const sectionRequest = 'Read the Purpose section from the Test_Context.md';
return core.runSystemPipeline(sectionRequest).then((sectionResult) => {
    assert.strictEqual(sectionResult.targetTrack, 'AI Context');
    assert.ok(sectionResult.reply.includes('## Purpose'));
    assert.ok(sectionResult.reply.includes('This is a deterministic AI Context test.'));
    assert.ok(!sectionResult.reply.includes('## My Thoughts'));
    console.log('AI Context section read test passed.');

const traversalRequest = 'Read the ../package.json';
return core.runSystemPipeline(traversalRequest).then((traversalResult) => {
    assert.notStrictEqual(traversalResult.targetTrack, 'AI Context');
    assert.ok(!traversalResult.reply.includes('apogee-brain'));
    console.log('AI Context path boundary test passed.');
});
});

    console.log('AI Context local read test passed.');
});
