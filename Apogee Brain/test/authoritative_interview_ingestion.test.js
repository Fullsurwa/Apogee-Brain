const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.APOGEE_TEST_MODE = '1';
process.env.ANTHROPIC_API_KEY = 'test-key';

const {
    ingestAuthoritativeCustomerInterview,
    retrieveAuthoritativeInterviewEvidence
} = require('../03_Active_Engine/Brains/core-engine/apogee_core.js');

const sourcePath = path.join(__dirname, '..', '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md');
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'apogee-interview-ingestion-'));
const fixturePath = path.join(fixtureDirectory, 'Validation_Framework.md');
const originalFramework = fs.readFileSync(sourcePath, 'utf8');
fs.writeFileSync(fixturePath, originalFramework, 'utf8');

function interviewBlocks(framework) {
    return framework.match(/### Customer Interview #\d+[\s\S]*?(?=\n### Customer Interview #|\n## 13\. Validation Criteria)/g) || [];
}

const originalBlocks = interviewBlocks(originalFramework);
function assertExistingRecordsUnchanged(framework) {
    const updatedBlocks = interviewBlocks(framework);
    assert.deepStrictEqual(updatedBlocks.slice(0, originalBlocks.length - 1), originalBlocks.slice(0, -1));
    assert.strictEqual(updatedBlocks[originalBlocks.length - 1].trimEnd(), originalBlocks[originalBlocks.length - 1].trimEnd());
}

const customer005Answers = {
    1: 'Yes, this is a verbatim partial interview answer.',
    2: 'A long day followed by an unexpected meeting.',
    3: 'I showered.',
    4: 'It was not a major inconvenience.',
    5: 'Yes',
    6: 'I want to test the scent first.'
};
const customer006Answers = {
    1: 'No'
};

const existingInterviewCount = originalBlocks.length;
const expectedFirstCustomerNumber = existingInterviewCount + 1;
const expectedSecondCustomerNumber = existingInterviewCount + 2;

const firstIngestion = ingestAuthoritativeCustomerInterview({
    answers: customer005Answers,
    date: '2026-09-06',
    frameworkPath: fixturePath
});
assert.strictEqual(firstIngestion.customerNumber, expectedFirstCustomerNumber);

const afterCustomer005 = fs.readFileSync(fixturePath, 'utf8');
assertExistingRecordsUnchanged(afterCustomer005);
assert.match(afterCustomer005, new RegExp("### Customer Interview #" + String(expectedFirstCustomerNumber).padStart(3, "0")));
for (const answer of Object.values(customer005Answers)) assert.ok(afterCustomer005.includes(answer));
for (let questionNumber = 7; questionNumber <= 12; questionNumber += 1) {
    assert.match(afterCustomer005, new RegExp(`${questionNumber}\\. \\\*\\\*Not answered\\.\\\\*\\\*`));
}
const customer005Block = interviewBlocks(afterCustomer005).at(-1);
assert.doesNotMatch(customer005Block, /#### Analysis|#### Evidence|Derived observations|Validation status/);

const secondIngestion = ingestAuthoritativeCustomerInterview({
    answers: customer006Answers,
    date: '2026-09-06',
    frameworkPath: fixturePath
});
assert.strictEqual(secondIngestion.customerNumber, expectedSecondCustomerNumber);

const afterCustomer006 = fs.readFileSync(fixturePath, 'utf8');
assertExistingRecordsUnchanged(afterCustomer006);
assert.match(afterCustomer006, new RegExp("### Customer Interview #" + String(expectedSecondCustomerNumber).padStart(3, "0")));
assert.ok(afterCustomer006.includes(customer006Answers[1]));
const customer006Block = interviewBlocks(afterCustomer006).at(-1);
for (let questionNumber = 2; questionNumber <= 12; questionNumber += 1) {
    assert.match(customer006Block, new RegExp(`${questionNumber}\\. \\\*\\\*Not answered\\.\\\\*\\\*`));
}
assert.doesNotMatch(customer006Block, /#### Analysis|#### Evidence|Derived observations|Validation status/);

const evidence = retrieveAuthoritativeInterviewEvidence('What have we learned from the customer interviews?', fixturePath);
assert.ok(evidence);
assert.match(evidence.reply, new RegExp(`Customer interviews recorded in authoritative source: ${expectedSecondCustomerNumber}\\.`));
assert.match(evidence.reply, new RegExp("Customer Interview #" + String(expectedFirstCustomerNumber).padStart(3, "0")));
assert.match(evidence.reply, /Yes, this is a verbatim partial interview answer\./);
assert.match(evidence.reply, new RegExp("Customer Interview #" + String(expectedSecondCustomerNumber).padStart(3, "0")));
assert.match(evidence.reply, /## Derived observations \(source interpretation\)/);
assert.match(evidence.reply, /## Validation status recorded in source/);
assert.match(evidence.reply, /## Open follow-up questions \(not findings\)/);
const derivedStart = evidence.reply.indexOf('## Derived observations (source interpretation)');
assert.doesNotMatch(evidence.reply.slice(derivedStart), /Yes, this is a verbatim partial interview answer\./);

fs.rmSync(fixtureDirectory, { recursive: true, force: true });
console.log('Authoritative interview ingestion scenarios passed.');
