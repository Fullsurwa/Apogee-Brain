const { execFile } = require('child_process');
const path = require('path');

const WHISPER_EXE = 'C:\\Users\\kewot\\.apogee\\whisper-test\\whisper.cpp\\build\\bin\\Release\\whisper-cli.exe';
const WHISPER_MODEL = 'C:\\Users\\kewot\\.apogee\\whisper-test\\whisper.cpp\\ggml-base.bin';

const DEFAULT_PROMPT =
    'SmartMart, Apogee SKOPE, Bluetooth, RSSI, PII, KES, trolley tags, Data Protection Act 2019.';

function transcribeAudio(audioPath, prompt = DEFAULT_PROMPT) {
    return new Promise((resolve, reject) => {
        const absoluteAudioPath = path.resolve(audioPath);

        execFile(
            WHISPER_EXE,
            [
                '-m', WHISPER_MODEL,
                '-f', absoluteAudioPath,
                '--prompt', prompt,
                '--no-timestamps',
                '-nt'
            ],
            {
                windowsHide: true,
                maxBuffer: 10 * 1024 * 1024
            },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`Whisper transcription failed: ${error.message}\n${stderr}`));
                    return;
                }

                const transcript = stdout
                    .split(/\r?\n/)
                    .map(line => line.trim())
                    .filter(Boolean)
                    .join(' ')
                    .trim();

                if (!transcript) {
                    reject(new Error('Whisper returned an empty transcript.'));
                    return;
                }

                resolve(transcript);
            }
        );
    });
}

module.exports = {
    transcribeAudio,
    WHISPER_EXE,
    WHISPER_MODEL,
    DEFAULT_PROMPT
};
