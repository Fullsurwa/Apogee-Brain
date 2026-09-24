const assert = require('assert');
const fs = require('fs');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';

const {
    isAuthoritativeInterviewQuestionRequest,
    retrieveAuthoritativeInterviewQuestions
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const sourcePath = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Authoritative_Interview_Questions.md');
const canonicalQuestions = fs.readFileSync(sourcePath, 'utf8').trim();
const exactRequest = 'Do you have a record of the customer interview questions? Show me the questions only.';
const exactRecordRequest = 'Show me the exact recorded questions.';
const summaryRequest = 'Summarize what we learned from the interviews.';

assert.strictEqual(isAuthoritativeInterviewQuestionRequest(exactRequest), true);
assert.strictEqual(isAuthoritativeInterviewQuestionRequest(exactRecordRequest), true);
assert.strictEqual(isAuthoritativeInterviewQuestionRequest(summaryRequest), false);
assert.strictEqual(retrieveAuthoritativeInterviewQuestions(exactRequest).reply, canonicalQuestions);
assert.strictEqual(retrieveAuthoritativeInterviewQuestions(exactRecordRequest).reply, canonicalQuestions);
assert.strictEqual(retrieveAuthoritativeInterviewQuestions(summaryRequest), null);
assert.doesNotMatch(canonicalQuestions, /hypothesis|follow-up|willingness to pay|summary/i);

console.log('Authoritative interview question retrieval scenarios passed.');
