const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const readline = require('readline');
const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk');
const {
    isMissingInterviewAnswer,
    classifyCustomerAnswer
} = require('./evidence_classification_rules');

const TEST_MODE = process.env.APOGEE_TEST_MODE === '1';
const SHOULD_START = !TEST_MODE && (require.main === module || path.resolve(process.argv[1] || '') === path.resolve(__dirname, '..', '..', '..', 'apogee_core.js'));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY && !TEST_MODE) {
    console.error('ANTHROPIC_API_KEY is not set. Configure it in the environment before starting Apogee.');
    process.exit(1);
}

const app = express();
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
app.use(express.json());

const VAULT_PATH = process.env.APOGEE_VAULT_PATH || path.resolve(__dirname, '..', '..', '..');
const ICAL_URL = process.env.APOGEE_ICAL_URL;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:latest';
const configuredOllamaTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);
const OLLAMA_TIMEOUT_MS = Number.isInteger(configuredOllamaTimeout) && configuredOllamaTimeout > 0 ? configuredOllamaTimeout : 60000;
const providerCallCounts = { claude: 0, ollama: 0 };
console.log(`[Startup] ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY ? 'PRESENT' : 'MISSING'}`);
console.log(`[Startup] ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'}`);
console.log(`[Startup] Process cwd: ${process.cwd()}`);
console.log(`[Startup] VAULT_PATH: ${VAULT_PATH}`);
console.log(`[Startup] OLLAMA_BASE_URL: ${OLLAMA_BASE_URL}`);
console.log(`[Startup] OLLAMA_MODEL: ${OLLAMA_MODEL}`);
const EXERCISE_PATH = path.join(VAULT_PATH, '06_Daily_Rhythms', 'Exercise.md');
const CALENDAR_PATH = path.join(VAULT_PATH, '06_Daily_Rhythms', 'Calendar.md');
const MASTER_DASHBOARD_PATH = path.join(VAULT_PATH, '00_Command_Center', 'Master_Dashboard.md');
const MASTER_NOTE_PATH = path.join(VAULT_PATH, 'Session Logs', 'Master_Note.md');
const AI_IDEAS_PATH = path.join(VAULT_PATH, '03_Active_Engine', 'Brains', 'AI Ideas.md');
const DB_PATH = path.join(VAULT_PATH, 'Session Logs', 'interaction_history.json');
const MEMORY_PATH = path.join(VAULT_PATH, 'Session Logs', 'apogee_memory.json');
const HANDOFFS_PATH = path.join(VAULT_PATH, 'Session Logs', 'handoffs.json');
const AUTHORITATIVE_RECORDS = Object.freeze({
    perfumeVendingInterviewQuestions: path.join(VAULT_PATH, '03_Active_Engine', 'Perfume Vending Validation', 'Authoritative_Interview_Questions.md'),
    perfumeVendingValidationFramework: path.join(VAULT_PATH, '03_Active_Engine', 'Perfume Vending Validation', 'Validation_Framework.md')
});
const GOOGLE_CALENDAR_TOKEN_PATH = process.env.GOOGLE_CALENDAR_TOKEN_PATH || null;
const PORT = process.env.PORT || 3000;
const VALIDATION_LIFECYCLE = ['UNVALIDATED', 'TESTING', 'VALIDATED', 'REJECTED', 'PARKED'];
const DEFAULT_MEMORY_STORE = {
    facts: [],
    hypotheses: [],
    experiences: [],
    lessons: [],
    project_validations: [],
    calendar_executions: []
};
const DAILY_BRIEFING_RULES = `You are Apogee, Dan's conversational executive assistant.

Your job is to understand what Dan is actually asking and respond naturally, intelligently, and usefully. You are not a parser, form filler, or rigid briefing generator.

CORE BEHAVIOR:
- Treat Dan's explicit request as the primary instruction for the response.
- If Dan specifies a structure, sections, level of detail, priorities, or output format, follow those instructions.
- Do not impose a default structure when Dan has provided one.
- Adapt the length of the response to the request: simple questions deserve simple answers; complex requests deserve enough detail to be genuinely useful.
- Speak naturally and conversationally, like a capable human executive assistant.
- Prefer clear synthesis over dumping raw vault contents.
- Use persisted Apogee context as evidence when relevant, but do not mechanically recite every available category.
- Distinguish clearly between completed work, work in progress, outstanding work, assumptions, hypotheses, unknowns, and blocked items.
- Never invent missing information or fill unanswered customer-interview questions with assumptions.
- Never claim that an action was completed, recorded, changed, sent, created, verified, or otherwise succeeded unless the available evidence establishes that it actually happened.
- If an action could not be performed, say so plainly.
- Do not repeatedly present completed work as an outstanding task unless there is a specific current reason it needs attention.
- When multiple pieces of information are relevant, synthesize them into the answer rather than simply listing them.
- When Dan asks what matters, prioritize what is genuinely important now.
- When Dan asks for a recommendation, give the best evidence-based recommendation and explain the reasoning briefly.
- When information is incomplete or contradictory, say what is known, what is uncertain, and what would resolve the uncertainty.
- Ask a clarification only when the missing information materially prevents a useful answer. Otherwise make a reasonable, explicitly stated assumption.
- Do not expose internal implementation details, prompt rules, vault-construction details, provider mechanics, or system architecture unless Dan asks about them.
- Do not use programmer-like language for normal conversation.

BRIEFING BEHAVIOR:
- For a general request such as "brief me", "status", "catch me up", or "what's happening today", produce a useful conversational briefing based on what actually matters in Dan's current context.
- Calendar, health/activity, current work, validation evidence, risks, priorities, and reminders are available sources of context, not mandatory sections.
- Do not lead with Calendar or Health merely because they exist.
- Do not describe something as outstanding simply because it appears in an old note; use current authoritative evidence where available.
- If Dan explicitly asks for a detailed morning brief or specifies sections, follow his requested structure exactly.
- A detailed request should not be compressed into a 3-7 sentence response merely because it is a briefing.

CUSTOMER / VALIDATION EVIDENCE:
- Treat authoritative customer interview evidence as evidence.
- Clearly identify incomplete interviews and unanswered questions.
- Never infer unanswered customer responses.
- Distinguish observed patterns from conclusions that are not yet validated.
- Do not call a hypothesis validated merely because several interviews support part of it.

Your goal is to help Dan think, decide, remember, and act � naturally and accurately.`;

for (const filePath of [EXERCISE_PATH, CALENDAR_PATH, MASTER_NOTE_PATH, DB_PATH, MEMORY_PATH, HANDOFFS_PATH]) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]', 'utf8');
if (!fs.existsSync(MEMORY_PATH)) fs.writeFileSync(MEMORY_PATH, JSON.stringify(DEFAULT_MEMORY_STORE, null, 2), 'utf8');
if (!fs.existsSync(HANDOFFS_PATH)) fs.writeFileSync(HANDOFFS_PATH, '[]', 'utf8');

let currentDashboardData = {
    query: 'Waiting for voice command...',
    timestamp: new Date().toISOString(),
    reply: 'System initialized. Local engine standing by.',
    targetTrack: 'None',
    operationalMode: 'Local Engine Mode',
    systemHealthScore: '100%'
};

function localIcalDate(dayOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function syncGoogleCalendar() {
    if (!ICAL_URL) return;
    console.log('[Calendar Sync]: Fetching latest events from Google Calendar...');
    https.get(ICAL_URL, (res) => {
        if (res.statusCode !== 200) {
            console.log(`[Calendar Sync Error]: Feed returned HTTP ${res.statusCode}.`);
            res.resume();
            return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            try {
                const events = { today: [], tomorrow: [] };
                let event = null;
                for (let line of data.split(/\r?\n/)) {
                    line = line.trim();
                    if (line === 'BEGIN:VEVENT') event = {};
                    else if (line === 'END:VEVENT' && event) {
                        const eventDate = event.start?.slice(0, 8);
                        if (eventDate === localIcalDate()) events.today.push(event);
                        if (eventDate === localIcalDate(1)) events.tomorrow.push(event);
                        event = null;
                    } else if (event && event.start === undefined && line.startsWith('DTSTART')) {
                        event.start = line.split(':').slice(1).join(':');
                    } else if (event && line.startsWith('SUMMARY:')) {
                        event.summary = line.slice('SUMMARY:'.length);
                    }
                }
                const agendaLines = (agendaEvents) => agendaEvents.length
                    ? agendaEvents.map((calendarEvent) => {
                        const time = calendarEvent.start?.includes('T') ? calendarEvent.start.split('T')[1].slice(0, 4) : 'All Day';
                        return `- **${time}** - ${calendarEvent.summary || 'Untitled event'}`;
                    }).join('\n')
                    : '*No scheduled events found.*';
                const markdown = `# Agenda\n*Last Synced: ${new Date().toLocaleString()}*\n\n## Today\n${agendaLines(events.today)}\n\n## Tomorrow\n${agendaLines(events.tomorrow)}\n`;
                fs.writeFileSync(CALENDAR_PATH, markdown, 'utf8');
            } catch (error) {
                console.log(`[Calendar Sync Error]: Could not parse iCal data. ${error.message}`);
            }
        });
    }).on('error', (error) => console.log(`[Calendar Sync Error]: Network request failed. ${error.message}`));
}

function calculateExerciseMetrics(steps) {
    const weightKg = 100;
    const estimatedMinutes = Math.round(steps / 100);
    const caloriesBurned = Math.round((3.5 * 3.5 * weightKg / 200) * estimatedMinutes);
    const estimatedKm = ((steps * 0.762) / 1000).toFixed(2);
    return { caloriesBurned, estimatedKm, estimatedMinutes };
}

function getNairobiDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Nairobi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function parseExerciseCorrectionRequest(text) {
    const input = String(text || '').trim();

    const months = {
        january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
        july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
    };

    const stepMatch = input.match(/\b(?:move|change|correct|transfer)\s+(?:the\s+)?([\d,]+)(?:\s+steps?)?\b/i);
    if (!stepMatch) return null;

    const datePattern = '(\\d{1,2})(?:st|nd|rd|th)?\\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\\s+(\\d{4}))?';
    const reverseDatePattern = '(january|february|march|april|may|june|july|august|september|october|november|december)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?';

    const targetMatch = input.match(new RegExp('\\bto\\s+' + datePattern, 'i'));
    if (!targetMatch) return null;

    const buildDate = (match, reverse = false) => {
        const day = Number.parseInt(reverse ? match[2] : match[1], 10);
        const month = months[(reverse ? match[1] : match[2]).toLowerCase()];
        const year = Number.parseInt((reverse ? match[3] : match[3]) || String(new Date().getFullYear()), 10);
        if (!month || day < 1 || day > 31) return null;

        const candidate = new Date(Date.UTC(year, month - 1, day));
        if (
            candidate.getUTCFullYear() !== year ||
            candidate.getUTCMonth() !== month - 1 ||
            candidate.getUTCDate() !== day
        ) return null;

        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    const targetDate = buildDate(targetMatch);
    if (!targetDate) return null;

    const clearMatch =
        input.match(new RegExp('\\b(?:clear|blank|remove|delete|leave)\\s+(?:the\\s+)?(?:entry|row|record|log)?\\s*(?:for\\s+)?(?:on\\s+)?' + datePattern + '\\s*(?:as\\s+)?(?:blank|unlogged)?\\b', 'i')) ||
        input.match(new RegExp('\\b(?:clear|blank|remove|delete|leave)\\s+(?:the\\s+)?(?:entry|row|record|log)?\\s*(?:for\\s+)?(?:on\\s+)?' + reverseDatePattern + '\\s*(?:as\\s+)?(?:blank|unlogged)?\\b', 'i'));

    let clearDate = null;
    if (clearMatch) {
        clearDate = clearMatch[1] && months[clearMatch[1].toLowerCase()]
            ? buildDate(clearMatch, true)
            : buildDate(clearMatch, false);
        if (!clearDate) return null;
    }

    return {
        steps: Number.parseInt(stepMatch[1].replace(/,/g, ''), 10),
        targetDate,
        clearDate
    };
}
function applyExerciseCorrection(request) {
    const parsed = typeof request === 'string' ? parseExerciseCorrectionRequest(request) : request;
    if (!parsed) return { ok: false, reason: 'I could not identify a valid exercise correction request.' };
    if (!Number.isFinite(parsed.steps) || parsed.steps < 0) return { ok: false, reason: 'The step count is invalid.' };
    if (!parsed.targetDate) return { ok: false, reason: 'The target date is required.' };

    if (!fs.existsSync(EXERCISE_PATH)) {
        return { ok: false, reason: 'Exercise.md does not exist.' };
    }

    const metrics = calculateExerciseMetrics(parsed.steps);
    const status = parsed.steps >= 6000 ? 'Goal Met!' : 'In Progress';
    const replacement = `| ${parsed.targetDate} | ${parsed.steps} | 6000 | ${metrics.caloriesBurned} kcal | ${metrics.estimatedKm} km | ${status} |`;

    let content = fs.readFileSync(EXERCISE_PATH, 'utf8');

    const rowPattern = (date) => new RegExp(`\\|\\s*${date}\\s*\\|[^\\r\\n]*(?:\\r\\n|\\n|$)`, 'g');

    if (!rowPattern(parsed.targetDate).test(content)) {
        content = content.replace(/\s*$/, '\n') + replacement + '\n';
    } else {
        content = content.replace(rowPattern(parsed.targetDate), replacement + '\n');
    }

    if (parsed.clearDate && parsed.clearDate !== parsed.targetDate) {
        content = content.replace(rowPattern(parsed.clearDate), '');
    }

    fs.writeFileSync(EXERCISE_PATH, content, 'utf8');

    return {
        ok: true,
        targetDate: parsed.targetDate,
        clearDate: parsed.clearDate || null,
        steps: parsed.steps,
        caloriesBurned: metrics.caloriesBurned,
        estimatedKm: metrics.estimatedKm,
        status
    };
}
function parseExerciseLogRequest(text) {
    const input = String(text || '');

    const months = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12
    };

    // Supports:
    // "8901 steps"
    // "steps at 8901"
    // "steps for 4th September as 3179"
    // "steps on 6th September at 8901"
    let stepMatch =
        input.match(/(\d[\d,]*)\s*steps\b/i) ||
        input.match(/\bsteps\b[\s\S]{0,100}?\b(?:at|=|to|as)\s*(\d[\d,]*)\b/i);

    if (!stepMatch) return null;

    const steps = Number.parseInt(stepMatch[1].replace(/,/g, ''), 10);

    if (!Number.isFinite(steps)) {
        throw new Error(`Invalid step count in request: "${input}"`);
    }

    const explicitDateMatch = input.match(
        /\b(?:on|for)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/i
    );

    let date = getNairobiDate();

    if (explicitDateMatch) {
        const day = Number.parseInt(explicitDateMatch[1], 10);
        const monthName = explicitDateMatch[2].toLowerCase();
        const year = Number.parseInt(
            explicitDateMatch[3] || String(new Date().getFullYear()),
            10
        );

        const month = months[monthName];

        if (!month || day < 1 || day > 31) {
            throw new Error(`Invalid exercise date in request: "${explicitDateMatch[0]}"`);
        }

        const candidate = new Date(Date.UTC(year, month - 1, day));

        if (
            candidate.getUTCFullYear() !== year ||
            candidate.getUTCMonth() !== month - 1 ||
            candidate.getUTCDate() !== day
        ) {
            throw new Error(`Invalid exercise date in request: "${explicitDateMatch[0]}"`);
        }

        date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    return { steps, date };
}

function updateExerciseLog(steps, date = getNairobiDate()) {
    const metrics = calculateExerciseMetrics(steps);
    const status = steps >= 6000 ? 'Goal Met!' : 'In Progress';

    if (!fs.existsSync(EXERCISE_PATH)) {
        fs.writeFileSync(
            EXERCISE_PATH,
            '# Exercise Log\n\n| Date | Steps | Goal | Calories | Distance | Status |\n|---|---:|---:|---:|---:|---|\n',
            'utf8'
        );
    }

    fs.appendFileSync(
        EXERCISE_PATH,
        `| ${date} | ${steps} | 6000 | ${metrics.caloriesBurned} kcal | ${metrics.estimatedKm} km | ${status} |\n`,
        'utf8'
    );

    return metrics;
}

function readHistory() {
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
    catch { return []; }
}

function readFileTail(filePath, maxCharacters = 3000) {
    try { return fs.readFileSync(filePath, 'utf8').slice(-maxCharacters); }
    catch { return '(No data available.)'; }
}

function isAuthoritativeInterviewQuestionRequest(transcript) {
    const command = String(transcript || '').toLowerCase();
    return /(?:record|recorded|exact|canonical|original|source)/i.test(command)
    && /questions?/i.test(command);
}

function retrieveAuthoritativeInterviewQuestions(transcript) {
    if (!isAuthoritativeInterviewQuestionRequest(transcript)) return null;
    try {
        return {
            targetTrack: 'Historical Record Retrieval',
            operationalMode: 'Deterministic Authoritative Record',
            reply: fs.readFileSync(AUTHORITATIVE_RECORDS.perfumeVendingInterviewQuestions, 'utf8').trim()
        };
    } catch {
        return {
            targetTrack: 'Historical Record Retrieval',
            operationalMode: 'Authoritative Record Unavailable',
            reply: 'I could not retrieve the authoritative customer interview questions from the available source record.'
        };
    }
}

function isAuthoritativeInterviewAnalysisRequest(transcript) {
    const command = String(transcript || '').toLowerCase();

    const interviewReference =
        /(?:customer.*interview|interview.*customer|customer.*answers?|recorded answers?|customer responses?)/i.test(command);

    const analysisIntent =
        /(?:analys[ei]s|analyse|analyze|where.*evidence.*points|what.*evidence.*means|what.*does.*this.*mean|synthesi[sz]e|patterns?|supporting evidence|contradictory evidence|market friction|underlying friction|recurring|differences|unvalidated)/i.test(command);

    return interviewReference && analysisIntent;
}
function isAuthoritativeInterviewEvidenceRequest(transcript) {
    const command = String(transcript || '').toLowerCase();
    const interviewReference = /(?:customer.*interview|interview.*customer|customer.*answers?|recorded answers?|customer responses?|customer\s*#?\s*\d+)/i.test(command);
    const evidenceIntent = /(?:learn|evidence|finding|what.*found|recorded|answers?|responses?|where.*reached|progress|status|what.*have.*so far|search.*for.*them|recover)/i.test(command);

    return interviewReference
        && evidenceIntent
        && !/interview questions?|questions? for the interview/i.test(command);
}
function getCustomerInterviewBlocks(framework) {
    return framework.match(/### Customer Interview #\d+[\s\S]*?(?=\n### Customer Interview #|\n## 13\. Validation Criteria)/g) || [];
}

function unwrapStoredAnswerFormatting(answer) {
    return answer.replace(/^\*\*(.*)\*\*$/s, '$1');
}

function parseInterviewRawAnswers(block) {
    const rawSection = block.match(/#### Raw answers\s*([\s\S]*?)(?=\n#### |$)/i)?.[1] || '';
    const lines = rawSection.split(/\r?\n/);
    const answers = [];
    let currentAnswer;
    const flushAnswer = () => {
        if (currentAnswer?.rawParts.length) {
            answers.push({
                questionNumber: currentAnswer.questionNumber,
                rawAnswer: currentAnswer.rawParts.map(unwrapStoredAnswerFormatting).join('\n')
            });
        }
        currentAnswer = undefined;
    };
    for (const line of lines) {
        if (/^(?:[1-9]|1[0-2])-(?:[1-9]|1[0-2])\.\s+/.test(line)) {
            flushAnswer();
            continue;
        }
        const numberedLine = line.match(/^([1-9]|1[0-2])\.\s+(.+)$/);
        if (numberedLine) {
            flushAnswer();
            const questionNumber = Number(numberedLine[1]);
            const content = numberedLine[2];
            const answerStart = content.lastIndexOf('?');
            currentAnswer = {
                questionNumber,
                rawParts: answerStart >= 0
                    ? (content.slice(answerStart + 1).trim() ? [content.slice(answerStart + 1).trim()] : [])
                    : [content]
            };
        } else if (currentAnswer && line.trim()) {
            const annotation = line.match(/^\s*-\s*Customer (?:explanation|suggested|added):\s*(.*)$/i);
            if (annotation?.[1]) currentAnswer.rawParts.push(annotation[1]);
        }
    }
    flushAnswer();
    return answers.map(({ questionNumber, rawAnswer }) => ({
        questionNumber,
        rawAnswer
    })).filter(({ rawAnswer }) => !isMissingInterviewAnswer(rawAnswer));
}

function buildEvidenceLedger(framework) {
    const entries = [];
    const missingQuestions = [];
    for (const block of getCustomerInterviewBlocks(framework)) {
        const title = block.match(/^### Customer Interview #\d+/)?.[0] || 'Customer interview';
        const customerId = title.match(/#\d+/)?.[0] || title;
        const answered = new Map(parseInterviewRawAnswers(block).map((answer) => [answer.questionNumber, answer]));
        for (let questionNumber = 1; questionNumber <= 12; questionNumber += 1) {
            const answer = answered.get(questionNumber);
            if (!answer) {
                missingQuestions.push({ customerId, questionNumber, sourceReference: `${title} Q${questionNumber}` });
                continue;
            }
            entries.push({
                customerId,
                questionNumber,
                rawCustomerAnswer: answer.rawAnswer,
                sourceReference: `${title} Q${questionNumber}`,
                ...classifyCustomerAnswer(customerId, questionNumber, answer.rawAnswer)
            });
        }
    }
    return { entries, missingQuestions };
}

function retrieveAuthoritativeEvidenceLedger(frameworkPath = AUTHORITATIVE_RECORDS.perfumeVendingValidationFramework) {
    const framework = fs.readFileSync(frameworkPath, 'utf8');
    return buildEvidenceLedger(framework);
}

function ingestAuthoritativeCustomerInterview({ answers, date, frameworkPath = AUTHORITATIVE_RECORDS.perfumeVendingValidationFramework }) {
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        throw new TypeError('answers must be an object keyed by question number');
    }
    if (typeof date !== 'string' || !date.trim()) {
        throw new TypeError('date must be a non-empty string');
    }
    for (const [questionNumber, answer] of Object.entries(answers)) {
        if (!/^(?:[1-9]|1[0-2])$/.test(questionNumber)) {
            throw new RangeError(`Unsupported interview question number: ${questionNumber}`);
        }
        if (typeof answer !== 'string') {
            throw new TypeError(`Answer for Q${questionNumber} must be a string`);
        }
    }

    const framework = fs.readFileSync(frameworkPath, 'utf8');
    const interviewNumbers = getCustomerInterviewBlocks(framework)
        .map((block) => Number(block.match(/^### Customer Interview #(\d+)/)?.[1]));
    const nextInterviewNumber = interviewNumbers.length > 0 ? Math.max(...interviewNumbers) + 1 : 1;
    const rawAnswers = Array.from({ length: 12 }, (_, index) => {
        const questionNumber = String(index + 1);
        const answer = Object.prototype.hasOwnProperty.call(answers, questionNumber)
            ? answers[questionNumber]
            : 'Not answered.';
        return `${questionNumber}. **${answer}**`;
    }).join('\n');
    const record = [
        `### Customer Interview #${String(nextInterviewNumber).padStart(3, '0')}`,
        `- Date: ${date}`,
        `- Customer: Customer ${nextInterviewNumber}`,
        '- Segment: Unknown; no demographic inference recorded.',
        '- Evidence type: CUSTOMER EVIDENCE',
        '',
        '#### Raw answers',
        rawAnswers,
        ''
    ].join('\n');
    const validationCriteriaMarker = '\n## 13. Validation Criteria';
    const insertionPoint = framework.indexOf(validationCriteriaMarker);
    if (insertionPoint < 0) throw new Error('Validation criteria section not found');
    const updatedFramework = `${framework.slice(0, insertionPoint).replace(/\s*$/, '\n\n')}${record}${framework.slice(insertionPoint)}`;
    fs.writeFileSync(frameworkPath, updatedFramework, 'utf8');
    return { customerNumber: nextInterviewNumber, record };
}

function retrieveAuthoritativeInterviewEvidence(transcript, frameworkPath = AUTHORITATIVE_RECORDS.perfumeVendingValidationFramework) {
    if (!isAuthoritativeInterviewEvidenceRequest(transcript)) return null;
    let framework;
    try {
        framework = fs.readFileSync(frameworkPath, 'utf8');
    } catch {
        return {
            targetTrack: 'Historical Evidence Retrieval',
            operationalMode: 'Authoritative Evidence Unavailable',
            reply: 'I could not retrieve the authoritative customer interview evidence from the available source record.'
        };
    }

    const interviewBlocks = getCustomerInterviewBlocks(framework);
    const rawEvidence = interviewBlocks.map((block) => {
        const title = block.match(/^### Customer Interview #\d+/)?.[0] || 'Customer interview';
        const answers = block.match(/#### Raw answers\s*([\s\S]*?)(?=\n#### |$)/i)?.[1]?.trim() || '(No raw answers recorded.)';
        return `${title}\n${answers}`;
    }).join('\n\n');
    const observations = interviewBlocks.map((block) => {
        const title = block.match(/^### Customer Interview #\d+/)?.[0] || 'Customer interview';
        const analysis = block.match(/#### Analysis \(our interpretation, not customer fact\)\s*([\s\S]*?)(?=\n#### Evidence (?:strength|assessment))/i)?.[1]?.trim() || '(No derived observations recorded.)';
        return `${title}\n${analysis}`;
    }).join('\n\n');
    const validationStatus = interviewBlocks.map((block) => {
        const title = block.match(/^### Customer Interview #\d+/)?.[0] || 'Customer interview';
        const strength = block.match(/#### Evidence (?:strength|assessment)\s*([\s\S]*?)(?=\nThis interview does not validate)/i)?.[1]?.trim() || '(No evidence assessment recorded.)';
        return `${title}\n${strength}`;
    }).join('\n\n');
    const researcherNotesStart = framework.indexOf('## Researcher Clarifications and Supporting Market Research');
    const researcherNotes = researcherNotesStart >= 0
        ? framework.slice(researcherNotesStart).trim()
        : '(No researcher clarification or supporting market research section recorded.)';
    const followUpQuestions = framework.split(/\r?\n/).filter((line) => line.trim().startsWith('|')).map((line) => line.split('|').map((cell) => cell.trim())).filter((cells) => cells.some((cell) => /Does the emergency\/fragrance problem recur|Is this emergency fragrance|Does occasion-driven purchasing/i.test(cell))).map((cells) => cells[cells.length - 2]).filter((question) => question && !/^Follow-up question$/i.test(question));
    const followUps = followUpQuestions.length ? followUpQuestions.map((question) => '- ' + question).join('\n') : '(No open follow-up questions recorded.)';

    return {
        targetTrack: 'Historical Evidence Retrieval',
        operationalMode: 'Deterministic Authoritative Evidence',
        reply: [
            `Customer interviews recorded in authoritative source: ${interviewBlocks.length}.`,
            '## Observed customer evidence',
            rawEvidence,
            '## Derived observations (source interpretation)',
            observations,
            '## Validation status recorded in source',
            validationStatus,
            '## Open follow-up questions (not findings)',
            followUps,
            '## Researcher clarifications and supporting market research',
            researcherNotes
        ].join('\n\n')
    };
}

function recentVaultNotes() {
    const notes = [];
    const excludedFolders = new Set(['.obsidian', 'node_modules', '.git', '04_Vault_Archive', '00_System']);
    function scan(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!excludedFolders.has(entry.name)) scan(path.join(folder, entry.name));
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const filePath = path.join(folder, entry.name);
                notes.push({ filePath, modified: fs.statSync(filePath).mtimeMs });
            }
        }
    }
    try { scan(VAULT_PATH); } catch { return '(Could not scan vault notes.)'; }
    return notes.sort((a, b) => b.modified - a.modified).slice(0, 5).map(({ filePath }) => {
        return `### ${path.relative(VAULT_PATH, filePath)}\n${readFileTail(filePath, 900)}`;
    }).join('\n\n');
}

function readMemoryStore() {
    try {
        const parsed = JSON.parse(fs.readFileSync(MEMORY_PATH, 'utf8'));
        return {
            facts: Array.isArray(parsed.facts) ? parsed.facts : [],
            hypotheses: Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [],
            experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
            lessons: Array.isArray(parsed.lessons) ? parsed.lessons : [],
            project_validations: Array.isArray(parsed.project_validations) ? parsed.project_validations : [],
            calendar_executions: Array.isArray(parsed.calendar_executions) ? parsed.calendar_executions : []
        };
    } catch {
        return JSON.parse(JSON.stringify(DEFAULT_MEMORY_STORE));
    }
}

function appendMemoryEntry(collectionKey, entry) {
    const store = readMemoryStore();
    const collection = Array.isArray(store[collectionKey]) ? store[collectionKey] : [];
    collection.unshift({
        timestamp: new Date().toISOString(),
        ...entry
    });
    if (collection.length > 50) collection.length = 50;
    store[collectionKey] = collection;
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2), 'utf8');
    return store[collectionKey][0];
}

function recordCalendarExecution(originalRequest, calendarResult) {
    const parsed = calendarResult.parsed || parseCalendarCreateRequest(originalRequest) || {};
    const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Africa/Nairobi';
    const hasSchedule = parsed.date && parsed.startTime && Number.isInteger(parsed.durationMinutes);
    const record = {
        originalRequest,
        title: parsed.title || null,
        date: parsed.date || null,
        startTime: parsed.startTime || null,
        endTime: hasSchedule ? addMinutesToCalendarTime(parsed.date, parsed.startTime, parsed.durationMinutes) : null,
        timezone,
        status: calendarResult.ok ? 'CREATED' : 'FAILED'
    };
    if (calendarResult.ok) record.eventId = calendarResult.eventId;
    else record.reason = calendarResult.reason || 'Calendar event creation failed.';
    return appendMemoryEntry('calendar_executions', record);
}

function findCalendarExecution(transcript) {
    const text = String(transcript || '').trim().toLowerCase();
    if (!text || !/(calendar|schedule|scheduled|meeting|appointment|event)/i.test(text)) return null;
    if (!/(did|was|were|actually|really|created|scheduled|booked|added|go through|go through)/i.test(text)) return null;

    const store = readMemoryStore();
    const executions = Array.isArray(store.calendar_executions) ? store.calendar_executions : [];
    if (!executions.length) return { status: 'NOT_FOUND' };

    const terms = [...new Set(
        text.match(/[a-z][a-z0-9-]{2,}/g) || []
    )].filter((term) => !new Set([
        'calendar', 'schedule', 'scheduled', 'meeting', 'appointment',
        'event', 'did', 'was', 'were', 'actually', 'really', 'created',
        'booked', 'added', 'that', 'the', 'you', 'it', 'go', 'through'
    ]).has(term));

    const scored = executions.map((entry) => {
        const haystack = [
            entry.title,
            entry.originalRequest,
            entry.date,
            entry.startTime
        ].filter(Boolean).join(' ').toLowerCase();

        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { entry, score };
    }).filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) return { status: 'NOT_FOUND' };

    return {
        status: scored[0].entry.status,
        entry: scored[0].entry
    };
}

function normalizeValidationStatus(status) {
    const value = String(status || 'UNVALIDATED').toUpperCase();
    return VALIDATION_LIFECYCLE.includes(value) ? value : 'UNVALIDATED';
}

function normalizeProjectValidationEntry(entry) {
    const hypothesis = String(entry?.hypothesis || entry?.project || 'Unspecified hypothesis').trim();
    const evidence = Array.isArray(entry?.evidence) ? entry.evidence.map((item) => ({
        source: String(item?.source || 'unspecified source').trim(),
        detail: String(item?.detail || item?.summary || item || '').trim()
    })).filter((item) => item.detail) : [];

    let status = normalizeValidationStatus(entry?.status);
    const reason = String(entry?.reason || '').trim();
    const decision = entry?.decision ? String(entry.decision).toUpperCase() : null;

    if (status === 'VALIDATED' && (!evidence.length || !reason)) {
        status = 'TESTING';
    }

    if ((status === 'REJECTED' || status === 'PARKED') && !reason) {
        status = 'TESTING';
    }

    if (status === 'UNVALIDATED' && evidence.length > 0) {
        status = 'TESTING';
    }

    const normalized = {
        project: String(entry?.project || hypothesis || 'Unspecified project').trim(),
        hypothesis,
        evidence,
        status,
        decision: VALIDATION_LIFECYCLE.includes(decision || '') ? decision : null,
        reason: status === 'VALIDATED'
            ? (reason || 'Validation requires evidence before a project can be marked validated.')
            : (status === 'REJECTED' || status === 'PARKED')
                ? (reason || 'Decision requires a reason before this project can be closed.')
                : (reason || (evidence.length ? 'Evidence is being gathered and the idea remains under validation.' : 'No direct evidence yet; this remains a hypothesis.')),
        timestamp: entry?.timestamp || new Date().toISOString()
    };

    if (status === 'VALIDATED' && (!normalized.evidence.length || !normalized.reason)) {
        normalized.status = 'TESTING';
        normalized.reason = 'Validation requires evidence before a project can be marked validated.';
    }

    if ((status === 'REJECTED' || status === 'PARKED') && !normalized.reason) {
        normalized.status = 'TESTING';
        normalized.reason = 'Decision requires a reason before this project can be closed.';
    }

    return normalized;
}

function summarizeMemoryStore() {
    const store = readMemoryStore();
    const sections = [];
    const renderSection = (label, items, formatter) => {
        if (!Array.isArray(items) || !items.length) return null;
        const rendered = items.slice(0, 5).map((item) => formatter(item)).join('\n');
        return `## ${label}\n${rendered}`;
    };

    ['facts', 'hypotheses', 'lessons', 'experiences'].forEach((key) => {
        const section = renderSection(key.replace('_', ' '), store[key], (item) => {
            if (typeof item === 'string') return `- ${item}`;
            return `- ${item.summary || item.claim || item.lesson || item.name || item.prompt || 'Memory item'}`;
        });
        if (section) sections.push(section);
    });

    const validationSection = renderSection('project validations', store.project_validations, (item) => {
        const decision = item.decision ? ` [${item.decision}]` : '';
        const status = item.status ? ` (${item.status})` : '';
        const evidence = Array.isArray(item.evidence) && item.evidence.length ? ` | evidence: ${item.evidence.map((entry) => entry.detail || entry.source || 'evidence').slice(0, 2).join('; ')}` : '';
        return `- ${item.project || item.hypothesis || 'Project'}${status}${decision}${evidence}${item.reason ? ` | reason: ${item.reason}` : ''}`;
    });
    if (validationSection) sections.push(validationSection);

    return sections.length ? sections.join('\n\n') : '## Structured memory\nNo structured memory recorded yet.';
}

function retrieveRelevantVaultMaterial(transcript, maxCharacters = 6000) {
    const stopWords = new Set(['about','after','again','also','been','before','being','could','does','from','give','have','into','just','know','simple','status','that','their','there','these','this','today','update','what','when','where','which','with','would','your']);

    const terms = [...new Set((String(transcript || '').match(/[A-Za-z][A-Za-z0-9/-]{2,}/g) || [])
        .flatMap((term) => term.split(/[/-]/))
        .map((term) => term.toLowerCase())
        .filter((term) => !stopWords.has(term) && term.length >= 4))];

    const excludedFolders = new Set(['.obsidian', 'node_modules', '.git', '04_Vault_Archive', '00_System']);
    const matches = [];

    function scan(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (!excludedFolders.has(entry.name)) scan(path.join(folder, entry.name));
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const filePath = path.join(folder, entry.name);
                const masterPath = path.join(VAULT_PATH, 'Session Logs', 'Master_Note.md');

                if (path.normalize(filePath).toLowerCase() === path.normalize(masterPath).toLowerCase()) {
                    continue;
                }

                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lowerContent = content.toLowerCase();
                    const score = terms.reduce((total, term) =>
                        total + (lowerContent.match(new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) || []).length, 0);

                    if (score > 0) {
                        const relativePath = path.relative(VAULT_PATH, filePath);
                        const canonicalBoost =
                            /01_Apogee_Core|03_Active_Engine|00_Command_Center/i.test(relativePath) ? 100 : 0;

                        matches.push({
                            filePath,
                            content,
                            score: score + canonicalBoost,
                            modified: fs.statSync(filePath).mtimeMs
                        });
                    }
                } catch { }
            }
        }
    }

    try { scan(VAULT_PATH); } catch { }

    matches.sort((a, b) => b.score - a.score || b.modified - a.modified);

    const material = [];
    let remaining = maxCharacters;

    try {
        const masterPath = path.join(VAULT_PATH, 'Session Logs', 'Master_Note.md');
        const master = fs.readFileSync(masterPath, 'utf8');
        const interactionMatches = [...master.matchAll(/^### Apogee Interaction\b/gm)];

        if (interactionMatches.length) {
            const start = interactionMatches[interactionMatches.length - 1].index;
            const latestEntry = master.slice(start).trim();
            const continuityBlock = `### Latest Master_Note Entry\n${latestEntry}`.slice(0, 1500);
            material.push(continuityBlock);
            remaining -= continuityBlock.length;
        }
    } catch { }

    for (const match of matches) {
        if (remaining <= 0) break;

        const relativePath = path.relative(VAULT_PATH, match.filePath);
        const block = `### ${relativePath}\n${match.content.trim()}`;
        const clipped = block.slice(0, Math.min(2500, remaining));

        material.push(clipped);
        remaining -= clipped.length;
    }

    return material.length
        ? material.join('\n\n')
        : 'No topic-specific persisted material matched this request.';
}
function splitAtomicActions(transcript) {
    return String(transcript || '').split(/\s+(?:and\s+then|then|and)\s+(?=(?:read|show|display|retrieve|research|investigate|look\s+up|find|edit|remove|delete|add|update|change|mark|implement|fix|modify|write|schedule|create|book|is|are|what|why|how|can|does|do|come\s+back)\b)/i).map((action) => action.trim()).filter(Boolean);
}

const CALENDAR_MONTHS = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function parseCalendarCreateRequest(request) {
    const text = String(request || '').trim();
    const intent = text.match(/^(?:please\s+)?(?:schedule|create|book|add|set up)\s+(.+)$/i);
    if (!intent || !/(?:calendar|event|meeting|appointment|call|reminder|schedule|book)/i.test(text)) return null;

    const body = intent[1].trim();
    const dateMatch = body.match(/(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s-]+)?(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i);
    const isoDateMatch = body.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const weekdayOnly = body.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const date = dateMatch
        ? `${dateMatch[3]}-${String(CALENDAR_MONTHS[dateMatch[2].toLowerCase()] + 1).padStart(2, '0')}-${String(Number(dateMatch[1])).padStart(2, '0')}`
        : isoDateMatch ? `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}` : null;
    const timeMatch = body.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i) || body.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    let startTime = null;
    if (timeMatch) {
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2] || 0);
        const meridiem = timeMatch[3]?.toUpperCase();
        if (meridiem && (hour < 1 || hour > 12)) return { error: 'The event time is invalid.' };
        const normalizedHour = meridiem === 'AM' ? hour % 12 : meridiem === 'PM' ? (hour % 12) + 12 : hour;
        startTime = `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    const dateStart = dateMatch?.index ?? isoDateMatch?.index;
    const titleEnd = dateStart === undefined ? body.search(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b\d{4}-\d{2}-\d{2}\b/i) : dateStart;
    const durationMatch = body.match(/\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i);
    const title = body.slice(0, titleEnd < 0 ? body.length : titleEnd)
        .replace(durationMatch ? /\s+for\s*$/i : /$^/, '')
        .replace(/[â€”â€“-]+\s*$/, '')
        .trim();
    const durationMinutes = durationMatch ? Number(durationMatch[1]) * (/hour|hr/i.test(durationMatch[2]) ? 60 : 1) : 60;
    const locationMatch = body.match(/\bat\s+(?!\d)([^,.;]+?)(?=\s+(?:for|about|described as)\b|[,.;]|$)/i);
    const descriptionMatch = body.match(/\b(?:about|described as)\s+(.+)$/i);
    if (!title) return { error: 'I need an event title.' };
    if (!date || weekdayOnly && !date) return { error: 'I need an unambiguous calendar date, including day, month, and year.' };
    if (!startTime) return { error: 'I need an unambiguous start time.' };
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return { error: 'The event duration is invalid.' };
    return { title, date, startTime, durationMinutes, location: locationMatch?.[1]?.trim() || null, description: descriptionMatch?.[1]?.trim() || null };
}

function requestJson(options, body = null, requestImplementation = https.request) {
    return new Promise((resolve, reject) => {
        const request = requestImplementation(options, (response) => {
            let responseBody = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { responseBody += chunk; });
            response.on('end', () => {
                let parsed;
                try { parsed = responseBody ? JSON.parse(responseBody) : {}; }
                catch { parsed = { raw: responseBody }; }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    const error = new Error(`Google Calendar returned HTTP ${response.statusCode}.`);
                    error.statusCode = response.statusCode;
                    error.response = parsed;
                    reject(error);
                    return;
                }
                resolve(parsed);
            });
        });
        request.on('error', reject);
        if (body) request.write(body);
        request.end();
    });
}

function isPathInside(parentPath, candidatePath) {
    const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
    return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function validateGoogleCalendarConfiguration(tokenPath = GOOGLE_CALENDAR_TOKEN_PATH) {
    if (!tokenPath) return { valid: false, reason: 'GOOGLE_CALENDAR_TOKEN_PATH is not configured.' };
    const resolvedTokenPath = path.resolve(tokenPath);
    if (isPathInside(VAULT_PATH, resolvedTokenPath)) return { valid: false, reason: 'GOOGLE_CALENDAR_TOKEN_PATH must point outside the Obsidian vault.' };
    let token;
    try { token = JSON.parse(fs.readFileSync(resolvedTokenPath, 'utf8')); }
    catch (error) {
        return { valid: false, reason: error.code === 'ENOENT' ? 'Google Calendar token file is missing.' : 'Google Calendar token file is not valid JSON.' };
    }
    if (!token || typeof token !== 'object' || Array.isArray(token) || token.token || token.expiry) {
        return { valid: false, reason: 'Google Calendar token must use the OAuth JSON format with access_token, optional refresh_token, expiry_date, and scope(s).' };
    }
    const scopes = Array.isArray(token.scopes)
        ? token.scopes
        : typeof token.scope === 'string' ? token.scope.split(/\s+/).filter(Boolean) : [];
    if (!scopes.includes('https://www.googleapis.com/auth/calendar.events')) {
        return { valid: false, reason: 'Google Calendar token is missing the required calendar.events scope.' };
    }
    if (typeof token.access_token !== 'string' && typeof token.refresh_token !== 'string') {
        return { valid: false, reason: 'Google Calendar token must contain access_token or refresh_token.' };
    }
    const expired = token.expiry_date && Number(token.expiry_date) <= Date.now() + 60000;
    if (expired && !token.refresh_token) return { valid: false, reason: 'Google Calendar access token is expired and has no refresh_token.' };
    if (expired && (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET)) {
        return { valid: false, reason: 'Expired Google Calendar token requires GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET for refresh.' };
    }
    return { valid: true, token, tokenPath: resolvedTokenPath, scopes };
}

function readGoogleCalendarToken() {
    const configuration = validateGoogleCalendarConfiguration();
    return configuration.valid ? configuration.token : null;
}

async function getGoogleCalendarAccessToken(requestImplementation = https.request) {
    const configuration = validateGoogleCalendarConfiguration();
    if (!configuration.valid) return { accessToken: null, error: configuration.reason };
    const token = configuration.token;
    if (token.access_token && (!token.expiry_date || token.expiry_date > Date.now() + 60000)) return { accessToken: token.access_token };
    if (!token.refresh_token || !process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.GOOGLE_CALENDAR_CLIENT_SECRET) return { accessToken: null, error: 'Google Calendar token refresh configuration is incomplete.' };
    const body = new URLSearchParams({
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token'
    }).toString();
    const refreshed = await requestJson({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, body, requestImplementation);
    if (!refreshed.access_token) return { accessToken: null, error: 'Google OAuth returned no access token during refresh.' };
    const updatedToken = { ...token, ...refreshed, expiry_date: Date.now() + (Number(refreshed.expires_in || 3600) * 1000) };
    fs.writeFileSync(configuration.tokenPath, JSON.stringify(updatedToken, null, 2), { encoding: 'utf8', mode: 0o600 });
    return { accessToken: refreshed.access_token };
}

function addMinutesToCalendarTime(date, time, durationMinutes) {
    const end = new Date(`${date}T${time}:00Z`);
    end.setUTCMinutes(end.getUTCMinutes() + durationMinutes);
    return `${end.toISOString().slice(0, 19)}`;
}

async function createGoogleCalendarEvent(request, requestImplementation = https.request) {
    const parsed = parseCalendarCreateRequest(request);
    if (!parsed) return { ok: false, deterministic: true, reason: 'I could not identify a calendar event request.' };
    if (parsed.error) return { ok: false, deterministic: true, reason: parsed.error };
    let accessToken;
    let authentication;
    try { authentication = await getGoogleCalendarAccessToken(requestImplementation); }
    catch (error) { return { ok: false, configured: true, reason: `Google Calendar authentication failed: ${error.message}` }; }
    accessToken = authentication.accessToken;
    if (!accessToken) return { ok: false, configured: false, reason: authentication.error || 'Google Calendar is not configured or authenticated.' };
    const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Africa/Nairobi';
    const event = {
        summary: parsed.title,
        start: { dateTime: `${parsed.date}T${parsed.startTime}:00`, timeZone: timezone },
        end: { dateTime: addMinutesToCalendarTime(parsed.date, parsed.startTime, parsed.durationMinutes), timeZone: timezone }
    };
    if (parsed.location) event.location = parsed.location;
    if (parsed.description) event.description = parsed.description;
    const body = JSON.stringify(event);
    try {
        const response = await requestJson({
            hostname: 'www.googleapis.com',
            path: '/calendar/v3/calendars/primary/events',
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, body, requestImplementation);
        if (!response.id) return { ok: false, configured: true, reason: 'Google Calendar returned no event ID; creation is unconfirmed.' };
        return { ok: true, eventId: response.id, response, parsed };
    } catch (error) {
        return { ok: false, configured: true, reason: `Google Calendar event creation failed: ${error.message}` };
    }
}

function classifyRequestedAction(action) {
    const text = String(action || '').trim();
    const lower = text.toLowerCase();
    if (/(come back|when you(?:'|â€™)re finished|in the background|later|async)/i.test(lower)) return 'BACKGROUND_TASK';
    if (parseCalendarCreateRequest(text)) return 'CALENDAR_CREATE';
    if (/(edit|remove|delete|add|update|change|mark)\b[\s\S]*(dashboard|vault|note|file|master dashboard)/i.test(lower)) return 'VAULT_EDIT';
    if (/(implement|change the code|fix the code|add a feature|modify the runtime|write code)/i.test(lower)) return 'CODE_CHANGE';
    if (/(researcher clarifications?|supporting market research|researcher assumption)/i.test(lower) && /(interview|customer|perfume|spray|splash|pricing|validation)/i.test(lower)) return 'ANSWER_NOW';
    if (/(read|show|reproduce|retrieve|display|quote)/i.test(lower) && /(validation_framework\.md|validation framework|local file|local section|section titled|section called|open unknowns?)/i.test(lower)) return 'LOCAL_READ';
    if (/(read|show|reproduce|retrieve|display|quote)/i.test(lower) && (/(validation_framework\.md|validation framework|local file|local section|section titled|section called|open unknowns?)/i.test(lower) || /\b[a-z0-9_ -]+\.md\b/i.test(lower))) return 'LOCAL_READ';
    if (/(research|investigate|look up|find out|competitor|competitors|web search)/i.test(lower)) return 'EXTERNAL_RESEARCH';
    if (/\b(adjust|modify|change|fix|alter)\b/i.test(lower)) return 'CLARIFICATION_REQUIRED';
    return 'ANSWER_NOW';
}

function classifyRequestedActions(transcript) {
    const correction = parseExerciseCorrectionRequest(transcript);
    if (correction) return [{ action: String(transcript || '').trim(), capability: 'EXERCISE_CORRECTION' }];
    const text = String(transcript || '').trim();
    const atomicActions = splitAtomicActions(text);
    if (atomicActions.length === 1 && classifyRequestedAction(text) === 'LOCAL_READ') {
        return [{ action: text, capability: 'LOCAL_READ' }];
    }
    return atomicActions.map((action) => ({ action, capability: classifyRequestedAction(action) }));
}

const AI_CONTEXT_ROOT = path.join(VAULT_PATH, '01_Apogee_Core', 'AI_Context');

function resolveAIContextFile(fileName) {
    const requested = String(fileName || '').trim();
    if (!requested || !requested.toLowerCase().endsWith('.md')) return null;
    const candidate = path.resolve(AI_CONTEXT_ROOT, requested);
    if (!isPathInside(AI_CONTEXT_ROOT, candidate)) return null;
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) return null;
    return candidate;
}

function retrieveAIContextSection(transcript) {
    const text = String(transcript || '').trim();
    const fileMatch = text.match(/(?:from|in)\s+(?:the\s+)?([A-Za-z0-9_ -]+\.md)\b/i) || text.match(/\b([A-Za-z0-9_][A-Za-z0-9_-]*\.md)\b/i);
    if (!fileMatch) return null;
    const filePath = resolveAIContextFile(fileMatch[1]);
    if (!filePath) return null;
    const headingMatch = text.match(/section\s+(?:titled|called)\s+(.+?)\s+(?:from|in)\s+/i) || text.match(/(?:read|show|display|retrieve)\s+(?:the\s+)?(.+?)\s+section\s+(?:from|in)\s+/i);
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!headingMatch) return { targetTrack: 'AI Context', operationalMode: 'Deterministic Local Read', reply: content.trim() };
        const heading = headingMatch[1].trim().replace(/^['\"�]|['\"�]$/g, '');
        const lines = content.split(/\r?\n/);
        const start = lines.findIndex((line) => { const match = line.match(/^(#{1,6})\s+(.+?)\s*$/); return match && match[2].trim().toLowerCase() === heading.toLowerCase(); });
        if (start < 0) return null;
        const startLevel = lines[start].match(/^(#{1,6})\s+/)[1].length;
        let end = lines.length;
        for (let index = start + 1; index < lines.length; index += 1) { const match = lines[index].match(/^(#{1,6})\s+/); if (match && match[1].length <= startLevel) { end = index; break; } }
        return { targetTrack: 'AI Context', operationalMode: 'Deterministic Local Read', reply: lines.slice(start, end).join('\n').trim() };
    } catch { return null; }
}

function retrieveLocalValidationSection(transcript) {
    const text = String(transcript || '').trim();
    const headingMatch = text.match(/section\s+(?:titled|called)\s+["��]?(.+?)["��]?\s+(?:from|in)\s+/i) || text.match(/(?:read|show|display|retrieve)\s+(?:the\s+)?(.+?)\s+section\s+(?:from|in)\s+/i) || text.match(/(?:read|show|display|retrieve)\s+(?:the\s+)?(open\s+and\s+non-section)\s+(?:from|in)\s+/i);
    const heading = headingMatch?.[1]?.trim();
    const normalizedHeading = heading?.toLowerCase().replace(/^open unknown$/, 'open unknowns').replace(/^open and non-section$/, 'open unknowns');
    if (!heading || !fs.existsSync(AUTHORITATIVE_RECORDS.perfumeVendingValidationFramework)) return null;

    try {
        const framework = fs.readFileSync(AUTHORITATIVE_RECORDS.perfumeVendingValidationFramework, 'utf8');
        const lines = framework.split(/\r?\n/);
        const start = lines.findIndex((line) => {
            const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);
            return match && match[2].trim().toLowerCase() === normalizedHeading;
        });
        if (start < 0) return null;

        const startHeading = lines[start].match(/^(#{1,6})\s+/);
        const startLevel = startHeading ? startHeading[1].length : 2;

        let end = lines.length;
        for (let index = start + 1; index < lines.length; index += 1) {
            const match = lines[index].match(/^(#{1,6})\s+/);
            if (match && match[1].length <= startLevel) {
                end = index;
                break;
            }
        }

        return {
            targetTrack: 'Local Validation Record',
            operationalMode: 'Deterministic Local Read',
            reply: lines.slice(start, end).join('\n').trim()
        };
    } catch {
        return null;
    }
}

function buildCapabilityHandoff(capability, action) {
    const request = String(action || '').trim();
    if (capability === 'VAULT_EDIT') {
        return `Builder-agent handoff (VAULT_EDIT):\nPlease apply this vault change directly and report the exact file and resulting line: ${request}`;
    }
    if (capability === 'CODE_CHANGE') {
        return `Builder-agent handoff (CODE_CHANGE):\nPlease implement this request in the Apogee repository, run focused validation, and report exact files changed and test results: ${request}`;
    }
    if (capability === 'EXTERNAL_RESEARCH') {
        return `External-research handoff (EXTERNAL_RESEARCH):\nPlease research this using current external sources, cite the sources, and summarize the evidence: ${request}`;
    }
    if (capability === 'BACKGROUND_TASK') {
        return `Background execution is unavailable: Apogee has no background executor and will not continue working after this response. Handoff required to the appropriate executor, which should accept this request explicitly:\n${request}`;
    }
    if (capability === 'CALENDAR_CREATE') {
        return `Builder-agent handoff (CALENDAR_CREATE):\nGoogle Calendar is not configured or authenticated for this runtime. Please authenticate securely and create the requested event only after confirming the parsed title, date, start time, and optional details. Report the Google Calendar API response and event ID as evidence; do not claim creation without a successful API response: ${request}`;
    }
    return '';
}

function buildCapabilityHandoffResponse(transcript) {
    const preflight = buildCapabilityPreflight(transcript);
    const status = preflight.actions.filter(({ capability }) => capability !== 'ANSWER_NOW').map(({ capability }) => {
        if (capability === 'VAULT_EDIT') return 'The vault change has NOT been made. Apogee cannot directly modify the vault.';
        if (capability === 'CODE_CHANGE') return 'The implementation has NOT been performed. Apogee cannot directly change the code.';
        if (capability === 'EXTERNAL_RESEARCH') return 'The research has NOT been performed. Apogee does not have external research capability in this runtime.';
        if (capability === 'CALENDAR_CREATE') return 'The calendar event has NOT been created. Google Calendar is not configured or authenticated in this runtime.';
        return 'The requested background task has NOT been started. Apogee has no background executor.';
    });
    return `${status.join('\n')}\n\nHandoff required:\n${preflight.handoffs.join('\n\n')}\n\nAwaiting result: No executor has accepted this handoff yet.`;
}

function readHandoffs() {
    try {
        const handoffs = JSON.parse(fs.readFileSync(HANDOFFS_PATH, 'utf8'));
        return Array.isArray(handoffs) ? handoffs : [];
    } catch {
        return [];
    }
}

function writeHandoffs(handoffs) {
    fs.writeFileSync(HANDOFFS_PATH, JSON.stringify(handoffs, null, 2), 'utf8');
}

function createHandoff(actionType, originalRequest, handoffPrompt) {
    const handoffs = readHandoffs();
    const handoff = {
        id: `HO-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        actionType,
        originalRequest,
        handoffPrompt,
        status: 'PENDING',
        createdTimestamp: new Date().toISOString(),
        completedTimestamp: null,
        resultEvidence: null
    };
    handoffs.push(handoff);
    writeHandoffs(handoffs);
    return handoff;
}

function createHandoffsForRequest(transcript, preflight) {
    return preflight.actions
        .filter(({ capability }) => !['ANSWER_NOW', 'LOCAL_READ', 'CLARIFICATION_REQUIRED'].includes(capability))
        .map(({ action, capability }) => {
            const handoffPrompt = buildCapabilityHandoff(capability, action);
            return createHandoff(capability, transcript, handoffPrompt);
        });
}

function buildTrackedHandoffResponse(handoffs) {
    const status = handoffs.map(({ actionType, id }) => {
        if (actionType === 'VAULT_EDIT') return `The vault change was not made. Handoff created: ${id}`;
        if (actionType === 'CODE_CHANGE') return `The code change was not made. Handoff created: ${id}`;
        if (actionType === 'EXTERNAL_RESEARCH') return `The external research was not performed. Handoff created: ${id}`;
        if (actionType === 'CALENDAR_CREATE') return `The calendar event was not created. Handoff created: ${id}`;
        return `The background task was not started. Handoff created: ${id}`;
    });
    return status.join('\n');
}

function parseHandoffResultCommand(transcript) {
    const match = String(transcript || '').trim().match(/^handoff\s+result\s*:\s*([A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/i);
    return match ? { id: match[1], result: match[2].trim() } : null;
}

function recordHandoffResult(transcript) {
    const command = parseHandoffResultCommand(transcript);
    if (!command) return null;
    const handoffs = readHandoffs();
    const handoff = handoffs.find((entry) => entry.id === command.id);
    if (!handoff) {
        return { reply: `No handoff found with ID ${command.id}.`, targetTrack: 'Handoff Tracking', operationalMode: 'Handoff Result Error' };
    }
    const failed = /^(?:failed|failure|status\s*:\s*failed)\b/i.test(command.result);
    handoff.resultEvidence = command.result;
    handoff.status = failed ? 'FAILED' : 'COMPLETED';
    handoff.completedTimestamp = new Date().toISOString();
    writeHandoffs(handoffs);
    return {
        reply: `Recorded handoff ${handoff.id} for ${handoff.actionType}.\nExecutor-reported result: ${handoff.resultEvidence}\nStatus: ${handoff.status}. Apogee has recorded the supplied evidence; it has not independently validated the underlying result.`,
        targetTrack: 'Handoff Tracking',
        operationalMode: 'Handoff Result Recorded'
    };
}

function pendingHandoffsResponse(transcript) {
    if (!/^what handoffs are pending\??$/i.test(String(transcript || '').trim())) return null;
    const pending = readHandoffs().filter((handoff) => handoff.status === 'PENDING');
    const lines = pending.map((handoff) => `- ${handoff.id} | ${handoff.actionType} | ${handoff.originalRequest.slice(0, 100)} | ${handoff.status}`);
    return {
        reply: lines.length ? `Pending handoffs:\n${lines.join('\n')}` : 'No pending handoffs.',
        targetTrack: 'Handoff Tracking',
        operationalMode: 'Handoff Status'
    };
}


function buildCapabilityPreflight(transcript) {
    const actions = isAuthoritativeInterviewAnalysisRequest(transcript)
        ? [{ action: String(transcript || '').trim(), capability: 'ANSWER_NOW' }]
        : classifyRequestedActions(transcript);
    const clarifications = actions
        .filter(({ capability }) => capability === 'CLARIFICATION_REQUIRED')
        .map(({ action }) => action);
    const unsupported = actions.filter(({ capability }) =>
        capability !== 'ANSWER_NOW' && capability !== 'CLARIFICATION_REQUIRED' && capability !== 'LOCAL_READ'
    );
    const answerNow = actions
        .filter(({ capability }) => capability === 'ANSWER_NOW')
        .map(({ action }) => action);
    return {
        actions,
        answerNowTranscript: answerNow.join(' and '),
        clarifications,
        handoffs: unsupported.map(({ action, capability }) => buildCapabilityHandoff(capability, action))
    };
}

function recordStructuredMemory(transcript, response) {
    const promptText = String(transcript || '').trim();
    const replyText = String(response?.reply || '').trim();
    const lower = promptText.toLowerCase();

    if (/(operating mode|current mode|system status|apogee status)/i.test(promptText)) {
        appendMemoryEntry('facts', {
            claim: 'Apogee is configured for Claude-first operation with local Ollama fallback.',
            source: 'runtime status',
            status: 'confirmed',
            evidence: replyText
        });
    }

    const isIdeaLike = /(idea|hypothesis|maybe|could|should|pilot|launch|project|concept|opportunity)/i.test(lower);
    const hasEvidenceLanguage = /(evidence|proof|tested|verified|validated|pilot|result|data|customer signal|feedback|trial)/i.test(lower);
    if (isIdeaLike) {
        const hypothesisText = promptText || replyText || 'Unspecified hypothesis';
        const isRuntimeFailure = /(api.*(fail|error)|authentication failed|claude.*fail|processing failed)/i.test(replyText);
        const evidence = hasEvidenceLanguage && !isRuntimeFailure && replyText
            ? [{ source: 'runtime response', detail: replyText.slice(0, 500) }]
            : [];
        appendMemoryEntry('hypotheses', {
            claim: hypothesisText,
            status: 'unvalidated',
            assumption: 'Needs evidence before becoming an active project.'
        });

        const validationRecord = normalizeProjectValidationEntry({
            project: hypothesisText.slice(0, 120),
            hypothesis: hypothesisText,
            evidence,
            status: evidence.length ? 'TESTING' : 'UNVALIDATED',
            decision: null,
            reason: evidence.length ? 'Evidence is being gathered and the idea remains under validation.' : 'No direct evidence yet; this remains a hypothesis.'
        });
        appendMemoryEntry('project_validations', validationRecord);
    }

    if (/(api.*(fail|error)|authentication failed|claude.*fail|processing failed)/i.test(replyText)) {
        appendMemoryEntry('lessons', {
            lesson: 'Check API credentials or fallback path when repeated auth failures occur.',
            category: 'reliability',
            evidence: replyText,
            confidence: 'medium'
        });
    }

    appendMemoryEntry('experiences', {
        prompt: promptText,
        outcome: replyText.slice(0, 600),
        tags: [
            /(calendar|schedule)/i.test(lower) ? 'calendar' : null,
            /(step|health|exercise|movement)/i.test(lower) ? 'health' : null,
            /(action|task|priority|focus)/i.test(lower) ? 'actions' : null
        ].filter(Boolean)
    });
}

function classifyResponseMode(transcript) {
    const text = String(transcript || '').trim().toLowerCase();

    if (/(status update|where are we|where do we stand|what(?:'s| is) important|briefing|catch me up|what(?:'s| is) happening today)/i.test(text)) {
        return 'DAILY_BRIEFING';
    }

    if (/(health|steps|exercise|walking|activity|movement|calories|distance)/i.test(text)) {
        return 'HEALTH_STATUS';
    }

    if (/(project|projects|validation|validated|hypothesis|customer feedback|customer interviews|active work|priority)/i.test(text)) {
        return 'PROJECT_STATUS';
    }

    if (/(post|posting|content|linkedin|social media|what can i post|build in public)/i.test(text)) {
        return 'CONTENT';
    }

    if (/(operating mode|current mode|system status|apogee status|runtime|architecture|how does apogee work|how does the system work)/i.test(text)) {
        return 'SYSTEM_STATUS';
    }

    return 'GENERAL';
}

function buildResponseContext(mode, transcript) {
    const topicMaterial = retrieveRelevantVaultMaterial(transcript);

    switch (mode) {
        case 'DAILY_BRIEFING':
            return [
                '## Calendar',
                readFileTail(CALENDAR_PATH, 4000),
                '## Health log (recent)',
                readFileTail(EXERCISE_PATH, 1800),
                '## Current action-item dashboard (authoritative)',
                readFileTail(MASTER_DASHBOARD_PATH, 4000),
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Topic-specific persisted material',
                topicMaterial,
                '## Recently modified vault notes',
                recentVaultNotes()
            ].join('\n\n');

        case 'HEALTH_STATUS':
            return [
                '## Health log (recent)',
                readFileTail(EXERCISE_PATH, 3000),
                '## Relevant persisted health material',
                topicMaterial
            ].join('\n\n');

        case 'PROJECT_STATUS':
            return [
                '## Current action-item dashboard (authoritative)',
                readFileTail(MASTER_DASHBOARD_PATH, 4000),
                '## AI Ideas inbox (hypotheses only, not the active project list)',
                readFileTail(AI_IDEAS_PATH, 4000),
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Topic-specific persisted project material',
                topicMaterial
            ].join('\n\n');

        case 'CONTENT':
            return [
                '## Current action-item dashboard (authoritative)',
                readFileTail(MASTER_DASHBOARD_PATH, 3000),
                '## AI Ideas inbox (hypotheses only, not the active project list)',
                readFileTail(AI_IDEAS_PATH, 4000),
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Relevant persisted material',
                topicMaterial
            ].join('\n\n');

        case 'SYSTEM_STATUS':
            return [
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Relevant persisted system material',
                topicMaterial
            ].join('\n\n');

        default:
            return [
                '## Topic-specific persisted material',
                topicMaterial,
                '## Current action-item dashboard (authoritative)',
                readFileTail(MASTER_DASHBOARD_PATH, 3000)
            ].join('\n\n');
    }
}

function buildVaultContext(transcript) {
    return ['## Calendar', readFileTail(CALENDAR_PATH, 4000), '## Health log (recent)', readFileTail(EXERCISE_PATH, 1800), '## Current action-item dashboard (authoritative)', readFileTail(MASTER_DASHBOARD_PATH, 4000), '## AI Ideas inbox (hypotheses only, not the active project list)', readFileTail(AI_IDEAS_PATH, 4000), '## Structured memory (facts, hypotheses, lessons, experiences, project validations)', summarizeMemoryStore(), '## Topic-specific persisted material', retrieveRelevantVaultMaterial(transcript), '## Recent Apogee interactions', readFileTail(MASTER_NOTE_PATH, 2500), '## Recently modified vault notes', recentVaultNotes()].join('\n\n');
}

function saveInteraction(prompt, response) {
    const history = readHistory();
    history.push(response);
    fs.writeFileSync(DB_PATH, JSON.stringify(history, null, 2), 'utf8');
    fs.appendFileSync(MASTER_NOTE_PATH, `\n### Apogee Interaction\n* **Command:** "${prompt}"\n* **Action:** "${response.reply}"\n`, 'utf8');
}

function requestOllama(vaultContext, transcript) {
    providerCallCounts.ollama++;
    const url = new URL('/api/generate', OLLAMA_BASE_URL);
    const requestBody = JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: {
            num_predict: 400
        },
        prompt: `${DAILY_BRIEFING_RULES}\n\nVault Context:\n${vaultContext}\n\nUser Command: "${transcript}"`
    });

    return new Promise((resolve, reject) => {
        const request = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(requestBody) },
            timeout: OLLAMA_TIMEOUT_MS
        }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`Ollama returned HTTP ${response.statusCode}.`));
                    return;
                }
                try {
                    const parsed = JSON.parse(body);
                    if (!parsed.response) throw new Error('Ollama returned no response text.');
                    resolve(parsed.response);
                } catch (error) {
                    reject(new Error(`Invalid Ollama response: ${error.message}`));
                }
            });
        });
        request.on('timeout', () => request.destroy(new Error('Ollama request timed out.')));
        request.on('error', reject);
        request.write(requestBody);
        request.end();
    });
}

