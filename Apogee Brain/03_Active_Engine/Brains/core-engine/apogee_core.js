require('dotenv').config();
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
    calendar_executions: [],
    pending_calendar_plan: null
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
- When a fresh actual Google Calendar read is present in the current request, treat that read as authoritative for current calendar availability; historical Master_Note or prior calendar claims are context only and must not override or contradict the fresh read.
- When a fresh actual Google Calendar read is present in the current request, treat that read as authoritative for current calendar availability; historical Master_Note or prior calendar claims are context only and must not override or contradict the fresh read.
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
- Lead with authoritative Current Focus and open action items. An unresolved item in structured memory or conversation history is not automatically current work; mention an older blocker only when authoritative current state depends on it or Dan explicitly asks about it.
- Treat completed dashboard actions as closed unless Dan explicitly asks about completed work or current state shows a new reason to revisit them.
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
- When giving counts or lists, reconcile each item against interview IDs and the authoritative source; do not estimate from memory. Label customer evidence separately from source interpretation and hypotheses.

Your goal is to help Dan think, decide, remember, and act ï¿½ naturally and accurately.`;

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

async function syncGoogleCalendar() {
    console.log('[Calendar Sync]: Fetching latest events from Google Calendar...');
    try {
        const authentication = await getGoogleCalendarAccessToken();
        if (!authentication.accessToken) {
            console.log(`[Calendar Sync Error]: ${authentication.error || 'Google Calendar is not authenticated.'}`);
            return;
        }

        const today = getNairobiDate();
        const addDays = (dateString, days) => {
            const [year, month, day] = dateString.split('-').map(Number);
            return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
        };
        const tomorrowDate = addDays(today, 1);
        const endDate = addDays(today, 2);

        const response = await requestJson({
            hostname: 'www.googleapis.com',
            path: `/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=50&timeMin=${encodeURIComponent(`${today}T00:00:00+03:00`)}&timeMax=${encodeURIComponent(`${endDate}T00:00:00+03:00`)}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${authentication.accessToken}` }
        });

        const events = { today: [], tomorrow: [] };
        for (const event of response.items || []) {
            const startValue = event.start?.dateTime || event.start?.date;
            if (!startValue) continue;
            const eventDate = event.start?.date || new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Africa/Nairobi',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date(startValue));
            if (eventDate === today) events.today.push(event);
            if (eventDate === tomorrowDate) events.tomorrow.push(event);
        }

        const agendaLines = (agendaEvents) => agendaEvents.length
            ? agendaEvents.map((event) => {
                if (event.start?.date) return `- **All Day** - ${event.summary || 'Untitled event'}`;
                const time = new Intl.DateTimeFormat('en-GB', {
                    timeZone: 'Africa/Nairobi',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).format(new Date(event.start.dateTime));
                return `- **${time}** - ${event.summary || 'Untitled event'}`;
            }).join('\n')
            : '*No scheduled events found.*';

        const markdown = `# Agenda\n*Last Synced: ${new Date().toLocaleString()}*\n\n## Today\n${agendaLines(events.today)}\n\n## Tomorrow\n${agendaLines(events.tomorrow)}\n`;
        fs.writeFileSync(CALENDAR_PATH, markdown, 'utf8');
        console.log(`[Calendar Sync]: Calendar.md updated with ${events.today.length + events.tomorrow.length} event(s).`);
    } catch (error) {
        console.log(`[Calendar Sync Error]: ${error.message}`);
    }
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
        /(?:customer.*interview|interview.*customer|customer.*answers?|recorded answers?|customer.*evidence|customer responses?)/i.test(command);

    const analysisIntent =
        /(?:analys[ei]s|analyse|analyze|where.*evidence.*points|what.*evidence.*means|what.*does.*this.*mean|synthesi[sz]e|patterns?|supporting evidence|contradictory evidence|market friction|underlying friction|recurring|differences|unvalidated|(?:what|which).*evidence.*(?:points? toward|guide)|where to start|next validation activity|what uncertainty|uncertaint(?:y|ies).*(?:resolve|remain|address))/i.test(command);

    const validationPlanningIntent =
        /(?:validation plan|plan (?:for|to) (?:validation|interview)|what.*investigat(?:e|ion).*(?:next|first)|what.*(?:ask|questions?)|what.*evidence.*(?:obtain|collect|gather)|what would make us.*(?:continue|change direction|stop)|move.*validation.*forward|(?:want|need|plan).*?(?:conduct|schedule|meet|introduction)|(?:first|next)\s+(?:three|3)\s+.*?(?:introduction|meeting|interview)|choose.*?(?:available|open).*?(?:slot|window)|space.*?(?:meeting|conversation|interview)|validation objective)/i.test(command);

    return interviewReference && (analysisIntent || validationPlanningIntent);
}
function isAuthoritativeInterviewEvidenceRequest(transcript) {
    const command = String(transcript || '').toLowerCase();
    const interviewReference = /(?:customer.*interview|interview.*customer|customer.*answers?|recorded answers?|customer.*evidence|customer responses?|customer\s*#?\s*\d+)/i.test(command);
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
    const evidenceStatusStart = framework.indexOf('## Evidence status');
    const researcherNotesStart = framework.indexOf('## Researcher Clarifications and Supporting Market Research');
    const evidenceStatusEnd = framework.indexOf('## Researcher Clarifications and Supporting Market Research', evidenceStatusStart);
    const evidenceStatus = evidenceStatusStart >= 0
        ? framework.slice(evidenceStatusStart, evidenceStatusEnd >= 0 ? evidenceStatusEnd : undefined).trim()
        : '(No overall evidence status summary recorded in source.)';
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
            '## Interview question mapping',
            'Q6 applies to all interview records: Have you ever wanted to try a fragrance before buying the whole bottle?',
            '## Observed customer evidence',
            rawEvidence,
            '## Derived observations (source interpretation)',
            observations,
            '## Validation status recorded in source',
            validationStatus,
            '## Open follow-up questions (not findings)',
            followUps,
            '## Evidence status summary from authoritative source',
            evidenceStatus,
            '## Researcher clarifications and supporting market research',
            researcherNotes
        ].join('\n\n')
    };
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
            calendar_executions: Array.isArray(parsed.calendar_executions) ? parsed.calendar_executions : [],
            pending_calendar_plan: parsed.pending_calendar_plan && typeof parsed.pending_calendar_plan === 'object' ? parsed.pending_calendar_plan : null
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


function persistPendingCalendarPlan(plan) {
    const store = readMemoryStore();
    store.pending_calendar_plan = plan;
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2), 'utf8');
    return plan;
}

