const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';

const { createSkill } = require('../03_Active_Engine/Skills/skill.js');
const { customerValidationSkill } = require('../03_Active_Engine/Skills/customer_validation_skill.js');
const coreEngine = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
const evidenceRules = require('../03_Active_Engine/Brains/core-engine/evidence_classification_rules.js');

// --- Skill abstraction contract -------------------------------------------------

assert.throws(() => createSkill({}), /non-empty string id/);
assert.throws(() => createSkill({ id: 'x' }), /non-empty string description/);
assert.throws(() => createSkill({ id: 'x', description: 'd' }), /capabilities object/);
assert.throws(
    () => createSkill({ id: 'x', description: 'd', capabilities: { foo: 'not-a-function' } }),
    /must reference an existing function/
);
assert.throws(
    () => createSkill({ id: 'x', description: 'd', capabilities: {}, matches: () => true }),
    /run\(transcript, context\) function/
);
assert.throws(
    () => createSkill({ id: 'x', description: 'd', capabilities: {}, run: () => null }),
    /matches\(transcript\) function/
);

const trivialSkill = createSkill({
    id: 'trivial',
    description: 'Trivial skill for contract verification.',
    capabilities: { noop: () => null },
    matches: () => false,
    run: () => null
});
assert.strictEqual(trivialSkill.id, 'trivial');
assert.strictEqual(Object.isFrozen(trivialSkill), true);
trivialSkill.id = 'mutated';
assert.strictEqual(trivialSkill.id, 'trivial');

console.log('Skill abstraction contract scenarios passed.');

// --- Customer Validation Skill: identity and capability references --------------

assert.strictEqual(customerValidationSkill.id, 'customer-validation');
assert.strictEqual(typeof customerValidationSkill.matches, 'function');
assert.strictEqual(typeof customerValidationSkill.run, 'function');

// Every referenced capability must be the SAME function object exported by the
// existing modules -- proving the Skill orchestrates, rather than reimplements.
assert.strictEqual(customerValidationSkill.capabilities.isAuthoritativeInterviewQuestionRequest, coreEngine.isAuthoritativeInterviewQuestionRequest);
assert.strictEqual(customerValidationSkill.capabilities.retrieveAuthoritativeInterviewQuestions, coreEngine.retrieveAuthoritativeInterviewQuestions);
assert.strictEqual(customerValidationSkill.capabilities.isAuthoritativeInterviewEvidenceRequest, coreEngine.isAuthoritativeInterviewEvidenceRequest);
assert.strictEqual(customerValidationSkill.capabilities.retrieveAuthoritativeInterviewEvidence, coreEngine.retrieveAuthoritativeInterviewEvidence);
assert.strictEqual(customerValidationSkill.capabilities.isAuthoritativeInterviewAnalysisRequest, coreEngine.isAuthoritativeInterviewAnalysisRequest);
assert.strictEqual(customerValidationSkill.capabilities.ingestAuthoritativeCustomerInterview, coreEngine.ingestAuthoritativeCustomerInterview);
assert.strictEqual(customerValidationSkill.capabilities.buildEvidenceLedger, coreEngine.buildEvidenceLedger);
assert.strictEqual(customerValidationSkill.capabilities.retrieveAuthoritativeEvidenceLedger, coreEngine.retrieveAuthoritativeEvidenceLedger);
assert.strictEqual(customerValidationSkill.capabilities.isMissingInterviewAnswer, evidenceRules.isMissingInterviewAnswer);
assert.strictEqual(customerValidationSkill.capabilities.classifyCustomerAnswer, evidenceRules.classifyCustomerAnswer);

console.log('Customer Validation Skill capability-reference scenarios passed.');

// --- Customer Validation Skill: matches() routing --------------------------------

const questionRequest = 'Do you have a record of the customer interview questions? Show me the questions only.';
const evidenceRequest = 'What have we learned from the customer interviews?';
const analysisRequest = 'Analyze the customer interviews for supporting and contradictory evidence.';
const unrelatedRequest = 'Schedule Family Meeting Sunday, 6 September 2026 at 3:00 PM';

assert.strictEqual(customerValidationSkill.matches(questionRequest), true);
assert.strictEqual(customerValidationSkill.matches(evidenceRequest), true);
assert.strictEqual(customerValidationSkill.matches(analysisRequest), true);
assert.strictEqual(customerValidationSkill.matches(unrelatedRequest), false);