function normalizeResult(transcript, rawText, defaultMode = 'Local Mode') {
    const rawResponse = rawText.trim().replace(/^`json\s*|`$/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(rawResponse); }
    catch { parsed = { reply: rawResponse, targetTrack: 'General', operationalMode: defaultMode }; }
    if (!String(parsed.reply || '').trim()) throw new Error('No usable reply in model response.');
    return {
        query: transcript, timestamp: new Date().toISOString(),
        reply: parsed.reply,
        targetTrack: parsed.targetTrack || 'General',
        operationalMode: defaultMode === 'Local Ollama' ? 'Local Ollama' : (parsed.operationalMode || defaultMode),
        systemHealthScore: '100%'
    };
}

function deterministicLocalResponse(transcript) {
    const command = transcript.toLowerCase();
    const localResult = { targetTrack: 'General', operationalMode: 'Local Mode' };

    if (command.includes('operating mode') || command.includes('system status') || command.includes('apogee status') || command.includes('current mode')) {
        return {
            ...localResult,
            reply: `Apogee is configured for Claude-first operation with local Ollama fallback using ${OLLAMA_MODEL}.`
        };
    }

    if ((command.includes('today') || command.includes('tomorrow')) && (command.includes('calendar') || command.includes('schedule') || command.includes('agenda'))) {
        if (!fs.existsSync(CALENDAR_PATH)) return null;
        const calendar = readFileTail(CALENDAR_PATH, 4000);
        const sectionName = command.includes('tomorrow') ? 'Tomorrow' : 'Today';
        const section = calendar.match(new RegExp(`## ${sectionName}([\\s\\S]*?)(?=\\n## |$)`, 'i'));
        if (!section) return null;
        return { ...localResult, reply: `${sectionName}'s calendar:\n${section[1].trim()}` };
    }

    if (command.includes('exercise') || command.includes('step count') || command.includes('steps today')) {
        if (!fs.existsSync(EXERCISE_PATH)) return null;
        return { ...localResult, reply: `Recent exercise status:\n${readFileTail(EXERCISE_PATH, 1800)}` };
    }

    if ((command.includes('recent') || command.includes('latest') || command.includes('last')) && (command.includes('apogee') || command.includes('interaction') || command.includes('update') || command.includes('history'))) {
        const history = readHistory();
        if (!history.length) return null;
        return { ...localResult, reply: `Recent Apogee interactions:\n${JSON.stringify(history.slice(-5), null, 2)}` };
    }

    return null;
}

