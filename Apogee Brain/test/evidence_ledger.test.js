const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';

const {
    buildEvidenceLedger,
    ingestAuthoritativeCustomerInterview,
    retrieveAuthoritativeEvidenceLedger
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');
const {
    classifyCustomerAnswer
} = require('../03_Active_Engine/Brains/core-engine/evidence_classification_rules.js');

const sourcePath = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md');
const questionsPath = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Authoritative_Interview_Questions.md');
const originalFramework = fs.readFileSync(sourcePath, 'utf8');
const originalQuestions = fs.readFileSync(questionsPath, 'utf8');
const originalBlocks = originalFramework.match(/### Customer Interview #\d+[\s\S]*?(?=\n### Customer Interview #|\n## 13\. Validation Criteria)/g) || [];
const originalValidation = originalFramework.slice(originalFramework.indexOf('## 13. Validation Criteria'));
const expectedFirstCustomerNumber = originalBlocks.length + 1;
const expectedSecondCustomerNumber = originalBlocks.length + 2;
const realLedger = retrieveAuthoritativeEvidenceLedger(sourcePath);
const realTitles = originalBlocks.map((block) => block.match(/^### Customer Interview #\d+/)[0]);
const realCustomerIds = realTitles.map((title) => title.match(/#\d+/)[0]);

assert.deepStrictEqual([...new Set(realLedger.entries.map((entry) => entry.customerId))], realCustomerIds);
assert.ok(realLedger.entries.length > 0);
const customer004Entries = realLedger.entries.filter((entry) => entry.customerId === '#004');
assert.strictEqual(customer004Entries.length, 12);
assert.deepStrictEqual(customer004Entries.map((entry) => entry.questionNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
assert.strictEqual(customer004Entries[0].rawCustomerAnswer, 'Yes');
assert.strictEqual(customer004Entries[1].rawCustomerAnswer, 'A random meet up that required showing up proper after already exhausting the day');
assert.strictEqual(customer004Entries[2].rawCustomerAnswer, 'Showered');
assert.strictEqual(customer004Entries[3].rawCustomerAnswer, "Not really big, but its a difficult feeling to shake off knowing you aren't at your best");
assert.strictEqual(customer004Entries[4].rawCustomerAnswer, 'Yes');
assert.strictEqual(customer004Entries[5].rawCustomerAnswer, 'Most definitely, i have to choose what smells I like, its not about the brand or amount, its what I find appeasing.');
const customer001Entries = realLedger.entries.filter((entry) => entry.customerId === '#001');
const customer003Entries = realLedger.entries.filter((entry) => entry.customerId === '#003');
const customer001Q5 = customer001Entries.find((entry) => entry.questionNumber === 5);
const customer001Q7 = customer001Entries.find((entry) => entry.questionNumber === 7);
assert.ok(customer001Q5);
assert.ok(customer001Q7);
assert.ok(!customer001Q5.rawCustomerAnswer.includes('Customer explanation:'));
assert.ok(!customer001Q5.rawCustomerAnswer.includes('Interpretation note:'));
assert.ok(!customer001Q7.rawCustomerAnswer.includes('Reaction to the vending concept'));
assert.ok(!customer001Q7.rawCustomerAnswer.includes('Customer suggested:'));
assert.ok(!customer001Q7.rawCustomerAnswer.includes('Customer added:'));
assert.ok(!customer003Entries.some((entry) => entry.questionNumber === 2));
assert.ok(!customer003Entries.some((entry) => entry.questionNumber === 4));
assert.ok(realLedger.missingQuestions.some((missing) => missing.customerId === '#003' && missing.questionNumber === 2));
assert.ok(realLedger.missingQuestions.some((missing) => missing.customerId === '#003' && missing.questionNumber === 4));
assert.ok(realLedger.missingQuestions.filter((missing) => missing.customerId === '#003').every((missing) => !Object.hasOwn(missing, 'classificationRuleId')));
assert.strictEqual(customer004Entries[0].sourceReference, '### Customer Interview #004 Q1');
assert.strictEqual(customer004Entries[0].evidenceClassification, 'SUPPORTING');
assert.strictEqual(customer004Entries[0].evidenceWeight, 'HIGH');
assert.strictEqual(customer004Entries.find((entry) => entry.questionNumber === 4).evidenceClassification, 'INSUFFICIENT');
assert.strictEqual(classifyCustomerAnswer('#fixture', 1, 'YES.').evidenceClassification, 'SUPPORTING');
assert.strictEqual(classifyCustomerAnswer('#fixture', 1, 'YES.').classificationRuleId, 'Q1_PROBLEM_PRESENT');
assert.strictEqual(classifyCustomerAnswer('#fixture', 1, 'NO.').evidenceClassification, 'CONTRADICTING');
assert.strictEqual(classifyCustomerAnswer('#fixture', 1, 'NO.').classificationRuleId, 'Q1_PROBLEM_ABSENT');
assert.strictEqual(classifyCustomerAnswer('#fixture', 1, 'Maybe.').evidenceClassification, 'INSUFFICIENT');
assert.strictEqual(classifyCustomerAnswer('#fixture', 1, 'Maybe.').classificationRuleId, 'INSUFFICIENT_AMBIGUOUS');
assert.strictEqual(classifyCustomerAnswer('#fixture', 4, 'Not really big, but its a difficult feeling to shake off knowing you aren\'t at your best').evidenceClassification, 'INSUFFICIENT');
assert.strictEqual(classifyCustomerAnswer('#fixture', 5, 'Yes').evidenceClassification, 'INSUFFICIENT');
assert.strictEqual(classifyCustomerAnswer('#fixture', 6, 'Yes').evidenceClassification, 'INSUFFICIENT');
assert.ok(realLedger.entries.filter((entry) => entry.customerId === '#004').every((entry) => entry.questionNumber >= 1 && entry.questionNumber <= 12));
assert.ok(realLedger.entries.every((entry) => ['SUPPORTING', 'CONTRADICTING', 'NEUTRAL', 'INSUFFICIENT'].includes(entry.evidenceClassification)));
assert.ok(realLedger.entries.every((entry) => Object.hasOwn(entry, 'rawCustomerAnswer')
    && Object.hasOwn(entry, 'evidenceClassification')
    && Object.hasOwn(entry, 'evidenceWeight')
    && Object.hasOwn(entry, 'classificationRuleId')
    && Object.hasOwn(entry, 'classificationRationale')));
assert.ok(realLedger.entries.every((entry) => entry.classificationRationale.includes(entry.classificationRuleId === 'Q1_PROBLEM_PRESENT'
    ? 'Q1 problem-present rule'
    : entry.classificationRuleId === 'Q1_PROBLEM_ABSENT'
        ? 'Q1 problem-absent rule'
        : entry.classificationRuleId === 'Q4_LOW_INCONVENIENCE'
            ? 'Q4 low-inconvenience rule'
            : 'high-confidence classification rule')));
assert.ok(realLedger.entries.filter((entry) => entry.questionNumber >= 7).every((entry) => entry.evidenceWeight === 'LOW'));

const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-evidence-ledger-'));
const fixturePath = path.join(fixtureDirectory, 'Validation_Framework.md');
fs.writeFileSync(fixturePath, originalFramework, 'utf8');
const customer005 = {
    1: 'Yes, a verbatim future answer.',
    2: 'A late unexpected meeting.',
    6: 'I would test it first.'
};
const customer006 = { 1: 'No' };
assert.strictEqual(ingestAuthoritativeCustomerInterview({ answers: customer005, date: '2026-09-06', frameworkPath: fixturePath }).customerNumber, expectedFirstCustomerNumber);
assert.strictEqual(ingestAuthoritativeCustomerInterview({ answers: customer006, date: '2026-09-06', frameworkPath: fixturePath }).customerNumber, expectedSecondCustomerNumber);
const fixtureFramework = fs.readFileSync(fixturePath, 'utf8');
const fixtureLedger = buildEvidenceLedger(fixtureFramework);
assert.ok(fixtureLedger.entries.some((entry) => entry.customerId === '#' + String(expectedFirstCustomerNumber).padStart(3, '0') && entry.questionNumber === 1 && entry.rawCustomerAnswer === customer005[1]));
assert.ok(fixtureLedger.entries.some((entry) => entry.customerId === '#' + String(expectedSecondCustomerNumber).padStart(3, '0') && entry.questionNumber === 1 && entry.rawCustomerAnswer === customer006[1]));
assert.ok(fixtureLedger.missingQuestions.some((missing) => missing.customerId === '#' + String(expectedFirstCustomerNumber).padStart(3, '0') && missing.questionNumber === 7));
assert.ok(fixtureLedger.missingQuestions.some((missing) => missing.customerId === '#' + String(expectedSecondCustomerNumber).padStart(3, '0') && missing.questionNumber === 12));
assert.ok(!fixtureLedger.entries.some((entry) => entry.customerId === '#' + String(expectedFirstCustomerNumber).padStart(3, '0') && entry.questionNumber === 7));
assert.ok(!fixtureLedger.entries.some((entry) => entry.customerId === '#' + String(expectedSecondCustomerNumber).padStart(3, '0') && entry.questionNumber === 12));
assert.deepStrictEqual((fixtureFramework.match(/### Customer Interview #\d+/g) || []).slice(0, originalBlocks.length), realTitles);
const fixtureBlocks = fixtureFramework.match(/### Customer Interview #\d+[\s\S]*?(?=\n### Customer Interview #|\n## 13\. Validation Criteria)/g) || [];
assert.deepStrictEqual(fixtureBlocks.slice(0, originalBlocks.length - 1), originalBlocks.slice(0, -1));
assert.strictEqual(fixtureBlocks[originalBlocks.length - 1].trimEnd(), originalBlocks[originalBlocks.length - 1].trimEnd());
assert.strictEqual(fixtureFramework.slice(fixtureFramework.indexOf('## 13. Validation Criteria')), originalValidation);
assert.strictEqual(fs.readFileSync(questionsPath, 'utf8'), originalQuestions);

fs.rmSync(fixtureDirectory, { recursive: true, force: true });
console.log('Evidence Ledger scenarios passed.');


