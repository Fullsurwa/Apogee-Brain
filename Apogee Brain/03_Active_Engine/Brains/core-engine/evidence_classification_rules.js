const CLASSIFICATIONS = Object.freeze({
    SUPPORTING: 'SUPPORTING',
    CONTRADICTING: 'CONTRADICTING',
    NEUTRAL: 'NEUTRAL',
    INSUFFICIENT: 'INSUFFICIENT'
});

function isMissingInterviewAnswer(rawAnswer) {
    return /^(?:N\/A|Not answered)\.?$/i.test(String(rawAnswer || '').trim());
}

function classificationResult(evidenceClassification, evidenceWeight, classificationRuleId, classificationRationale) {
    return {
        evidenceClassification,
        evidenceWeight,
        classificationRuleId,
        classificationRationale
    };
}

function classifyCustomerAnswer(customerId, questionNumber, rawCustomerAnswer) {
    const evidenceWeight = questionNumber <= 6 ? 'HIGH' : 'LOW';
    const answer = String(rawCustomerAnswer || '').trim();

    if (isMissingInterviewAnswer(answer)) {
        throw new Error(`Cannot classify missing answer for ${customerId} Q${questionNumber}`);
    }

    if (questionNumber === 1 && /^\s*\*?\*?"?yes[.!?]?"?\*?\*?\s*$/i.test(answer)) {
        return classificationResult(
            CLASSIFICATIONS.SUPPORTING,
            evidenceWeight,
            'Q1_PROBLEM_PRESENT',
            'Explicit affirmative Q1 response matched the Q1 problem-present rule.'
        );
    }

    if (questionNumber === 1 && /^\s*\*?\*?"?no[.!?]?"?\*?\*?\s*$/i.test(answer)) {
        return classificationResult(
            CLASSIFICATIONS.CONTRADICTING,
            evidenceWeight,
            'Q1_PROBLEM_ABSENT',
            'Explicit negative Q1 response matched the Q1 problem-absent rule.'
        );
    }

    if (questionNumber === 4 && /^\s*"?not much\.?"?\s*$/i.test(answer)) {
        return classificationResult(
            CLASSIFICATIONS.CONTRADICTING,
            evidenceWeight,
            'Q4_LOW_INCONVENIENCE',
            'Explicit low-inconvenience Q4 response matched the Q4 low-inconvenience rule.'
        );
    }

    return classificationResult(
        CLASSIFICATIONS.INSUFFICIENT,
        evidenceWeight,
        'INSUFFICIENT_AMBIGUOUS',
        'Answer did not match a high-confidence classification rule.'
    );
}

module.exports = {
    CLASSIFICATIONS,
    isMissingInterviewAnswer,
    classifyCustomerAnswer
};