function deterministicCalculatorResponse(transcript) {
    const command = String(transcript || '').trim();
    const calculationMatch = command.match(/^(?:calculate|compute|what is|how much is|work out|solve)\s+(.+)$/i);
    if (!calculationMatch) return null;

    let expression = calculationMatch[1]
        .replace(/,/g, '')
        .replace(/\b(?:dollars?|usd|kes)\b/gi, '')
        .replace(/\bpercent\b/gi, '%')
        .replace(/\bof\b/gi, '*')
        .replace(/(\d+(?:\.\d+)?)\s+(?:units?|customers?|sales?|items?)\s+(?:at|x|times)\s+\$?(\d+(?:\.\d+)?)(?:\s+(?:each|per unit))?/i, '$1*$2')
        .replace(/\b(?:revenue|costs?|expenses?|profit|price|units?|customers?|sales?|items?)\b/gi, '')
        .replace(/:/g, '')
        .trim();

    const tokens = expression.match(/\d*\.?\d+|[()+\-*/%]/g);
    if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '') || tokens.length > 100) return null;

    let position = 0;
    const parseExpression = () => {
        let value = parseTerm();
        while (tokens[position] === '+' || tokens[position] === '-') {
            const operator = tokens[position++];
            const right = parseTerm();
            value = operator === '+' ? value + right : value - right;
        }
        return value;
    };
    const parseTerm = () => {
        let value = parseFactor();
        while (tokens[position] === '*' || tokens[position] === '/') {
            const operator = tokens[position++];
            const right = parseFactor();
            if (operator === '/' && right === 0) throw new Error('Division by zero.');
            value = operator === '*' ? value * right : value / right;
        }
        return value;
    };
    const parseFactor = () => {
        if (tokens[position] === '+') {
            position++;
            return parseFactor();
        }
        if (tokens[position] === '-') {
            position++;
            return -parseFactor();
        }
        if (tokens[position] === '(') {
            position++;
            const value = parseExpression();
            if (tokens[position++] !== ')') throw new Error('Unmatched parenthesis.');
            return value;
        }
        const value = Number(tokens[position++]);
        if (!Number.isFinite(value)) throw new Error('Invalid number.');
        if (tokens[position] === '%') {
            position++;
            return value / 100;
        }
        return value;
    };

    try {
        const result = parseExpression();
        if (position !== tokens.length || !Number.isFinite(result)) return null;
        const formattedResult = Number(result.toFixed(10));
        return {
            targetTrack: 'General',
            operationalMode: 'Deterministic Calculator',
            reply: `Calculation: ${formattedResult}`
        };
    } catch {
        return null;
    }
}

