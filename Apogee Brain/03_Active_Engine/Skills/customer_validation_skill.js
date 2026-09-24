'use strict';

const { createSkill } = require('./skill');

const {
    isAuthoritativeInterviewQuestionRequest,
    retrieveAuthoritativeInterviewQuestions,
    isAuthoritativeInterviewEvidenceRequest,
    retrieveAuthoritativeInterviewEvidence,
    isAuthoritativeInterviewAnalysisRequest,
    ingestAuthoritativeCustomerInterview,
    buildEvidenceLedger,
    retrieveAuthoritativeEvidenceLedger
} = require('../Brains/core-engine/apogee_core.js');

const {
    isMissingInterviewAnswer,
    classifyCustomerAnswer
} = require('../Brains/core-engine/evidence_classification_rules.js');

/**
 * Customer Validation Skill.
 *
 * This is a declarative orchestration definition only. It references the
 * existing, already-tested capabilities in `apogee_core.js` and
 * `evidence_classification_rules.js` and sequences them for the class of
 * requests that ask about the authoritative customer-interview record.
 *
 * It deliberately does NOT reimplement:
 *   - interview retrieval        (retrieveAuthoritativeInterviewQuestions)
 *   - interview ingestion        (ingestAuthoritativeCustomerInterview)
 *   - evidence ledger construction/retrieval
 *                                 (buildEvidenceLedger / retrieveAuthoritativeEvidenceLedger)
 *   - evidence classification    (classifyCustomerAnswer / isMissingInterviewAnswer)
 *   - validation lifecycle       (VALIDATION_LIFECYCLE and its normalization stay in apogee_core.js)
 *
 * Existing validation semantics are preserved because every action below is
 * a direct pass-through to the referenced capability: this Skill adds no new
 * interpretation, no GO/NO-GO promotion, and no synthesis of individual
 * customer evidence into market validation.
 */
const customerValidationSkill = createSkill({
    id: 'customer-validation',
    description:
        'Orchestrates the existing authoritative customer-interview capabilities ' +
        '(retrieval of interview questions, retrieval of recorded evidence, ' +
        'ingestion of new interviews, and evidence-ledger construction) without ' +
        'reimplementing any of their underlying logic.',
    capabilities: {
        isAuthoritativeInterviewQuestionRequest,
        retrieveAuthoritativeInterviewQuestions,
        isAuthoritativeInterviewEvidenceRequest,
        retrieveAuthoritativeInterviewEvidence,
        isAuthoritativeInterviewAnalysisRequest,
        ingestAuthoritativeCustomerInterview,
        buildEvidenceLedger,
        retrieveAuthoritativeEvidenceLedger,
        isMissingInterviewAnswer,
        classifyCustomerAnswer
    },
    matches(transcript) {
        return (
            isAuthoritativeInterviewQuestionRequest(transcript) ||
            isAuthoritativeInterviewEvidenceRequest(transcript) ||
            isAuthoritativeInterviewAnalysisRequest(transcript)
        );
    },
    run(transcript, context = {}) {
        if (context.action === 'INGEST_CUSTOMER_INTERVIEW') {
            return {
                action: 'INGEST_CUSTOMER_INTERVIEW',
                result: ingestAuthoritativeCustomerInterview(context.ingest)
            };
        }

        if (context.action === 'RETRIEVE_EVIDENCE_LEDGER') {
            return {
                action: 'RETRIEVE_EVIDENCE_LEDGER',
                result: retrieveAuthoritativeEvidenceLedger(context.frameworkPath)
            };
        }

        if (isAuthoritativeInterviewQuestionRequest(transcript)) {
            return {
                action: 'RETRIEVE_INTERVIEW_QUESTIONS',
                result: retrieveAuthoritativeInterviewQuestions(transcript)
            };
        }

        if (isAuthoritativeInterviewEvidenceRequest(transcript) || isAuthoritativeInterviewAnalysisRequest(transcript)) {
            return {
                action: 'RETRIEVE_INTERVIEW_EVIDENCE',
                result: retrieveAuthoritativeInterviewEvidence(transcript, context.frameworkPath)
            };
        }

        return null;
    }
});

module.exports = { customerValidationSkill };
