const assert = require('assert');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';

const { normalizeResult } = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

// This is the exact proven production failure from Session Logs/interaction_history.json:
// a request for exact literal output ("Reply with exactly: OLLAMA_FINAL_TEST") produced valid
// JSON with no usable reply, and normalizeResult fabricated "Request processed successfully."

const FABRICATED_SUCCESS = 'Request processed successfully.';

// --- Case 1: valid JSON with no `reply` field at all ---------------------------------------

assert.throws(
    () => normalizeResult('Reply with exactly: OLLAMA_FINAL_TEST', JSON.stringify({ answer: 'OLLAMA_FINAL_TEST' }), 'Local Ollama'),
    /no usable reply/i,
    'Valid JSON with a missing reply field must not be normalized into a fabricated success result.'
);

// --- Case 2: valid JSON with an empty/whitespace `reply` -------------------------------------

assert.throws(
    () => normalizeResult('some prompt', JSON.stringify({ reply: '   ' }), 'Local Ollama'),
    /no usable reply/i,
    'Valid JSON with a whitespace-only reply must not be normalized into a fabricated success result.'
);

assert.throws(
    () => normalizeResult('some prompt', JSON.stringify({ reply: '' }), 'Local Mode'),
    /no usable reply/i,
    'Valid JSON with an empty-string reply must not be normalized into a fabricated success result.'
);

// --- Case 3: valid JSON with a genuine, non-empty `reply` continues to work unchanged --------

const genuineOllamaResult = normalizeResult('some prompt', JSON.stringify({ reply: 'OLLAMA_FINAL_TEST', targetTrack: 'General' }), 'Local Ollama');
assert.strictEqual(genuineOllamaResult.reply, 'OLLAMA_FINAL_TEST');
assert.notStrictEqual(genuineOllamaResult.reply, FABRICATED_SUCCESS);
assert.strictEqual(genuineOllamaResult.operationalMode, 'Local Ollama');

const genuineClaudeResult = normalizeResult('some prompt', JSON.stringify({ reply: 'A genuine synthesized answer.', targetTrack: 'Operations', operationalMode: 'Local Mode' }), 'Local Mode');
assert.strictEqual(genuineClaudeResult.reply, 'A genuine synthesized answer.');
assert.strictEqual(genuineClaudeResult.targetTrack, 'Operations');

// Non-JSON plain text responses (the pre-existing catch branch) must be entirely unaffected.
const plainTextResult = normalizeResult('some prompt', 'Just a plain text answer, not JSON at all.', 'Local Mode');
assert.strictEqual(plainTextResult.reply, 'Just a plain text answer, not JSON at all.');

console.log('normalizeResult truthful-confirmation regression scenarios passed.');