function sanitizeForSpeech(text) {
    return String(text)
        .replace(/\*\*|__|\*|_|`|#+/g, ' ')
        .replace(/[\[\](){}`<>]/g, ' ')
        .replace(/ðŸ“…|ðŸƒ|ðŸ—‚ï¸|ðŸŽ¯|âœ…|âš ï¸|ðŸš¨|ðŸ“Œ|ðŸ’¡|ðŸŒ¿|ðŸ”|ðŸ“ˆ/gu, ' ')
        .replace(/[-\u2010-\u2015\u2212]+/g, ' ')
        .replace(/([.!?:])\r?\n{2,}/g, ' ')
        .replace(/\r?\n{2,}/g, '. ')
        .replace(/([.!?:])\r?\n/g, ' ')
        .replace(/\r?\n/g, ', ')
        .replace(/\s+/g, ' ')
        .trim();
}

let activeSpeechProcess = null;

function speakLocally(text) {
    if (TEST_MODE) return;
    const spokenText = sanitizeForSpeech(text);
    const script = 'Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak([Console]::In.ReadToEnd())';
    const speechProcess = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true });
    activeSpeechProcess = speechProcess;
    const reportSpeechError = (error) => console.log(`[Speech Error]: ${error.message}`);
    speechProcess.on('error', reportSpeechError);
    speechProcess.stdin.on('error', reportSpeechError);
    speechProcess.on('close', (code) => {
        if (activeSpeechProcess === speechProcess) activeSpeechProcess = null;
        if (code !== 0 && code !== null) reportSpeechError(new Error(`PowerShell exited with code ${code}.`));
    });
    speechProcess.stdin.end(spokenText, 'utf8');
}
async function runSystemPipeline(transcript) {
    const authoritativeQuestions = retrieveAuthoritativeInterviewQuestions(transcript);
    if (authoritativeQuestions) {
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: authoritativeQuestions.reply,
            targetTrack: authoritativeQuestions.targetTrack,
            operationalMode: authoritativeQuestions.operationalMode,
            systemHealthScore: '100%'
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const authoritativeEvidence = retrieveAuthoritativeInterviewEvidence(transcript);
    const interviewAnalysisRequest = isAuthoritativeInterviewAnalysisRequest(transcript);

    if (authoritativeEvidence && !interviewAnalysisRequest) {
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: authoritativeEvidence.reply,
            targetTrack: authoritativeEvidence.targetTrack,
            operationalMode: authoritativeEvidence.operationalMode,
            systemHealthScore: '100%'
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const resultCommand = recordHandoffResult(transcript);
    const pendingCommand = pendingHandoffsResponse(transcript);
    if (resultCommand || pendingCommand) {
        const trackingResult = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: (resultCommand || pendingCommand).reply,
            targetTrack: (resultCommand || pendingCommand).targetTrack,
            operationalMode: (resultCommand || pendingCommand).operationalMode,
            systemHealthScore: '100%'
        };
        currentDashboardData = trackingResult;
        recordStructuredMemory(transcript, trackingResult);
        saveInteraction(transcript, trackingResult);
        console.log(`[Apogee Reply]: "${trackingResult.reply}"`);
        speakLocally(trackingResult.reply);
        promptUser();
        return trackingResult;
    }
    const calendarStatus = findCalendarExecution(transcript);
    if (calendarStatus) {
        let result;

        if (calendarStatus.status === 'CREATED') {
            const entry = calendarStatus.entry;
            result = {
                query: transcript,
                timestamp: new Date().toISOString(),
                reply: 'Yes. I have recorded evidence that the Google Calendar event was created: "' + entry.title + '" on ' + entry.date + ' at ' + entry.startTime + ' ' + entry.timezone + '. Event ID: ' + entry.eventId + '.',
                targetTrack: 'Calendar Verification',
                operationalMode: 'Recorded Calendar Execution',
                systemHealthScore: '100%'
            };
        } else if (calendarStatus.status === 'FAILED') {
            const entry = calendarStatus.entry;
            result = {
                query: transcript,
                timestamp: new Date().toISOString(),
                reply: 'No. I have recorded evidence that the Calendar event was not created. Reason: ' + entry.reason.replace(/[.!?]+$/, '') + '.',
                targetTrack: 'Calendar Verification',
                operationalMode: 'Recorded Calendar Execution Failure',
                systemHealthScore: '100%'
            };
        } else {
            result = {
                query: transcript,
                timestamp: new Date().toISOString(),
                reply: 'I do not have a recorded Calendar execution for that request, so I cannot honestly say that the event was created.',
                targetTrack: 'Calendar Verification',
                operationalMode: 'No Recorded Calendar Execution',
                systemHealthScore: '100%'
            };
        }

        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log('[Apogee Reply]: "' + result.reply + '"');
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const capabilityPreflight = buildCapabilityPreflight(transcript);
    const localReadAction = capabilityPreflight.actions.find(({ capability }) => capability === 'LOCAL_READ');
    if (localReadAction) {
        const localRead = retrieveAIContextSection(localReadAction.action) || retrieveLocalValidationSection(localReadAction.action);
        if (localRead) {
            const pendingHandoffs = createHandoffsForRequest(transcript, capabilityPreflight);
            const result = {
                query: transcript,
                timestamp: new Date().toISOString(),
                reply: localRead.reply,
                targetTrack: localRead.targetTrack,
                operationalMode: localRead.operationalMode,
                systemHealthScore: '100%'
            };

            if (pendingHandoffs.length) {
                result.reply = `${result.reply}\n\n${buildTrackedHandoffResponse(pendingHandoffs)}`;
                result.targetTrack = 'Local Validation Record + Capability Handoff';
                result.operationalMode = 'Local Read + Handoff Required';
            }

            currentDashboardData = result;
            saveInteraction(transcript, result);
            console.log(`[Apogee Reply]: "${result.reply}"`);
            speakLocally(result.reply);
            promptUser();
            return result;
        }
    }

    const exerciseCorrectionAction = capabilityPreflight.actions.find(({ capability }) => capability === 'EXERCISE_CORRECTION');
    if (exerciseCorrectionAction) {
        const correction = applyExerciseCorrection(exerciseCorrectionAction.action);
        const result = {
            reply: correction.ok
                ? `Exercise log corrected: ${correction.steps} steps moved to ${correction.targetDate}${correction.clearDate ? `; ${correction.clearDate} cleared.` : '.'}`
                : `Exercise correction failed: ${correction.reason}`,
            deterministic: true,
            exerciseCorrection: correction
        };
        saveInteraction(transcript, result);
        return result;
    }
    const calendarAction = capabilityPreflight.actions.find(({ capability }) => capability === 'CALENDAR_CREATE');
    if (calendarAction) {
        const calendarResult = await createGoogleCalendarEvent(calendarAction.action);
        recordCalendarExecution(calendarAction.action, calendarResult);
        if (calendarResult.deterministic) {
            const result = {
                query: transcript,
                timestamp: new Date().toISOString(),
                reply: `Google Calendar event was not created. ${calendarResult.reason}`,
                targetTrack: 'Calendar',
                operationalMode: 'Deterministic Calendar Validation',
                systemHealthScore: '100%'
            };
            currentDashboardData = result;
            recordStructuredMemory(transcript, result);
            saveInteraction(transcript, result);
            console.log(`[Apogee Reply]: "${result.reply}"`);
            speakLocally(result.reply);
            promptUser();
            return result;
        }
        if (!calendarResult.ok && !calendarResult.configured) {
            const handoffs = createHandoffsForRequest(transcript, {
                actions: [calendarAction],
                handoffs: [buildCapabilityHandoff('CALENDAR_CREATE', calendarAction.action)]
            });
            const result = {
                query: transcript,
                timestamp: new Date().toISOString(),
                reply: buildTrackedHandoffResponse(handoffs),
                targetTrack: 'Calendar Handoff',
                operationalMode: 'Handoff Required',
                systemHealthScore: '100%'
            };
            currentDashboardData = result;
            recordStructuredMemory(transcript, result);
            saveInteraction(transcript, result);
            console.log(`[Apogee Reply]: "${result.reply}"`);
            speakLocally(result.reply);
            promptUser();
            return result;
        }
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: calendarResult.ok
                ? `Google Calendar event created successfully. Event ID: ${calendarResult.eventId}. The Google Calendar API returned a successful response.`
                : `Google Calendar event was not created. ${calendarResult.reason}`,
            targetTrack: 'Calendar',
            operationalMode: calendarResult.ok ? 'Google Calendar API' : 'Calendar Failure',
            systemHealthScore: '100%'
        };
        currentDashboardData = result;
        recordStructuredMemory(transcript, result);
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    if (!capabilityPreflight.answerNowTranscript) {
        const handoffs = createHandoffsForRequest(transcript, capabilityPreflight);
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: buildTrackedHandoffResponse(handoffs),
            targetTrack: 'Capability Handoff',
            operationalMode: 'Handoff Required',
            systemHealthScore: '100%'
        };
        currentDashboardData = result;
        recordStructuredMemory(transcript, result);
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const answerTranscript = capabilityPreflight.answerNowTranscript;
    let exerciseActionLog = '';

    const exerciseRequest = parseExerciseLogRequest(answerTranscript);

    if (exerciseRequest) {
        const { steps, date } = exerciseRequest;
        const metrics = updateExerciseLog(steps, date);

        exerciseActionLog =
            `[System Log]: Successfully logged ${steps} steps for ${date}. ` +
            `Calculated ${metrics.caloriesBurned} kcal burned and ${metrics.estimatedKm} km distance.`;
    }
    const responseMode = classifyResponseMode(answerTranscript);
    let vaultContext = buildResponseContext(responseMode, answerTranscript);
    if (authoritativeEvidence && interviewAnalysisRequest) {
        vaultContext += `\n\n## Authoritative Customer Interview Evidence\n${authoritativeEvidence.reply}`;
    }
    let result;
    const calculatorResponse = deterministicCalculatorResponse(answerTranscript);
    if (calculatorResponse) {
        result = normalizeResult(answerTranscript, JSON.stringify(calculatorResponse), 'Deterministic Calculator');
    } else try {
        providerCallCounts.claude++;
        const completion = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
            max_tokens: 1600,
            system: DAILY_BRIEFING_RULES,
            messages: [{ role: 'user', content: `Vault Context:\n${vaultContext}\n\n${exerciseActionLog}\n\nInput: "${answerTranscript}"` }]
        });
        console.log('[Claude Debug] stop_reason=' + completion.stop_reason + ' content_types=' + completion.content.map(block => block.type).join(','));
        const textBlock = completion.content.find((block) => block.type === 'text');
        if (!textBlock?.text) throw new Error('Claude returned no text response.');
        result = normalizeResult(answerTranscript, textBlock.text);
    } catch (error) {
        console.log(`[Claude Error]: name=${error?.name || 'Unknown'} message=${error?.message || 'No message'} status=${error?.status ?? error?.statusCode ?? 'Unavailable'} type=${error?.error?.type || error?.type || 'Unavailable'}`);
        const isAuthError = error?.status === 401 || String(error?.message).includes('authentication_error');
        try {
            const ollamaResponse = await requestOllama(vaultContext, answerTranscript);
            result = normalizeResult(answerTranscript, ollamaResponse, 'Local Ollama');
        } catch (ollamaError) {
            console.log(`[Ollama Fallback Error]: ${ollamaError.message}`);
            const localResponse = deterministicLocalResponse(answerTranscript);
            result = localResponse
                ? normalizeResult(answerTranscript, JSON.stringify(localResponse), 'Local Mode')
                : { query: answerTranscript, timestamp: new Date().toISOString(), reply: isAuthError ? 'API authentication failed. Please check your API key.' : 'Claude processing failed. See the terminal error details.', targetTrack: 'General', operationalMode: 'Local Fallback', systemHealthScore: '100%' };
        }
    }
    if (capabilityPreflight.handoffs.length || capabilityPreflight.clarifications.length) {
        const sections = [`Completed now:\n${result.reply}`];

        if (capabilityPreflight.handoffs.length) {
            sections.push(
                `Handoff required:\n${capabilityPreflight.handoffs.join('\n\n')}\n\nAwaiting result: No executor has accepted this handoff yet.`
            );
        }

        if (capabilityPreflight.clarifications.length) {
            sections.push(
                `Before I can make the adjustment, I need to know which issue you want me to change.`
            );
        }

        result.reply = sections.join('\n\n');
    }
    result.query = transcript;
    currentDashboardData = result;
    recordStructuredMemory(transcript, result);
    saveInteraction(transcript, result);
    console.log(`[Apogee Reply]: "${result.reply}"`);
    speakLocally(result.reply);
    promptUser();
    return result;
}