console.log('Customer Validation Skill matches() routing scenarios passed.');

// --- Customer Validation Skill: run() delegates to existing capabilities --------

const questionOutcome = customerValidationSkill.run(questionRequest);
assert.strictEqual(questionOutcome.action, 'RETRIEVE_INTERVIEW_QUESTIONS');
assert.deepStrictEqual(questionOutcome.result, coreEngine.retrieveAuthoritativeInterviewQuestions(questionRequest));

const evidenceOutcome = customerValidationSkill.run(evidenceRequest);
assert.strictEqual(evidenceOutcome.action, 'RETRIEVE_INTERVIEW_EVIDENCE');
assert.deepStrictEqual(evidenceOutcome.result, coreEngine.retrieveAuthoritativeInterviewEvidence(evidenceRequest));
// Preserved semantics: raw customer evidence stays distinct from interpretation,
// and no GO/NO-GO or market-validation language is introduced by the Skill.
assert.match(evidenceOutcome.result.reply, /## Observed customer evidence/);
assert.match(evidenceOutcome.result.reply, /## Derived observations \(source interpretation\)/);
assert.doesNotMatch(evidenceOutcome.result.reply, /GO\/NO-GO/i);

const analysisOutcome = customerValidationSkill.run(analysisRequest);
assert.strictEqual(analysisOutcome.action, 'RETRIEVE_INTERVIEW_EVIDENCE');
assert.deepStrictEqual(analysisOutcome.result, coreEngine.retrieveAuthoritativeInterviewEvidence(analysisRequest));

assert.strictEqual(customerValidationSkill.run(unrelatedRequest), null);

console.log('Customer Validation Skill run() delegation scenarios passed.');

// --- Customer Validation Skill: ingestion and evidence-ledger orchestration ------
// Uses a fixture copy of the authoritative record so the real vault file is untouched.

const sourcePath = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md');
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-customer-validation-skill-'));
const fixturePath = path.join(fixtureDirectory, 'Validation_Framework.md');
fs.writeFileSync(fixturePath, fs.readFileSync(sourcePath, 'utf8'), 'utf8');

const ingestOutcome = customerValidationSkill.run(null, {
    action: 'INGEST_CUSTOMER_INTERVIEW',
    ingest: { answers: { 1: 'Yes' }, date: '2026-09-09', frameworkPath: fixturePath }
});
assert.strictEqual(ingestOutcome.action, 'INGEST_CUSTOMER_INTERVIEW');
assert.strictEqual(typeof ingestOutcome.result.customerNumber, 'number');

const ledgerOutcome = customerValidationSkill.run(null, {
    action: 'RETRIEVE_EVIDENCE_LEDGER',
    frameworkPath: fixturePath
});
assert.strictEqual(ledgerOutcome.action, 'RETRIEVE_EVIDENCE_LEDGER');
assert.ok(Array.isArray(ledgerOutcome.result.entries));
assert.ok(Array.isArray(ledgerOutcome.result.missingQuestions));
// Missing questions remain NOT TESTED (never silently classified as evidence).
assert.ok(ledgerOutcome.result.missingQuestions.some((missing) => missing.questionNumber === 7));

const ingestedCustomerId = `#${String(ingestOutcome.result.customerNumber).padStart(3, '0')}`;
const ingestedEntry = ledgerOutcome.result.entries.find(
    (entry) => entry.customerId === ingestedCustomerId && entry.questionNumber === 1
);
assert.ok(ingestedEntry);
assert.strictEqual(ingestedEntry.rawCustomerAnswer, 'Yes');
// The ledger entry produced from the ingested answer must match the classification
// rules module directly -- proving no reimplementation occurred in the Skill.
const directClassification = evidenceRules.classifyCustomerAnswer(ingestedCustomerId, 1, 'Yes');
assert.strictEqual(ingestedEntry.evidenceClassification, directClassification.evidenceClassification);
assert.strictEqual(ingestedEntry.evidenceWeight, directClassification.evidenceWeight);
assert.strictEqual(ingestedEntry.classificationRuleId, directClassification.classificationRuleId);

fs.rmSync(fixtureDirectory, { recursive: true, force: true });

console.log('Customer Validation Skill ingestion/ledger orchestration scenarios passed.');
