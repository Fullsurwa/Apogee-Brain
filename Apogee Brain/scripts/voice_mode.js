const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { transcribeAudio } = require('./whisper_stt');
const { runSystemPipeline } = require('../03_Active_Engine/Brains/core-engine/apogee_core');

const MIC = 'Microphone Array (Intel® Smart Sound Technology for Digital Microphones)';
const FFMPEG = 'ffmpeg';

let recording = null;
let recordingPath = null;
let busy = false;

function startRecording() {
    if (busy || recording) return;

    recordingPath = path.join(
        os.tmpdir(),
        `apogee-voice-${Date.now()}.wav`
    );

    console.log('\n🎙️  Listening... press ENTER when you are finished.\n');

    recording = spawn(FFMPEG, [
        '-y',
        '-f', 'dshow',
        '-i', `audio=${MIC}`,
        '-ar', '16000',
        '-ac', '1',
        recordingPath
    ], {
        stdio: ['pipe', 'ignore', 'pipe'],
        windowsHide: true
    });

    recording.stderr.on('data', () => {});

    recording.on('error', (error) => {
        recording = null;
        console.error('\n[Voice] FFmpeg failed:', error.message);
    });

    recording.on('close', async (code) => {
        recording = null;

        if (code !== 0) {
            console.error(`\n[Voice] Recording stopped with FFmpeg code ${code}.`);
            return;
        }

        if (!fs.existsSync(recordingPath)) {
            console.error('\n[Voice] Recording file was not created.');
            return;
        }

        busy = true;

        try {
            console.log('\n[Voice] Transcribing...\n');

            const transcript = await transcribeAudio(recordingPath);

            console.log('[Voice] Transcript:');
            console.log(transcript);
            console.log('\n[Voice] Sending to Apogee Brain...\n');

            await runSystemPipeline(transcript);
        } catch (error) {
            console.error('\n[Voice] Pipeline failed:', error);
        } finally {
            busy = false;

            try {
                fs.unlinkSync(recordingPath);
            } catch {}

            recordingPath = null;

            console.log('\n🎙️  Ready — press ENTER to speak.\n');
        }
    });
}

function stopRecording() {
    if (!recording) return;

    console.log('\n[Voice] Stopping recording...');

    recording.stdin.write('q');
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('\n========================================');
console.log('        APOGEE BRAIN — VOICE MODE');
console.log('========================================');
console.log('\nPress ENTER to start speaking.');
console.log('Press ENTER again to stop speaking.');
console.log('Press Ctrl+C to exit.\n');

rl.on('line', () => {
    if (busy) {
        console.log('[Voice] Still processing — please wait.');
        return;
    }

    if (recording) {
        stopRecording();
    } else {
        startRecording();
    }
});

process.on('SIGINT', () => {
    if (recording) {
        recording.stdin.write('q');
    }

    console.log('\n\n[Voice] Exiting voice mode.');
    rl.close();
    process.exit(0);
});