app.get('/api/metrics', (req, res) => res.json({ current: currentDashboardData, history: readHistory().slice(-20) }));
app.get('/', (req, res) => res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Apogee Local Engine</title><style>body{margin:0;background:#0b0f19;color:#e5e7eb;font:16px system-ui;padding:32px}main{max-width:960px;margin:auto}.card{background:#111827;border:1px solid #293345;border-radius:16px;padding:22px;margin:16px 0}.label{color:#818cf8;text-transform:uppercase;font-size:12px;letter-spacing:.12em}canvas{width:100%;height:220px;background:#0b0f19;border-radius:8px}</style></head><body><main><h1>Apogee Local Engine</h1><div class="card"><div class="label">Latest Command</div><p id="query">Loading...</p><div class="label">Response</div><p id="reply">Loading...</p></div><div class="card"><div class="label">Recent Activity</div><canvas id="chart" width="900" height="220"></canvas></div></main><script>const q=document.querySelector('#query'),r=document.querySelector('#reply'),c=document.querySelector('#chart'),x=c.getContext('2d');async function refresh(){try{const d=await(await fetch('/api/metrics')).json();q.textContent=d.current.query;r.textContent=d.current.reply;x.clearRect(0,0,c.width,c.height);const h=d.history;x.strokeStyle='#34d399';x.lineWidth=3;x.beginPath();h.forEach((_,i)=>{const px=30+i*(840/Math.max(h.length-1,1)),py=190-i*(150/Math.max(h.length,1));i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke()}catch{}}refresh();setInterval(refresh,1000);</script></body></html>`));

const rl = SHOULD_START ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
if (SHOULD_START) {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.on('keypress', (_input, key) => {
        if (key && key.name === 'escape' && activeSpeechProcess) {
            activeSpeechProcess.kill();
            activeSpeechProcess = null;
            process.stdout.write('\n[Apogee OS]: Speech interrupted.\n');
        }
    });
}

function promptUser() {
    if (!rl || rl.closed || rl.input.destroyed) return;
    process.stdout.write('\n[Apogee OS]: Command Input Ready:\n> ');
    try {
        rl.question('', (input) => {
            if (input.trim().toLowerCase() === 'exit') process.exit(0);
            if (input.trim()) runSystemPipeline(input.trim()); else promptUser();
        });
    } catch (error) {
        if (error.code !== 'ERR_USE_AFTER_CLOSE') throw error;
    }
}

if (SHOULD_START) {
    app.listen(PORT, () => console.log(`[Local Engine Active]: http://localhost:${PORT}`));
    syncGoogleCalendar();
    promptUser();
}

module.exports = {
    splitAtomicActions,
    parseCalendarCreateRequest,
    validateGoogleCalendarConfiguration,
    classifyRequestedActions,
    buildCapabilityHandoff,
    buildCapabilityPreflight,
    buildCapabilityHandoffResponse,
    readHandoffs,
    createHandoff,
    parseHandoffResultCommand,
    recordHandoffResult,
    pendingHandoffsResponse,
    isAuthoritativeInterviewQuestionRequest,
    retrieveAuthoritativeInterviewQuestions,
    isAuthoritativeInterviewEvidenceRequest,
    isAuthoritativeInterviewAnalysisRequest,
    ingestAuthoritativeCustomerInterview,
    buildEvidenceLedger,
    retrieveAuthoritativeEvidenceLedger,
    retrieveAuthoritativeInterviewEvidence,
    retrieveRelevantVaultMaterial,
    recordStructuredMemory,
    readMemoryStore,
    normalizeResult,
    sanitizeForSpeech,
    speakLocally,
    findCalendarExecution,
    runSystemPipeline,
    createGoogleCalendarEvent,
    parseExerciseCorrectionRequest,
    applyExerciseCorrection,
    providerCallCounts
};
















































