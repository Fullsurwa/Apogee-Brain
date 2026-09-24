const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.APOGEE_VAULT_PATH = path.join(os.tmpdir(), `apogee-structured-memory-failure-${Date.now()}`);

const {
    recordStructuredMemory,
    readMemoryStore
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

// This is the exact proven production failure text from Session Logs/apogee_memory.json
// (project_validations entry with evidence[0].detail === this string).
const MODEL_FAILURE_REPLY = 'Claude processing failed. See the terminal error details.';
const AUTH_FAILURE_REPLY = 'API authentication failed. Please check your API key.';

const ideaLikeEvidencePrompt = 'Analyse Customer Interviews #001 through #005 together. Tell me where the ' +
    'evidence currently points regarding the perfume vending hypothesis, based on tested customer signal and ' +
    'validated pilot data.';

// --- Scenario 1: Claude/runtime failure must NOT be persisted as hypothesis/validation evidence -----------

const failureResponse = {
    reply: MODEL_FAILURE_REPLY,
    targetTrack: 'General',
    operationalMode: 'Local Fallback',
    systemHealthScore: '100%'
};

recordStructuredMemory(ideaLikeEvidencePrompt, failureResponse);

const storeAfterFailure = readMemoryStore();
const failureValidationEntry = storeAfterFailure.project_validations.find(
    (entry) => entry.hypothesis === ideaLikeEvidencePrompt
);
assert.ok(failureValidationEntry, 'Expected a project_validations entry to be recorded for the idea-like prompt.');
assert.deepStrictEqual(
    failureValidationEntry.evidence,
    [],
    'A model/runtime failure message must not be persisted as project_validations evidence.'
);
assert.strictEqual(
    failureValidationEntry.status,
    'UNVALIDATED',
    'With no genuine evidence, the validation record must remain UNVALIDATED, not TESTING.'
);
assert.ok(
    !JSON.stringify(storeAfterFailure.hypotheses).includes(MODEL_FAILURE_REPLY),
    'A model/runtime failure message must not appear anywhere inside hypotheses.'
);
assert.ok(
    !JSON.stringify(storeAfterFailure.project_validations).includes(MODEL_FAILURE_REPLY),
    'A model/runtime failure message must not appear anywhere inside project_validations.'
);

// The failure may still be recorded through the existing operational mechanisms
// (lessons + experiences) -- this behavior must be preserved unchanged.
assert.ok(
    storeAfterFailure.lessons.some((lesson) => lesson.evidence === MODEL_FAILURE_REPLY),
    'The existing operational "lessons" recording of model failures must still occur.'
);
assert.ok(
    storeAfterFailure.experiences.some((experience) => experience.outcome === MODEL_FAILURE_REPLY),
    'The existing operational "experiences" recording of the interaction must still occur.'
);

console.log('Failure-state persistence guard: Claude/runtime failure scenario passed.');

// --- Scenario 2: an authentication-failure reply must also be excluded from evidence -----------------------

const authFailureResponse = {
    reply: AUTH_FAILURE_REPLY,
    targetTrack: 'General',
    operationalMode: 'Local Fallback',
    systemHealthScore: '100%'
};

recordStructuredMemory(ideaLikeEvidencePrompt, authFailureResponse);

const storeAfterAuthFailure = readMemoryStore();
const authFailureValidationEntry = storeAfterAuthFailure.project_validations.find(
    (entry) => entry.hypothesis === ideaLikeEvidencePrompt
);
assert.ok(authFailureValidationEntry);
assert.deepStrictEqual(
    authFailureValidationEntry.evidence,
    [],
    'An authentication-failure message must not be persisted as project_validations evidence.'
);

console.log('Failure-state persistence guard: authentication-failure scenario passed.');

// --- Scenario 3: a genuine evidence-bearing response must still flow through unchanged ----------------------

const genuineReply = 'Three of five customers reported tested, verified customer signal supporting the ' +
    'hypothesis; validated pilot data remains incomplete.';
const genuineResponse = {
    reply: genuineReply,
    targetTrack: 'General',
    operationalMode: 'Local Mode',
    systemHealthScore: '100%'
};

recordStructuredMemory(ideaLikeEvidencePrompt, genuineResponse);

const storeAfterGenuine = readMemoryStore();
const genuineValidationEntry = storeAfterGenuine.project_validations.find(
    (entry) => entry.hypothesis === ideaLikeEvidencePrompt
);
assert.ok(genuineValidationEntry);
assert.strictEqual(genuineValidationEntry.evidence.length, 1, 'A genuine evidence-bearing reply must still be recorded as evidence.');
assert.strictEqual(genuineValidationEntry.evidence[0].detail, genuineReply.slice(0, 500));
assert.strictEqual(
    genuineValidationEntry.status,
    'TESTING',
    'A genuine evidence-bearing reply must still move the validation record to TESTING.'
);

console.log('Failure-state persistence guard: genuine evidence scenario passed (unaffected by the fix).');

fs.rmSync(process.env.APOGEE_VAULT_PATH, { recursive: true, force: true });

console.log('Structured memory failure-state persistence guard scenarios passed.');
