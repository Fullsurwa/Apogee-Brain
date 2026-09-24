'use strict';

const fs = require('fs');
const path = require('path');

function classifyEngagementRequest(transcript) {
    const text = String(transcript || '').trim().toLowerCase();

    const isEngagement =
        /\b(case|engagement|client|company|organisation|organization)\b/.test(text) &&
        /\b(ai|artificial intelligence|machine learning)\b/.test(text) &&
        /\b(help|solve|investigate|understand|assess|tackle)\b/.test(text);

    if (isEngagement) {
        return {
            domain: 'AI_GOVERNANCE',
            intent: 'ENGAGEMENT_SUPPORT'
        };
    }

    return {
        domain: 'UNKNOWN',
        intent: 'UNKNOWN'
    };
}

function buildEngagementContext(transcript) {
    const classification = classifyEngagementRequest(transcript);

    if (classification.domain !== 'AI_GOVERNANCE') {
        return {
            ...classification,
            methodologyLoaded: false,
            methodology: '',
            projectStateLoaded: false,
            projectState: '',
            nextStage: 'UNKNOWN',
            actionRequired: false
        };
    }

    const vaultPath =
        process.env.APOGEE_VAULT_PATH ||
        path.resolve(__dirname, '..', '..', '..');

    const methodologyPath = path.join(
        vaultPath,
        '01_Apogee_Core',
        'AI_Context',
        'AI_Governance_Engagement_Execution_Methodology.md'
    );

    const projectStatePath = path.join(
        vaultPath,
        '00_Command_Center',
        'Now.md'
    );

    const methodology = fs.readFileSync(methodologyPath, 'utf8');
    const projectState = fs.readFileSync(projectStatePath, 'utf8');

    return {
        ...classification,
        methodologyLoaded: true,
        methodology,
        projectStateLoaded: true,
        projectState,
        nextStage: 'CLIENT_BRIEF',
        actionRequired: false
    };
}

function buildClientBrief(transcript, context) {
    return {
        stage: 'CLIENT_BRIEF',
        methodologyBasis: 'AI_GOVERNANCE_ENGAGEMENT_EXECUTION_METHODOLOGY',
        sections: [
            'Situation',
            'Current understanding',
            'Unknowns',
            'Key questions',
            'Meeting objective'
        ],
        situation: String(transcript || '').trim(),
        currentUnderstanding: 'The client has an AI-related case they want help understanding or solving. The specific AI system, process, concern, evidence, affected parties, and observed outcome are not yet established.',
        unknowns: 'What is the specific AI system, process, decision, or outcome involved, and what has actually been observed?',
        keyQuestions: 'What is happening? Where does AI enter the process? What evidence exists? Why does the issue matter? What remains unclear?',
        meetingObjective: 'Understand the situation well enough to identify what should be investigated next.'
    };
}

function buildIntroductoryDiscovery(clientBrief) {
    return {
        stage: 'INTRODUCTORY_DISCOVERY',
        methodologyBasis: 'AI_GOVERNANCE_ENGAGEMENT_EXECUTION_METHODOLOGY',
        objective: "Understand the client's problem at a high level and establish what needs to happen next.",
        questions: [
            'Can you walk me through the challenge as you currently understand it?',
            'Where does AI fit into that process?',
            'What have you observed that makes this a concern?',
            'Who or what is being affected?',
            'What would you like me to help you understand or establish?',
            'What information or evidence do you already have about the issue?'
        ],
        endState: 'Determine what we investigate next.',
        execute: false
    };
}
function orchestrateEngagement(transcript) {
    const context = buildEngagementContext(transcript);

    if (context.domain !== 'AI_GOVERNANCE') {
        return {
            ...context,
            operation: 'NONE',
            execute: false
        };
    }

    const clientBrief = buildClientBrief(transcript, context);

    return {
        ...context,
        operation: 'PREPARE_CLIENT_BRIEF',
        clientBrief,
        introductoryDiscovery: buildIntroductoryDiscovery(clientBrief),
        execute: false
    };
}

module.exports = {
    classifyEngagementRequest,
    buildEngagementContext,
    buildClientBrief,
    orchestrateEngagement
};