function clearPendingCalendarPlan() {
    const store = readMemoryStore();
    store.pending_calendar_plan = null;
    fs.writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function getPendingCalendarPlan() {
    const plan = readMemoryStore().pending_calendar_plan;
    return plan && plan.status === 'PENDING' && plan.capability === 'CALENDAR_CREATE' && Array.isArray(plan.events) ? plan : null;
}

function hasCalendarReminderRequest(text) {
    const value = String(text || '');
    return /\b(?:(?:one|a)\s+day\s+before|day[\s-]+before|24\s+hours\s+before)\b/i.test(value)
        && /\b6(?::00)?\s*a\.?m\.?\b[\s\S]*\bsame[ -]day\b/i.test(value);
}

function parseProposalDate(text, defaultYear) {
    const value = String(text || '');
    const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    const months = CALENDAR_PROPOSAL_MONTHS;
    const monthFirst = value.match(new RegExp('\\b(' + months + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?(?:\\s+(20\\d{2}))?\\b', 'i'));
    const dayFirst = value.match(new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + months + ')[,]?\\s*(20\\d{2})?\\b', 'i'));
    if (!monthFirst && !dayFirst) return null;
    const year = Number((monthFirst && monthFirst[3]) || (dayFirst && dayFirst[3]) || defaultYear);
    const monthName = (monthFirst ? monthFirst[1] : dayFirst[2]).toLowerCase();
    const day = Number(monthFirst ? monthFirst[2] : dayFirst[1]);
    const monthIndex = CALENDAR_MONTHS[monthName] ?? CALENDAR_MONTHS[Object.keys(CALENDAR_MONTHS).find((name) => name.startsWith(monthName))];
    const month = monthIndex + 1;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isInteger(year) || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}

function parseProposalClock(hourValue, minuteValue, meridiemValue) {
    let hour = Number(hourValue);
    const minute = Number(minuteValue || 0);
    const meridiem = String(meridiemValue || '').toUpperCase().replace(/\./g, '');
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        hour = meridiem === 'AM' ? hour % 12 : (hour % 12) + 12;
    }
    return { time: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'), minutes: hour * 60 + minute };
}

function parseCalendarProposalSlot(line, defaultYear) {
    const text = String(line || '');
    const date = parseProposalDate(text, defaultYear);
    if (!date) return null;
    const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
    const dateMatch = iso || text.match(new RegExp('\\b(?:' + CALENDAR_PROPOSAL_MONTHS + ')\\s+\\d{1,2}(?:st|nd|rd|th)?[,]?(?:\\s+20\\d{2})?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:' + CALENDAR_PROPOSAL_MONTHS + ')[,]?\\s*(?:20\\d{2})?\\b', 'i'));
    const tail = text.slice(dateMatch.index + dateMatch[0].length);
    const range = tail.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*[-\u2013]\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
    let clock;
    let durationMinutes = 60;
    if (range) {
        const startPeriod = range[3] || range[6] || '';
        const endPeriod = range[6] || range[3] || '';
        clock = parseProposalClock(range[1], range[2], startPeriod);
        const end = parseProposalClock(range[4], range[5], endPeriod);
        if (clock && end && end.minutes > clock.minutes) durationMinutes = end.minutes - clock.minutes;
    } else {
        const time = tail.match(/\b(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)?/i);
        if (!time || (!time[2] && !time[3])) return null;
        clock = parseProposalClock(time[1], time[2], time[3]);
    }
    if (!clock) return null;
    const explicitDuration = tail.match(/\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i);
    if (explicitDuration) durationMinutes = Number(explicitDuration[1]) * (/hour|hr/i.test(explicitDuration[2]) ? 60 : 1);
    return { date, startTime: clock.time, durationMinutes };
}

function deriveProposedCalendarTitle(request, index) {
    const value = String(request || '');
    if (/perfume\s+vending\s+validation/i.test(value) && /gym[ -]owner/i.test(value)) {
        return 'Perfume Vending Validation - Gym-Owner Introduction #' + (index + 1);
    }
    const subject = value.match(/([a-z][a-z0-9 -]{1,45}?)\s+meetings?\b/i);
    if (subject) {
        const cleaned = subject[1].replace(/\b(?:three|four|five|two|30-minute|45-minute)\b/ig, '').replace(/\s+/g, ' ').trim();
        if (cleaned) return cleaned.replace(/^[- ]+|[- ]+$/g, '') + ' Meeting #' + (index + 1);
    }
    return 'Proposed Meeting #' + (index + 1);
}

function maybePersistProposedCalendarPlan(request, reply) {
    const userText = String(request || '');
    if (!/(?:calendar|meetings?|schedule|available windows|time slots)/i.test(userText)
        || !/(?:propose|identify|choose|suggest|available|open windows|suitable)/i.test(userText)
        || !/\b(?:proposed?|proposal|candidate)\b/i.test(reply)
        || !/(?:nothing is booked|not booked|not been booked|not created|not scheduled|say the word.{0,40}create)/i.test(reply)) return null;
    const yearMatch = userText.match(/\b(20\d{2})\b/);
    if (!yearMatch) return null;
    const slots = String(reply || '').split(/\r?\n/).map((line) => parseCalendarProposalSlot(line, Number(yearMatch[1]))).filter(Boolean);
    const unique = [];
    for (const slot of slots) {
        if (!unique.some((item) => item.date === slot.date && item.startTime === slot.startTime)) unique.push(slot);
    }
    if (unique.length < 2) return null;
    const remindersRequested = hasCalendarReminderRequest(userText);
    const events = unique.map((slot, index) => ({
        ...slot,
        title: deriveProposedCalendarTitle(userText, index),
        location: null,
        description: null,
        remindersRequested
    }));
    return persistPendingCalendarPlan({ capability: 'CALENDAR_CREATE', status: 'PENDING', createdAt: new Date().toISOString(), timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || 'Africa/Nairobi', events });
}

function isAffirmativeCalendarPlanExecution(text) {
    const value = String(text || '');
    const referencesPlan = /\b(?:proposed|those|them|these|the\s+(?:two|three|four|five)\s+(?:(?:proposed|initial)\s+)?(?:meetings?|events?|slots?)|(?:those|these)\s+(?:calendar\s+)?(?:events?|dates|slots|meetings?))\b/i.test(value);
    const positiveIntent = value.replace(/\b(?:do not|don't|dont)\b[^.!?]*/gi, '');
    const executionIntent = /\b(?:yes|go ahead|book|schedule|create|use)\b/i.test(positiveIntent);
    return referencesPlan && executionIntent;
}

function calendarReminderOverrides(parsed, requestText) {
    if (!parsed.remindersRequested && !hasCalendarReminderRequest(requestText)) return { requested: false, overrides: [] };
    const parts = String(parsed.startTime || '').split(':').map(Number);
    const minutesAfterMidnight = parts[0] * 60 + parts[1];
    if (!Number.isInteger(minutesAfterMidnight) || minutesAfterMidnight < 360) {
        return { requested: true, error: 'A 6:00 AM reminder cannot be represented as a reminder before an event that starts before 6:00 AM.' };
    }
    return { requested: true, overrides: [
        { method: 'popup', minutes: 1440 },
        { method: 'popup', minutes: minutesAfterMidnight - 360 }
    ] };
}

function calendarEventBatchReply(results) {
    const succeeded = results.filter((item) => item.result.ok).length;
    if (results.length === 1) {
        const item = results[0];
        if (!item.result.ok) return 'Google Calendar event was not created. ' + item.result.reason;
        const actualStart = item.result.actualEvent?.startDateTime;
        const schedule = actualStart ? ' Written schedule: ' + item.result.actualEvent.title + ' at ' + actualStart + '.' : ' Requested schedule: ' + item.event.date + ' ' + item.event.startTime + ' (Google did not return start/end fields for verification).';
        const reminderNote = item.remindersRequested ? (item.result.remindersVerified ? ' Requested reminders were returned and verified.' : ' The event was created, but Google did not return reminder data to verify the requested reminders.') : '';
        return 'Google Calendar event created successfully. Event ID: ' + item.result.eventId + '.' + schedule + reminderNote;
    }
    const lines = results.map((item, index) => {
        const event = item.event;
        if (!item.result.ok) return 'Event ' + (index + 1) + ': not created (' + event.title + ', ' + event.date + ' ' + event.startTime + ') - ' + item.result.reason;
        const actualStart = item.result.actualEvent?.startDateTime;
        const schedule = actualStart ? item.result.actualEvent.title + ' at ' + actualStart : event.title + ' at ' + event.date + ' ' + event.startTime + ' (submitted; schedule fields not returned)';
        const reminder = item.remindersRequested ? (item.result.remindersVerified ? ' Reminders verified.' : ' Reminders not verified by the API response.') : '';
        return 'Event ' + (index + 1) + ': created - ' + schedule + ', ' + event.durationMinutes + ' minutes, ID: ' + item.result.eventId + '.' + reminder;
    });
    return ['Created ' + succeeded + ' of ' + results.length + ' calendar events.', ...lines].join('\n');
}

async function executeCalendarEventBatch(events, originalRequest) {
    const results = [];
    for (const request of events) {
        const result = await createGoogleCalendarEvent(request, https.request, originalRequest);
        const event = result.parsed || (typeof request === 'object' ? request : {});
        recordCalendarExecution(originalRequest, { ...result, parsed: result.parsed });
        results.push({ event, result, remindersRequested: Boolean(event.remindersRequested || hasCalendarReminderRequest(originalRequest)) });
    }
    return results;
}


function findCalendarExecution(transcript) {
    const text = String(transcript || '').trim().toLowerCase();
    if (!text || parseCalendarReadRequest(text)) return null;
    if (!/\b(?:did|does|do|was|were|has|have|is)\b[\s\S]*\b(?:created|scheduled|booked|added|go through)\b/i.test(text)) return null;

    const store = readMemoryStore();
    const executions = Array.isArray(store.calendar_executions) ? store.calendar_executions : [];
    if (!executions.length) return { status: 'NOT_FOUND' };

    const matches = executions.filter((entry) => {
        const title = String(entry.title || '').trim().toLowerCase();
        const eventId = String(entry.eventId || '').trim().toLowerCase();
        const exactTitle = title.length >= 4 && text.includes(title);
        const exactEventId = eventId && text.includes(eventId);
        const exactDateAndTime = entry.date && entry.startTime
            && text.includes(String(entry.date).toLowerCase())
            && text.includes(String(entry.startTime).toLowerCase());
        return exactTitle || exactEventId || exactDateAndTime;
    });

    if (matches.length !== 1) return { status: 'NOT_FOUND' };
    return { status: matches[0].status, entry: matches[0] };
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

function summarizeMemoryStore(options = {}) {
    const store = readMemoryStore();
    const sections = [];
    const renderSection = (label, items, formatter) => {
        if (!Array.isArray(items) || !items.length) return null;
        const rendered = items.slice(0, 5).map((item) => formatter(item)).join('\n');
        return `## ${label}\n${rendered}`;
    };

    const memorySections = options.currentBriefingOnly
        ? ['facts']
        : ['facts', 'hypotheses', 'lessons', 'experiences'];
    memorySections.forEach((key) => {
        const section = renderSection(key.replace('_', ' '), store[key], (item) => {
            if (typeof item === 'string') return `- ${item}`;
            return `- ${item.summary || item.claim || item.lesson || item.name || item.prompt || 'Memory item'}`;
        });
        if (section) sections.push(section);
    });

    const validationSection = options.currentBriefingOnly ? null : renderSection('project validations', store.project_validations, (item) => {
        const decision = item.decision ? ` [${item.decision}]` : '';
        const status = item.status ? ` (${item.status})` : '';
        const evidence = Array.isArray(item.evidence) && item.evidence.length ? ` | evidence: ${item.evidence.map((entry) => entry.detail || entry.source || 'evidence').slice(0, 2).join('; ')}` : '';
        return `- ${item.project || item.hypothesis || 'Project'}${status}${decision}${evidence}${item.reason ? ` | reason: ${item.reason}` : ''}`;
    });
    if (validationSection) sections.push(validationSection);

    return sections.length ? sections.join('\n\n') : '## Structured memory\nNo structured memory recorded yet.';
}

function isExplicitHistoryRequest(transcript) {
    return /\b(?:what happened|what did i ask|what did we discuss|earlier|previously|last time|in the past|history of|remind me about|look up the earlier)\b/i.test(String(transcript || ''));
}

function retrieveRelevantInteractionHistory(transcript, maxCharacters = 5000) {
    if (!isExplicitHistoryRequest(transcript)) return '';

    const stopWords = new Set(['about', 'after', 'been', 'could', 'from', 'have', 'happened', 'with', 'what', 'when', 'where', 'which', 'would']);
    const terms = [...new Set((String(transcript || '').match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [])
        .flatMap((term) => term.split('-'))
        .map((term) => term.toLowerCase())
        .filter((term) => term.length >= 4 && !stopWords.has(term)))];
    if (!terms.length) return '';

    const matches = readHistory()
        .filter((entry) => entry && typeof entry === 'object' && (entry.query || entry.reply))
        .map((entry) => {
            const content = `${entry.query || ''}\n${entry.reply || ''}`;
            const lower = content.toLowerCase();
            const score = terms.reduce((total, term) => total + (new RegExp(`\\b${term}\\b`, 'i').test(lower) ? 1 : 0), 0);
            return { entry, content, score };
        })
        .filter(({ score }) => score >= Math.min(2, terms.length))
        .sort((a, b) => String(b.entry.timestamp || '').localeCompare(String(a.entry.timestamp || '')))
        .slice(0, 3);

    let remaining = maxCharacters;
    const blocks = [];
    for (const { entry } of matches) {
        if (remaining <= 0) break;
        const block = `### Historical interaction (${entry.timestamp || 'date unavailable'})\nRequest: ${String(entry.query || '').trim()}\nRecorded response: ${String(entry.reply || '').trim()}`;
        const clipped = block.slice(0, Math.min(2000, remaining));
        blocks.push(clipped);
        remaining -= clipped.length;
    }
    return blocks.join('\n\n');
}

function briefingActionDashboard(transcript) {
    const dashboard = readFileTail(MASTER_DASHBOARD_PATH, 4000);
    if (/\b(?:completed (?:task|action|work)|work i completed|what have i done|what did i finish|already complete|marked complete)\b/i.test(String(transcript || ''))) return dashboard;
    return dashboard.split(/\r?\n/).filter((line) => !/^\s*[-*]\s*\[x\]/i.test(line)).join('\n');
}

function retrieveRelevantVaultMaterial(transcript, maxCharacters = 6000) {
    const stopWords = new Set(['about','after','again','also','been','before','being','could','does','from','give','have','into','just','know','simple','status','that','their','there','these','this','today','update','what','when','where','which','with','would','your']);

    const terms = [...new Set((String(transcript || '').match(/[A-Za-z][A-Za-z0-9/-]{2,}/g) || [])
        .flatMap((term) => term.split(/[/-]/))
        .map((term) => term.toLowerCase())
        .filter((term) => !stopWords.has(term) && term.length >= 4))];

    const excludedArtifacts = /(?:^|[\\/])(?:\.obsidian(?:-mcp)?|\.git|\.trash|node_modules|00_system|04_vault_archive|session logs|archives?|exports?|tests?|dev(?:elopment)?|backups?|recovery|recoveries|troubleshooting|scratch)(?:[\\/]|$)|(?:^|[_ .-])(?:backup|bak|recovery|recovered|archive|export|test|troubleshooting|scratch|debug|builder)(?:[_ .-]|$)/i;
    const matches = [];

    function scan(folder) {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const relativePath = path.relative(VAULT_PATH, path.join(folder, entry.name));
                if (!excludedArtifacts.test(relativePath)) scan(path.join(folder, entry.name));
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const filePath = path.join(folder, entry.name);
                const masterPath = path.join(VAULT_PATH, 'Session Logs', 'Master_Note.md');
                const relativePath = path.relative(VAULT_PATH, filePath);

                if (path.normalize(filePath).toLowerCase() === path.normalize(masterPath).toLowerCase() || excludedArtifacts.test(relativePath)) {
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
const CALENDAR_PROPOSAL_MONTHS = Object.keys(CALENDAR_MONTHS).flatMap((month) => [month, month.slice(0, 3)]).join('|');

function parseCalendarCreateRequest(request) {
    const text = String(request || '').trim();
    if (/\badd\b[\s\S]*\bactive priorities\b/i.test(text)) return null;
    const intent = text.match(/^(?:please\s+)?(?:schedule|create|book|add|set up)\s+(.+)$/i);
    if (!intent || !/(?:calendar|event|meeting|appointment|call|reminder|schedule|book)/i.test(text)) return null;

    const body = intent[1].trim();
    const dateMatch = body.match(/(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[,\s-]+)?(?:(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})|(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4}))/i);
    const isoDateMatch = body.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    const weekdayOnly = body.match(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    const date = dateMatch
        ? `${dateMatch[3] || dateMatch[6]}-${String(CALENDAR_MONTHS[(dateMatch[2] || dateMatch[4]).toLowerCase()] + 1).padStart(2, '0')}-${String(Number(dateMatch[1] || dateMatch[5])).padStart(2, '0')}`
        : isoDateMatch ? `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}` : null;
    const timeMatch = body.match(/\b(\d{1,2})(?::(\d{2}))?\s*(A\.?M\.?|P\.?M\.?)\b/i) || body.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    let startTime = null;
    if (timeMatch) {
        const hour = Number(timeMatch[1]);
        const minute = Number(timeMatch[2] || 0);
        const meridiem = timeMatch[3]?.toUpperCase().replace(/\./g, '');
        if (meridiem && (hour < 1 || hour > 12)) return { error: 'The event time is invalid.' };
        const normalizedHour = meridiem === 'AM' ? hour % 12 : meridiem === 'PM' ? (hour % 12) + 12 : hour;
        startTime = `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
    const dateStart = dateMatch?.index ?? isoDateMatch?.index;
    const titleEnd = dateStart === undefined ? body.search(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/i) : dateStart;
    const durationMatch = body.match(/\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i);
    const title = body.slice(0, titleEnd < 0 ? body.length : titleEnd)
        .replace(/\s+for\s*$/i, '')
        .replace(/\s+on\s*$/i, '')
        .replace(/[Ã¢â‚¬â€Ã¢â‚¬â€œ-]+\s*$/, '')
        .trim();
    const durationMinutes = durationMatch ? Number(durationMatch[1]) * (/hour|hr/i.test(durationMatch[2]) ? 60 : 1) : 60;
    const locationMatch = body.match(/\bat\s+(?!\d)([^,.;]+?)(?=\s+(?:for|about|described as)\b|\s+on\s+(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\d{1,2}\b|(?:january|february|march|april|may|june|july|august|september|october|november|december)\b)|[,.;]|$)/i);
    const descriptionMatch = body.match(/\b(?:about|described as)\s+(.+)$/i);
    if (!title) return { error: 'I need an event title.' };
    if (!date || weekdayOnly && !date) return { error: 'I need an unambiguous calendar date, including day, month, and year.' };
    if (!startTime) return { error: 'I need an unambiguous start time.' };
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return { error: 'The event duration is invalid.' };
    return { title, date, startTime, durationMinutes, location: locationMatch?.[1]?.trim() || null, description: descriptionMatch?.[1]?.trim() || null };
}

function parseCalendarReadRequest(request) {
    const text = String(request || '').trim();
    const command = text.toLowerCase();
    if (!/(?:calendar|agenda|schedule)/i.test(command)) return null;
    const positiveIntent = command.replace(/\b(?:do not|don't|dont)\b[^.!?]*/gi, '');
    if (/\b(?:create|book|add|delete|remove|modify|change|update)\b/i.test(positiveIntent) || /\bschedule\s+(?:(?:a|an|the|three)\s+)?(?:event|meeting|appointment)\b/i.test(positiveIntent)) return null;
    if (!/\b(?:check|look|show|read|view|inspect|what)\b/i.test(command)) return null;

    const months = 'january|february|march|april|may|june|july|august|september|october|november|december';
    const monthNumbers = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
    let startDate = null;
    let endDate = null;
    const isoRange = command.match(/\b(\d{4}-\d{2}-\d{2})\s+(?:through|thru|to|until)\s+(\d{4}-\d{2}-\d{2})\b/i);
    const monthFirstRange = command.match(new RegExp('\\b(' + months + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(?:through|thru|to|until)\\s+|\\s*[-\\u2013]\\s*)(?:(' + months + ')\\s+)?(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b', 'i'));
    const dayFirstRange = command.match(new RegExp('\\b(\\d{1,2})\\s+(' + months + ')(?:\\s+(?:through|thru|to|until)\\s+|\\s*[-\\u2013]\\s*)(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + months + ')?,?\\s*(\\d{4})\\b', 'i'));
    const monthFirstSingle = command.match(new RegExp('\\b(' + months + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(\\d{4})\\b', 'i'));
    const dayFirstSingle = command.match(new RegExp('\\b(\\d{1,2})\\s+(' + months + ')\\s+(\\d{4})\\b', 'i'));
    const validDate = (year, month, day) => {
        const value = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        return value.getUTCFullYear() === Number(year) && value.getUTCMonth() === Number(month) - 1 && value.getUTCDate() === Number(day);
    };
    if (isoRange) {
        startDate = isoRange[1];
        endDate = isoRange[2];
    } else if (monthFirstRange) {
        const year = Number(monthFirstRange[5]);
        const firstMonth = monthNumbers[monthFirstRange[1].toLowerCase()];
        const lastMonth = monthNumbers[(monthFirstRange[3] || monthFirstRange[1]).toLowerCase()];
        startDate = year + '-' + firstMonth + '-' + String(Number(monthFirstRange[2])).padStart(2, '0');
        endDate = year + '-' + lastMonth + '-' + String(Number(monthFirstRange[4])).padStart(2, '0');
    } else if (dayFirstRange) {
        const year = Number(dayFirstRange[5]);
        const firstMonth = monthNumbers[dayFirstRange[2].toLowerCase()];
        const lastMonth = monthNumbers[(dayFirstRange[4] || dayFirstRange[2]).toLowerCase()];
        startDate = year + '-' + firstMonth + '-' + String(Number(dayFirstRange[1])).padStart(2, '0');
        endDate = year + '-' + lastMonth + '-' + String(Number(dayFirstRange[3])).padStart(2, '0');
    } else if (monthFirstSingle) {
        const year = Number(monthFirstSingle[3]);
        startDate = year + '-' + monthNumbers[monthFirstSingle[1].toLowerCase()] + '-' + String(Number(monthFirstSingle[2])).padStart(2, '0');
        endDate = startDate;
    } else if (dayFirstSingle) {
        const year = Number(dayFirstSingle[3]);
        startDate = year + '-' + monthNumbers[dayFirstSingle[2].toLowerCase()] + '-' + String(Number(dayFirstSingle[1])).padStart(2, '0');
        endDate = startDate;
    } else {
        const isoSingle = command.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (!isoSingle) return null;
        startDate = isoSingle[1];
        endDate = startDate;
    }
    const [startYear, startMonth, startDay] = startDate.split('-');
    const [endYear, endMonth, endDay] = endDate.split('-');
    if (!validDate(startYear, startMonth, startDay) || !validDate(endYear, endMonth, endDay) || startDate > endDate) return null;
    const rangeDays = (Date.parse(endDate + 'T00:00:00Z') - Date.parse(startDate + 'T00:00:00Z')) / 86400000 + 1;
    if (rangeDays > 31) return { startDate, endDate, error: 'Calendar reads are limited to a 31-day range.' };
    const durationMatch = command.match(/\b(\d{1,3})\s*[- ]?\s*(?:minutes?|mins?)\b/i);
    return {
        startDate,
        endDate,
        durationMinutes: durationMatch ? Number(durationMatch[1]) : null,
        availabilityRequested: /\b(?:open|available|free|window|windows|slot|slots)\b/i.test(command)
    };
}

function addCalendarDays(dateString, days) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function calendarLocalDate(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const part = (type) => parts.find((item) => item.type === type).value;
    return part('year') + '-' + part('month') + '-' + part('day');
}

function formatCalendarEvent(event) {
    const summary = String(event.summary || 'Untitled event');
    if (event.start?.date) return '- ' + event.start.date + ' (all day): ' + summary;
    if (!event.start?.dateTime) return '- Time unavailable: ' + summary;
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const start = formatter.format(new Date(event.start.dateTime));
    const end = event.end?.dateTime ? formatter.format(new Date(event.end.dateTime)) : 'end time unavailable';
    return '- ' + start + ' to ' + end + ': ' + summary;
}

function calendarLocalTime(value) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(value));
    const part = (type) => parts.find((item) => item.type === type).value;
    return part('hour') + ':' + part('minute');
}
function calculateAvailableCalendarWindows(events, startDate, endDate, durationMinutes) {
    const windows = [];
    for (let date = startDate; date <= endDate; date = addCalendarDays(date, 1)) {
        const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        const workStart = new Date(date + 'T09:00:00+03:00').getTime();
        const workEnd = new Date(date + 'T17:00:00+03:00').getTime();
        const busy = [];
        for (const event of events) {
            if (event.status === 'cancelled' || event.transparency === 'transparent') continue;
            let eventStart;
            let eventEnd;
            if (event.start?.date) {
                const allDayEnd = event.end?.date || addCalendarDays(event.start.date, 1);
                if (!(event.start.date <= date && allDayEnd > date)) continue;
                eventStart = workStart;
                eventEnd = workEnd;
            } else if (event.start?.dateTime && event.end?.dateTime) {
                eventStart = new Date(event.start.dateTime).getTime();
                eventEnd = new Date(event.end.dateTime).getTime();
                if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) { busy.push([workStart, workEnd]); continue; }
                if (!(eventStart < workEnd && eventEnd > workStart)) continue;
            } else {
                if (event.start?.dateTime && !Number.isFinite(Date.parse(event.start.dateTime))) { busy.push([workStart, workEnd]); continue; }
                busy.push([workStart, workEnd]);
                continue;
            }
            busy.push([Math.max(workStart, eventStart), Math.min(workEnd, eventEnd)]);
        }
        busy.sort((left, right) => left[0] - right[0]);
        let cursor = workStart;
        for (const [busyStart, busyEnd] of busy) {
            if (busyStart > cursor && busyStart - cursor >= durationMinutes * 60000) {
                windows.push({ date, start: calendarLocalTime(cursor), end: calendarLocalTime(busyStart) });
            }
            cursor = Math.max(cursor, busyEnd);
        }
        if (workEnd > cursor && workEnd - cursor >= durationMinutes * 60000) {
            windows.push({ date, start: calendarLocalTime(cursor), end: '17:00' });
        }
    }
    return windows;
}

async function readGoogleCalendarRange(request, requestImplementation = https.request) {
    const parsed = parseCalendarReadRequest(request);
    if (!parsed) return { ok: false, reason: 'I could not identify a calendar date or date range to read.' };
    if (parsed.error) return { ok: false, reason: parsed.error };
    let authentication;
    try { authentication = await getGoogleCalendarAccessToken(requestImplementation); }
    catch (error) { return { ok: false, reason: 'Google Calendar authentication failed: ' + error.message }; }
    if (!authentication.accessToken) return { ok: false, reason: authentication.error || 'Google Calendar is not configured or authenticated.' };
    const timeMaxDate = addCalendarDays(parsed.endDate, 1);
    const events = [];
    let pageToken = null;
    try {
        do {
            const parameters = new URLSearchParams({
                singleEvents: 'true',
                orderBy: 'startTime',
                maxResults: '2500',
                timeMin: parsed.startDate + 'T00:00:00+03:00',
                timeMax: timeMaxDate + 'T00:00:00+03:00',
                timeZone: 'Africa/Nairobi'
            });
            if (pageToken) parameters.set('pageToken', pageToken);
            const response = await requestJson({
                hostname: 'www.googleapis.com',
                path: '/calendar/v3/calendars/primary/events?' + parameters.toString(),
                method: 'GET',
                headers: { Authorization: 'Bearer ' + authentication.accessToken }
            }, null, requestImplementation);
            events.push(...(response.items || []));
            pageToken = response.nextPageToken || null;
        } while (pageToken);
    } catch (error) {
        return { ok: false, reason: 'Google Calendar read failed: ' + error.message };
    }
    const eventLines = events.length ? events.map(formatCalendarEvent).join('\n') : 'No events were returned for this date range.';
    const durationMinutes = parsed.durationMinutes || 30;
    const windows = parsed.availabilityRequested
        ? calculateAvailableCalendarWindows(events, parsed.startDate, parsed.endDate, durationMinutes)
        : [];
    const availability = parsed.availabilityRequested
        ? '\n\nAvailable windows (weekdays 09:00-17:00 Africa/Nairobi; ' + durationMinutes + '-minute minimum):\n'
            + (windows.length ? windows.map((window) => '- ' + window.date + ' ' + window.start + '-' + window.end).join('\n') : 'No qualifying free windows found.')
            + '\nAssumption: sensible working-day availability means Monday-Friday, 09:00-17:00 Africa/Nairobi.'
        : '';
    return {
        ok: true,
        parsed,
        events,
        windows,
        reply: 'Google Calendar events from ' + parsed.startDate + ' through ' + parsed.endDate + ' (Africa/Nairobi):\n'
            + eventLines + availability
    };
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

async function createGoogleCalendarEvent(request, requestImplementation = https.request, requestText = request) {
    const parsed = request && typeof request === 'object' ? request : parseCalendarCreateRequest(request);
    if (!parsed) return { ok: false, deterministic: true, reason: 'I could not identify a calendar event request.' };
    if (parsed.error) return { ok: false, deterministic: true, reason: parsed.error };
    if (!parsed.title || !parsed.date || !parsed.startTime || !Number.isInteger(parsed.durationMinutes) || parsed.durationMinutes <= 0) {
        return { ok: false, deterministic: true, reason: 'The calendar event requires a title, date, start time, and positive duration.' };
    }
    let authentication;
    try { authentication = await getGoogleCalendarAccessToken(requestImplementation); }
    catch (error) { return { ok: false, configured: true, reason: 'Google Calendar authentication failed: ' + error.message, parsed }; }
    const accessToken = authentication.accessToken;
    if (!accessToken) return { ok: false, configured: false, reason: authentication.error || 'Google Calendar is not configured or authenticated.', parsed };
    const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || 'Africa/Nairobi';
    const event = {
        summary: parsed.title,
        start: { dateTime: parsed.date + 'T' + parsed.startTime + ':00', timeZone: timezone },
        end: { dateTime: addMinutesToCalendarTime(parsed.date, parsed.startTime, parsed.durationMinutes), timeZone: timezone }
    };
    if (parsed.location) event.location = parsed.location;
    if (parsed.description) event.description = parsed.description;
    const reminderRequest = calendarReminderOverrides(parsed, requestText);
    if (reminderRequest.error) return { ok: false, deterministic: true, reason: reminderRequest.error, parsed };
    if (reminderRequest.requested) event.reminders = { useDefault: false, overrides: reminderRequest.overrides };
    const body = JSON.stringify(event);
    try {
        const response = await requestJson({
            hostname: 'www.googleapis.com',
            path: '/calendar/v3/calendars/primary/events',
            method: 'POST',
            headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, body, requestImplementation);
        if (!response.id) return { ok: false, configured: true, reason: 'Google Calendar returned no event ID; creation is unconfirmed.', parsed };
        const remindersVerified = reminderRequest.requested && response.reminders?.useDefault === false
            && reminderRequest.overrides.every((expected) => response.reminders.overrides?.some((actual) => actual.method === expected.method && actual.minutes === expected.minutes));
        const actualEvent = {
            title: response.summary || parsed.title,
            startDateTime: response.start?.dateTime || null,
            endDateTime: response.end?.dateTime || null
        };
        return { ok: true, eventId: response.id, response, parsed, actualEvent, remindersRequested: reminderRequest.requested, remindersVerified };
    } catch (error) {
        return { ok: false, configured: true, reason: 'Google Calendar event creation failed: ' + error.message, parsed };
    }
}


function isStateUpdateAdviceQuestion(request) {
    const text = String(request || '').trim();
    const mutation = text.match(/\b(?:change|set|update|replace)\b[\s\S]*?\b(?:primary objective|current state|project state)\b/i);
    if (!mutation) return false;
    const prefix = text.slice(0, mutation.index);
    return /\b(?:should|shall|can|could|may|whether|recommend|advisable|better|wise|worth)\b/i.test(prefix);
}

function classifyRequestedAction(action) {
    const text = String(action || '').trim();
    const lower = text.toLowerCase();
    if (/(come back|when you(?:'|Ã¢â‚¬â„¢)re finished|in the background|later|async)/i.test(lower)) return 'BACKGROUND_TASK';
    if (isStateUpdateAdviceQuestion(text)) return 'CLARIFICATION_REQUIRED';
    if (/^(?:please\s+)?(?:update|change|set)\s+(?:the\s+)?current focus\b/i.test(text)) return 'CURRENT_FOCUS_UPDATE';
    if (parseActionItemAddRequest(text)) return 'ACTION_ITEM_ADD';
    if (parseActionItemCompleteRequest(text)) return 'ACTION_ITEM_COMPLETE';
    if (parseCalendarCreateRequest(text)) return 'CALENDAR_CREATE';
    if (parseCalendarReadRequest(text)) return 'CALENDAR_READ';
    if (/\b(?:change|set|update|replace)\s+(?:my\s+)?primary objective\s+to\b/i.test(text)) return 'PRIMARY_OBJECTIVE_UPDATE';
    if (/(update|change|set|replace|mark)\b[\s\S]*(current state|project state)\b/i.test(lower) && /(project|for)\b/i.test(lower)) return 'PROJECT_STATE_UPDATE';
    if (/(edit|remove|delete|add|update|change|mark)\b[\s\S]*(dashboard|vault|note|file|master dashboard)/i.test(lower)) return 'VAULT_EDIT';
    if (/(implement|change the code|fix the code|add a feature|modify the runtime|write code)/i.test(lower)) return 'CODE_CHANGE';
    if (/(researcher clarifications?|supporting market research|researcher assumption)/i.test(lower) && /(interview|customer|perfume|spray|splash|pricing|validation)/i.test(lower)) return 'ANSWER_NOW';
    if (/(read|show|reproduce|retrieve|display|quote)/i.test(lower) && /(validation_framework\.md|validation framework|local file|local section|section titled|section called|open unknowns?)/i.test(lower)) return 'LOCAL_READ';
    if (/(read|show|reproduce|retrieve|display|quote)/i.test(lower) && (/(validation_framework\.md|validation framework|local file|local section|section titled|section called|open unknowns?)/i.test(lower) || /\b[a-z0-9_ -]+\.md\b/i.test(lower))) return 'LOCAL_READ';
    if (/(research|investigate|look up|find out|competitor|competitors|web search)/i.test(lower)) return 'EXTERNAL_RESEARCH';
    if (/\b(adjust|modify|change|fix|alter)\b/i.test(lower) && !/\b(?:do\s+not|don't|dont)\s+(?:adjust|modify|change|fix|alter)\b/i.test(lower)) return 'CLARIFICATION_REQUIRED';
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
        const heading = headingMatch[1].trim().replace(/^['\"”]|['\"”]$/g, '');
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
    const headingMatch = text.match(/section\s+(?:titled|called)\s+["“”]?(.+?)["“”]?\s+(?:from|in)\s+/i) || text.match(/(?:read|show|display|retrieve)\s+(?:the\s+)?(.+?)\s+section\s+(?:from|in)\s+/i) || text.match(/(?:read|show|display|retrieve)\s+(?:the\s+)?(open\s+and\s+non-section)\s+(?:from|in)\s+/i);
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
    const actions = classifyRequestedActions(transcript);
    if (isAuthoritativeInterviewAnalysisRequest(transcript) && !actions.some(({ capability }) => capability === 'ANSWER_NOW')) {
        actions.unshift({ action: String(transcript || '').trim(), capability: 'ANSWER_NOW' });
    }
    const clarifications = actions
        .filter(({ capability }) => capability === 'CLARIFICATION_REQUIRED')
        .map(({ action }) => action);
    const unsupported = actions.filter(({ capability }) =>
        capability !== 'ANSWER_NOW' && capability !== 'CLARIFICATION_REQUIRED' && capability !== 'LOCAL_READ' && capability !== 'PROJECT_STATE_UPDATE' && capability !== 'PRIMARY_OBJECTIVE_UPDATE' && capability !== 'CURRENT_FOCUS_UPDATE' && capability !== 'ACTION_ITEM_ADD' && capability !== 'ACTION_ITEM_COMPLETE' && capability !== 'CALENDAR_READ'
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

    const isProjectStateOperation = Boolean(response?.projectStateUpdate);
    const isIdeaLike = !isProjectStateOperation && /(idea|hypothesis|maybe|could|should|pilot|launch|project|concept|opportunity)/i.test(lower);
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
    const explicitHistory = retrieveRelevantInteractionHistory(transcript);
    const sourceContract = [
        '## Runtime source-of-truth and context precedence',
        'Current Focus is authoritative in 00_Command_Center/Now.md; Primary Objective is authoritative in 00_Command_Center/Life_Dashboard.md; open/completed action items are authoritative in 00_Command_Center/Master_Dashboard.md; supported project current state is authoritative in that project\u2019s _Project_Context.md.',
        'Master_Dashboard.md is authoritative for action items and command-center navigation only; it does not override a project\u2019s _Project_Context.md for project state.',
        'Topic-specific retrieved Markdown, structured memory, and conversation/history are supporting material. They may be stale or incomplete and must not override the authoritative state sources above. If they conflict, use the authoritative state and identify the conflict rather than merging the claims.',
        'A fresh actual Google Calendar API read is authoritative for live calendar availability; Calendar.md and historical claims are supporting context and cannot override that read.'
    ];
    const projectStatePath = path.join(VAULT_PATH, '03_Active_Engine', 'Perfume Vending Validation', '_Project_Context.md');
    const includeProjectState = mode === 'PROJECT_STATUS' || /perfume vending|validation project|project state/i.test(String(transcript || ''));
    const authoritativeProjectState = includeProjectState
        ? ['## Perfume Vending Validation current state (authoritative _Project_Context.md)', readFileTail(projectStatePath, 3000)]
        : [];
    const assemble = (...sections) => [...sourceContract, ...authoritativeProjectState, ...sections].join('\n\n');

    switch (mode) {
        case 'DAILY_BRIEFING':
            return assemble(
                '## Current focus (authoritative)',
                readFileTail(path.join(VAULT_PATH, '00_Command_Center', 'Now.md'), 1800),
                '## Primary Objective (authoritative)',
                readFileTail(path.join(VAULT_PATH, '00_Command_Center', 'Life_Dashboard.md'), 2200),
                '## Calendar',
                readFileTail(CALENDAR_PATH, 4000),
                '## Health log (recent)',
                readFileTail(EXERCISE_PATH, 1800),
                '## Current action-item dashboard (authoritative)',
                briefingActionDashboard(transcript),
                '## Structured memory (current supporting facts and lessons only; not task ownership)',
                summarizeMemoryStore({ currentBriefingOnly: true }),
                ...(explicitHistory ? ['## Requested conversation history (supporting context; not current priority)', explicitHistory] : []),
                '## Topic-specific retrieved material (supporting context; not authoritative state)',
                topicMaterial
            );

        case 'HEALTH_STATUS':
            return assemble(
                '## Health log (recent)',
                readFileTail(EXERCISE_PATH, 3000),
                '## Relevant retrieved health material (supporting context; not authoritative state)',
                topicMaterial
            );

        case 'PROJECT_STATUS':
            return assemble(
                '## Current action items from Master_Dashboard.md (authoritative for action items only)',
                readFileTail(MASTER_DASHBOARD_PATH, 4000),
                '## AI Ideas inbox (hypotheses only, not the active project list)',
                readFileTail(AI_IDEAS_PATH, 4000),
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Topic-specific retrieved project material (supporting context; not authoritative state)',
                topicMaterial
            );

        case 'CONTENT':
            return assemble(
                '## Current action items from Master_Dashboard.md (authoritative for action items only)',
                readFileTail(MASTER_DASHBOARD_PATH, 3000),
                '## AI Ideas inbox (hypotheses only, not the active project list)',
                readFileTail(AI_IDEAS_PATH, 4000),
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Relevant retrieved material (supporting context; not authoritative state)',
                topicMaterial
            );

        case 'SYSTEM_STATUS':
            return assemble(
                '## Structured memory (facts, hypotheses, lessons, experiences, project validations)',
                summarizeMemoryStore(),
                '## Relevant retrieved system material (supporting context; not authoritative state)',
                topicMaterial
            );

        default:
            return assemble(
                ...(explicitHistory ? ['## Requested conversation history (supporting context; not current priority)', explicitHistory] : []),
                '## Topic-specific retrieved material (supporting context; not authoritative state)',
                topicMaterial,
                '## Current action items from Master_Dashboard.md (authoritative for action items only)',
                readFileTail(MASTER_DASHBOARD_PATH, 3000)
            );
    }
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
        .replace(/Ã°Å¸â€œâ€¦|Ã°Å¸ÂÆ’|Ã°Å¸â€”â€šÃ¯Â¸Â|Ã°Å¸Å½Â¯|Ã¢Å“â€¦|Ã¢Å¡Â Ã¯Â¸Â|Ã°Å¸Å¡Â¨|Ã°Å¸â€œÅ’|Ã°Å¸â€™Â¡|Ã°Å¸Å’Â¿|Ã°Å¸â€Â|Ã°Å¸â€œË†/gu, ' ')
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
    const pendingCalendarPlan = getPendingCalendarPlan();
    const isCalendarPlanExecutionRequest = isAffirmativeCalendarPlanExecution(transcript);
    const hasUsableCalendarPlan = pendingCalendarPlan && pendingCalendarPlan.events.length > 0
        && pendingCalendarPlan.events.every((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date)
            && /^\d{2}:\d{2}$/.test(event.startTime)
            && Number.isFinite(event.durationMinutes) && event.durationMinutes > 0);
    if (isCalendarPlanExecutionRequest && !hasUsableCalendarPlan) {
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: 'I do not have a pending proposed calendar schedule to execute. Please ask me to propose the schedule again.',
            targetTrack: 'Calendar',
            operationalMode: 'No Pending Calendar Plan',
            systemHealthScore: '100%'
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log('[Apogee Reply]: ' + result.reply);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    if (hasUsableCalendarPlan && isCalendarPlanExecutionRequest) {
        const store = readMemoryStore();
        store.pending_calendar_plan = { ...pendingCalendarPlan, status: 'EXECUTING' };
        fs.writeFileSync(MEMORY_PATH, JSON.stringify(store, null, 2), 'utf8');
        const override = String(transcript || '').match(/\b(?:exactly\s+)?(\d+)\s*(?:minutes?|mins?)\b/i);
        const remindersRequested = hasCalendarReminderRequest(transcript);
        const events = pendingCalendarPlan.events.map((event) => ({
            ...event,
            durationMinutes: override ? Number(override[1]) : event.durationMinutes,
            remindersRequested: Boolean(event.remindersRequested || remindersRequested)
        }));
        const attempts = await executeCalendarEventBatch(events, transcript);
        clearPendingCalendarPlan();
        const unavailable = attempts.some((item) => !item.result.ok && !item.result.configured);
        let reply = calendarEventBatchReply(attempts);
        if (unavailable) {
            const handoffs = createHandoffsForRequest(transcript, { actions: [{ action: transcript, capability: 'CALENDAR_CREATE' }] });
            reply += '\n\n' + buildTrackedHandoffResponse(handoffs);
        }
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply,
            targetTrack: 'Calendar',
            operationalMode: 'Google Calendar Batch Create',
            systemHealthScore: '100%',
            calendarEvents: attempts.map((item) => ({ parsed: item.event, ok: item.result.ok, eventId: item.result.eventId || null, reason: item.result.reason || null, remindersVerified: Boolean(item.result.remindersVerified) }))
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log('[Apogee Reply]: "' + result.reply + '"');
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    if (pendingCalendarPlan) clearPendingCalendarPlan();
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
    const stateAdviceQuestion = capabilityPreflight.actions.find(({ action, capability }) =>
        capability === 'CLARIFICATION_REQUIRED' && isStateUpdateAdviceQuestion(action)
    );
    if (stateAdviceQuestion) {
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: 'I have not changed the Primary Objective or Project State. Your wording asks whether to make a change; please confirm if you want the update itself.',
            targetTrack: 'Life / Project State',
            operationalMode: 'State Update Clarification',
            systemHealthScore: '100%'
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const calendarReadAction = capabilityPreflight.actions.find(({ capability }) => capability === 'CALENDAR_READ');
    if (calendarReadAction && !capabilityPreflight.answerNowTranscript) {
        const calendarRead = await readGoogleCalendarRange(calendarReadAction.action);
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: calendarRead.ok ? calendarRead.reply : 'Google Calendar read failed: ' + calendarRead.reason,
            targetTrack: 'Calendar',
            operationalMode: calendarRead.ok ? 'Google Calendar Read' : 'Calendar Read Failure',
            systemHealthScore: '100%',
            calendarRead
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log('[Apogee Reply]: "' + result.reply + '"');
        speakLocally(result.reply);
        promptUser();
        return result;
    }
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

    const currentFocusAction = capabilityPreflight.actions.find(({ capability }) => capability === 'CURRENT_FOCUS_UPDATE');
    if (currentFocusAction) {
        const parsedFocus = parseCurrentFocusUpdateRequest(currentFocusAction.action);
        const focusUpdate = parsedFocus
            ? updateCurrentFocus(parsedFocus.focus)
            : { ok: false, reason: 'I could not identify a nonempty, single-line current focus.' };
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: focusUpdate.ok && focusUpdate.verified
                ? 'Current focus updated and verified.'
                : `Current focus update failed: ${focusUpdate.reason}`,
            targetTrack: 'Life / CEO State',
            operationalMode: 'Deterministic Current Focus Update',
            systemHealthScore: '100%',
            currentFocusUpdate: focusUpdate
        };
        currentDashboardData = result;
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const actionItemAction = capabilityPreflight.actions.find(({ capability }) => capability === 'ACTION_ITEM_ADD' || capability === 'ACTION_ITEM_COMPLETE');
    if (actionItemAction) {
        const parsedActionItem = actionItemAction.capability === 'ACTION_ITEM_ADD'
            ? parseActionItemAddRequest(actionItemAction.action)
            : parseActionItemCompleteRequest(actionItemAction.action);
        const actionItemResult = parsedActionItem
            ? actionItemAction.capability === 'ACTION_ITEM_ADD'
                ? addActionItem(parsedActionItem.actionText)
                : completeActionItem(parsedActionItem.matchText)
            : { ok: false, reason: 'I could not identify the action item.' };
        const reply = actionItemResult.ok
            ? actionItemAction.capability === 'ACTION_ITEM_ADD'
                ? actionItemResult.alreadyOpen ? 'That action item is already open.' : 'Action item added and verified.'
                : actionItemResult.alreadyComplete ? 'That action item is already complete.' : 'Action item marked complete and verified.'
            : actionItemResult.clarificationRequired
                ? `More than one action item matches. ${actionItemResult.reason}`
                : `Action item update failed: ${actionItemResult.reason}`;
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply,
            targetTrack: 'Active Priorities',
            operationalMode: 'Deterministic Action Item Update',
            systemHealthScore: '100%',
            actionItem: { capability: actionItemAction.capability, ...actionItemResult }
        };
        currentDashboardData = result;
        recordStructuredMemory(transcript, result);
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const primaryObjectiveAction = capabilityPreflight.actions.find(({ capability }) => capability === 'PRIMARY_OBJECTIVE_UPDATE');
    if (primaryObjectiveAction) {
        const parsedObjective = parsePrimaryObjectiveUpdateRequest(primaryObjectiveAction.action);
        const objectiveUpdate = parsedObjective
            ? updatePrimaryObjective(parsedObjective.newObjective)
            : { ok: false, reason: 'I could not identify the new primary objective.' };
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: objectiveUpdate.ok
                ? 'Primary objective updated and verified.'
                : `Primary objective update failed: ${objectiveUpdate.reason}`,
            targetTrack: 'Life / CEO State',
            operationalMode: 'Deterministic Primary Objective Update',
            systemHealthScore: '100%',
            primaryObjectiveUpdate: objectiveUpdate
        };
        currentDashboardData = result;
        recordStructuredMemory(transcript, result);
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
    }
    const projectStateUpdateAction = capabilityPreflight.actions.find(({ capability }) => capability === 'PROJECT_STATE_UPDATE');
    if (projectStateUpdateAction) {
        const parsedProjectState = parseProjectStateUpdateRequest(projectStateUpdateAction.action);
        const projectStateUpdate = parsedProjectState
            ? updateProjectCurrentState(parsedProjectState.projectName, parsedProjectState.newState)
            : { ok: false, reason: 'I could not identify the project and new current state.' };
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply: projectStateUpdate.ok
                ? `Project state updated. I verified the written state for ${projectStateUpdate.projectName}.`
                : `Project state update failed: ${projectStateUpdate.reason}`,
            targetTrack: 'Project State',
            operationalMode: 'Deterministic Project State Update',
            systemHealthScore: '100%',
            projectStateUpdate
        };
        currentDashboardData = result;
        recordStructuredMemory(transcript, result);
        saveInteraction(transcript, result);
        console.log(`[Apogee Reply]: "${result.reply}"`);
        speakLocally(result.reply);
        promptUser();
        return result;
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
    const calendarActions = capabilityPreflight.actions.filter(({ capability }) => capability === 'CALENDAR_CREATE');
    if (calendarActions.length) {
        const attempts = await executeCalendarEventBatch(calendarActions.map(({ action }) => action), transcript);
        const unavailable = attempts.some((item) => !item.result.ok && !item.result.configured);
        let reply = calendarEventBatchReply(attempts);
        if (unavailable) {
            const handoffs = createHandoffsForRequest(transcript, { actions: calendarActions });
            reply += '\n\n' + buildTrackedHandoffResponse(handoffs);
        }
        const result = {
            query: transcript,
            timestamp: new Date().toISOString(),
            reply,
            targetTrack: 'Calendar',
            operationalMode: 'Google Calendar Batch Create',
            systemHealthScore: '100%',
            calendarEvents: attempts.map((item) => ({ parsed: item.event, ok: item.result.ok, eventId: item.result.eventId || null, reason: item.result.reason || null, remindersVerified: Boolean(item.result.remindersVerified) }))
        };
        currentDashboardData = result;
        recordStructuredMemory(transcript, result);
        saveInteraction(transcript, result);
        console.log('[Apogee Reply]: "' + result.reply + '"');
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
    const answerCalendarReadAction = capabilityPreflight.actions.find(({ capability }) => capability === 'CALENDAR_READ');
    let answerCalendarRead = null;
    if (answerCalendarReadAction) {
        answerCalendarRead = await readGoogleCalendarRange(answerCalendarReadAction.action);
        vaultContext += answerCalendarRead.ok
            ? "\n\n## Actual Google Calendar Read\n" + answerCalendarRead.reply
            : "\n\n## Google Calendar Read Failure\n" + answerCalendarRead.reason;
    }
    let result;
    const calculatorResponse = deterministicCalculatorResponse(answerTranscript);
    const isCalendarReadRequest = /(?:today|tomorrow)/i.test(answerTranscript) && /(?:calendar|schedule|agenda)/i.test(answerTranscript);
    const deterministicResponse = isCalendarReadRequest ? deterministicLocalResponse(answerTranscript) : null;
    if (deterministicResponse) {
        result = normalizeResult(answerTranscript, JSON.stringify(deterministicResponse), 'Deterministic Local Read');
    } else if (calculatorResponse) {
        result = normalizeResult(answerTranscript, JSON.stringify(calculatorResponse), 'Deterministic Calculator');
    } else try {
        providerCallCounts.claude++;
        const completion = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
            max_tokens: 4000,
            output_config: { effort: 'low' },
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
    if (!capabilityPreflight.handoffs.length && !capabilityPreflight.clarifications.length && !/fallback|failed/i.test(String(result.operationalMode || ''))) {
        maybePersistProposedCalendarPlan(answerTranscript, result.reply);
    }
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

function parseCurrentFocusUpdateRequest(request) {
    const match = String(request || '').trim().match(/^(?:please\s+)?(?:update|change|set)\s+(?:the\s+)?current focus\s+to\s+(.+?)\s*[.!]?\s*$/i);
    const focus = match?.[1]?.trim().replace(/[.!?]+$/, '').trim();
    if (!focus || /[\r\n]/.test(focus)) return null;
    return { focus };
}
function updateCurrentFocus(focus) {
    const requestedFocus = String(focus || '').trim();
    if (!requestedFocus) return { ok: false, reason: 'The new current focus is required.' };
    if (/[\r\n]/.test(requestedFocus)) return { ok: false, reason: 'Current focus must be a single line.' };
    const nowPath = path.join(VAULT_PATH, '00_Command_Center', 'Now.md');
    if (!fs.existsSync(nowPath)) return { ok: false, reason: 'The authoritative Now document does not exist.' };
    const content = fs.readFileSync(nowPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const headings = ['## Current focus', '## Next actions', '## Working notes'];
    const positions = headings.map((heading) => lines.reduce((found, line, index) => {
        if (line.trim() === heading) found.push(index);
        return found;
    }, []));
    if (positions.some((found) => found.length !== 1) || !(positions[0][0] < positions[1][0] && positions[1][0] < positions[2][0])) {
        return { ok: false, reason: 'Now.md does not contain the expected Current focus, Next actions, and Working notes structure.' };
    }
    const currentFocusPattern = /(^## Current focus[ \t]*\r?\n)([\s\S]*?)(?=^## Next actions[ \t]*$)/m;
    if (!currentFocusPattern.test(content)) return { ok: false, reason: 'Now.md does not contain a valid Current focus section.' };
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const updatedContent = content.replace(currentFocusPattern, (match, heading) => `${heading}- ${requestedFocus}${newline}${newline}`);
    fs.writeFileSync(nowPath, updatedContent, 'utf8');
    const verifiedContent = fs.readFileSync(nowPath, 'utf8');
    const verifiedLines = verifiedContent.split(/\r?\n/);
    const start = verifiedLines.indexOf('## Current focus');
    const end = verifiedLines.indexOf('## Next actions');
    const verified = start >= 0 && end > start && verifiedLines.slice(start + 1, end).filter((line) => line.trim()).join('\n') === `- ${requestedFocus}`;
    if (!verified) return { ok: false, reason: 'Current focus write could not be verified.' };
    return { ok: true, focus: requestedFocus, verified: true };
}
function parseActionItemAddRequest(request) {
    const match = String(request || '').trim().match(/^(?:please\s+)?add\s+(.+?)\s+to\s+(?:my\s+)?active priorities[.!]?\s*$/i);
    const actionText = match?.[1]?.trim().replace(/[.!?]+$/, '').trim();
    if (!actionText || /[\r\n]/.test(actionText)) return null;
    return { actionText };
}
function parseActionItemCompleteRequest(request) {
    const match = String(request || '').trim().match(/^(?:please\s+)?mark\s+(.+?)\s+as\s+(?:complete|completed|done)[.!]?\s*$/i);
    const matchText = match?.[1]?.trim().replace(/\s+action$/i, '').replace(/^the\s+/i, '').trim();
    if (!matchText || /[\r\n]/.test(matchText)) return null;
    return { matchText };
}
function normalizeActionItemText(text) {
    return String(text || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+#action\b.*$/i, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function readDashboardActionItems(content) {
    return String(content).split(/\r?\n/).flatMap((line, lineIndex) => {
        const checkbox = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);
        if (!checkbox || !/#action\b/i.test(line)) return [];
        const actionText = line.replace(/^\s*-\s+\[[ xX]\]\s+/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+#action\b.*$/i, '').trim();
        return actionText ? [{ line, lineIndex, open: checkbox[1] === ' ', actionText, normalized: normalizeActionItemText(actionText) }] : [];
    });
}
function getMasterDashboardPath() {
    return path.join(VAULT_PATH, '00_Command_Center', 'Master_Dashboard.md');
}
function addActionItem(actionText) {
    const action = String(actionText || '').trim();
    if (!action || /[\r\n]/.test(action)) return { ok: false, reason: 'The action text must be a nonempty single line.' };
    const dashboardPath = getMasterDashboardPath();
    if (!fs.existsSync(dashboardPath)) return { ok: false, reason: 'The authoritative action dashboard does not exist.' };
    const content = fs.readFileSync(dashboardPath, 'utf8');
    const items = readDashboardActionItems(content);
    const normalized = normalizeActionItemText(action);
    if (items.some((item) => item.open && item.normalized === normalized)) {
        return { ok: true, actionText: action, alreadyOpen: true, verified: true };
    }
    const section = content.match(/^## [^\r\n]*Active Focus[^\r\n]*Action Items[^\r\n]*(?:\r?\n|$)/im);
    if (!section) return { ok: false, reason: 'The Active Focus & Action Items section does not exist.' };
    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const line = `- [ ] ${action} #action${newline}`;
    const updated = content.replace(section[0], section[0] + line);
    fs.writeFileSync(dashboardPath, updated, 'utf8');
    const verifiedContent = fs.readFileSync(dashboardPath, 'utf8');
    const verifiedItems = readDashboardActionItems(verifiedContent);
    const verified = verifiedItems.filter((item) => item.open && item.normalized === normalized).length === 1;
    if (!verified) return { ok: false, reason: 'Action item write could not be verified.' };
    return { ok: true, actionText: action, added: true, verified: true };
}
function completeActionItem(matchText) {
    const query = String(matchText || '').trim().replace(/^the\s+/i, '');
    const normalizedQuery = normalizeActionItemText(query);
    if (!normalizedQuery || normalizedQuery.split(' ').length < 2) {
        return { ok: false, clarificationRequired: true, reason: 'Please provide at least two identifying words.' };
    }
    const dashboardPath = getMasterDashboardPath();
    if (!fs.existsSync(dashboardPath)) return { ok: false, reason: 'The authoritative action dashboard does not exist.' };
    const content = fs.readFileSync(dashboardPath, 'utf8');
    const items = readDashboardActionItems(content);
    const matches = items.filter((item) => item.normalized.includes(normalizedQuery));
    const openMatches = matches.filter((item) => item.open);
    if (openMatches.length > 1) {
        return { ok: false, clarificationRequired: true, reason: 'Please identify which matching open action you mean.' };
    }
    if (openMatches.length === 0) {
        const completedMatches = matches.filter((item) => !item.open);
        if (completedMatches.length === 1) {
            return { ok: true, alreadyComplete: true, actionText: completedMatches[0].actionText, verified: true };
        }
        if (completedMatches.length > 1) {
            return { ok: false, clarificationRequired: true, reason: 'Several completed actions match that description.' };
        }
        return { ok: false, reason: 'No matching open action was found.' };
    }
    const selected = openMatches[0];
    const updatedLine = selected.line.replace(/^(\s*-\s+)\[ \]/, '$1[x]');
    const lines = content.split(/\r?\n/);
    lines[selected.lineIndex] = updatedLine;
    fs.writeFileSync(dashboardPath, lines.join(content.includes('\r\n') ? '\r\n' : '\n'), 'utf8');
    const verifiedItems = readDashboardActionItems(fs.readFileSync(dashboardPath, 'utf8'));
    const verified = verifiedItems.filter((item) => !item.open && item.normalized === selected.normalized).length === 1;
    if (!verified) return { ok: false, reason: 'Action completion write could not be verified.' };
    return { ok: true, completed: true, actionText: selected.actionText, verified: true };
}
function parsePrimaryObjectiveUpdateRequest(request) {
    const text = String(request || '').trim();
    if (isStateUpdateAdviceQuestion(text)) return null;
    const match = text.match(/\b(?:change|set|update|replace)\s+(?:my\s+)?primary objective\s+to\s+(.+?)\s*$/i);
    const newObjective = match?.[1]?.trim().replace(/[.!?]+$/, '').trim();
    if (!newObjective || /[\r\n]/.test(newObjective)) return null;
    return { newObjective };
}
function updatePrimaryObjective(newObjective) {
    const objective = String(newObjective || '').trim();
    if (!objective) return { ok: false, reason: 'The new primary objective is required.' };
    if (/[\r\n]/.test(objective)) return { ok: false, reason: 'The primary objective must be a single line.' };
    const dashboardPath = path.join(VAULT_PATH, '00_Command_Center', 'Life_Dashboard.md');
    if (!fs.existsSync(dashboardPath)) return { ok: false, reason: 'The authoritative Life dashboard does not exist.' };
    const content = fs.readFileSync(dashboardPath, 'utf8');
    const objectiveLine = /^(-\s*)?\*\*Primary Objective:\*\*.*$/gm;
    const matches = [...content.matchAll(objectiveLine)];
    if (matches.length !== 1) return { ok: false, reason: 'The authoritative dashboard must contain exactly one Primary Objective field.' };
    const updatedContent = content.replace(objectiveLine, `- **Primary Objective:** ${objective}`);
    fs.writeFileSync(dashboardPath, updatedContent, 'utf8');
    const verifiedContent = fs.readFileSync(dashboardPath, 'utf8');
    const verifiedMatches = [...verifiedContent.matchAll(objectiveLine)];
    if (verifiedMatches.length !== 1 || verifiedMatches[0][0] !== `- **Primary Objective:** ${objective}`) {
        return { ok: false, reason: 'Primary objective write could not be verified.' };
    }
    return { ok: true, newObjective: objective, verified: true };
}
function parseProjectStateUpdateRequest(request) {
    const text = String(request || '').trim();
    if (isStateUpdateAdviceQuestion(text)) return null;

    let match = text.match(/update\s+the\s+current\s+state\s+for\s+(.+?)\s+to\s+(.+)\s*$/i);
    if (match) {
        const projectName = match[1].trim();
        const newState = match[2].trim();
        if (!projectName || !newState) return null;
        return { projectName, newState };
    }

    match = text.match(/update\s+the\s+(.+?)\s+project\s+state\s+to\s+(.+)\s*$/i);
    if (match) {
        const projectLabel = match[1].trim().toLowerCase();
        const projectName = projectLabel === 'perfume vending validation'
            ? 'Perfume Vending Machine'
            : match[1].trim();
        const newState = match[2].trim();
        if (!projectName || !newState) return null;
        return { projectName, newState };
    }

    return null;
}
function updateProjectCurrentState(projectName, newState) {
    const normalizedProject = String(projectName || '').trim().toLowerCase();
    const state = String(newState || '').trim();

    if (!normalizedProject) {
        return { ok: false, reason: 'The project name is required.' };
    }

    if (!state) {
        return { ok: false, reason: 'The new current state is required.' };
    }

    const projectMappings = {
        'perfume vending machine': path.join(
            VAULT_PATH,
            '03_Active_Engine',
            'Perfume Vending Validation',
            '_Project_Context.md'
        )
    };

    const projectPath = projectMappings[normalizedProject];
    if (!projectPath) {
        return { ok: false, reason: `Unknown project: ${projectName}.` };
    }

    if (!fs.existsSync(projectPath)) {
        return { ok: false, reason: `Authoritative project context file does not exist: ${projectPath}.` };
    }

    const content = fs.readFileSync(projectPath, 'utf8');
    const currentStatePattern = /(^## Current state\r?\n)([\s\S]*?)(?=^## Next actions\r?$)/m;

    if (!currentStatePattern.test(content)) {
        return { ok: false, reason: 'The authoritative project context does not contain a valid Current state section.' };
    }

    const updatedContent = content.replace(
        currentStatePattern,
        `$1- ${state}\n\n`
    );

    fs.writeFileSync(projectPath, updatedContent, 'utf8');

    const verifiedContent = fs.readFileSync(projectPath, 'utf8');
    const verifiedMatch = verifiedContent.match(currentStatePattern);

    if (!verifiedMatch || !verifiedMatch[2].includes(`- ${state}`)) {
        return { ok: false, reason: 'Project state write could not be verified.' };
    }

    return {
        ok: true,
        projectName,
        projectPath,
        state,
        verified: true
    };
}
module.exports = {
    splitAtomicActions,
    parseCalendarCreateRequest,
    parseCalendarProposalSlot,
    maybePersistProposedCalendarPlan,
    getPendingCalendarPlan,
    isAffirmativeCalendarPlanExecution,
    clearPendingCalendarPlan,
    parseCalendarReadRequest,
    readGoogleCalendarRange,
    calculateAvailableCalendarWindows,
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
    buildResponseContext,
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
    updateProjectCurrentState,
    parseCurrentFocusUpdateRequest,
    updateCurrentFocus,
    parseActionItemAddRequest,
    parseActionItemCompleteRequest,
    addActionItem,
    completeActionItem,
    parsePrimaryObjectiveUpdateRequest,
    updatePrimaryObjective,
    providerCallCounts
};




















































