import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { uploadToS3 } from './s3.js';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@xenova/transformers';
import wavefilePkg from 'wavefile';
const { WaveFile } = wavefilePkg;
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure ONNX uses local paths correctly in Node
env.allowLocalModels = true;
env.useBrowserCache = false;

// Helper to extract 16kHz mono audio from video
const extractAudio = (inputPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .run();
  });
};

export const processVideo = async (inputPath, filename, clientId, io) => {
  const audioOutputPath = path.join(__dirname, '../../uploads', `audio-${filename}.wav`);
  const finalVideoPath = path.join(__dirname, '../../uploads', `processed-${filename}.mp4`);

  try {
    if (clientId) {
      io.emit('video:progress', { percent: 10, status: 'Extracting audio for AI...' });
    }

    // 1. Extract audio
    await extractAudio(inputPath, audioOutputPath);

    if (clientId) {
      io.emit('video:progress', { percent: 30, status: 'Loading AI model (Whisper)...' });
    }

    // 2. Load Transformers.js Pipeline
    // This will download the model to a local cache folder on the first run.
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: (info) => {
        if (info.status === 'progress' && clientId) {
           // We scale download progress between 30 and 50 percent
           const scaledProgress = 30 + Math.round((info.progress / 100) * 20);
           io.emit('video:progress', { percent: scaledProgress, status: `Downloading Model: ${info.file}` });
        }
      }
    });

    if (clientId) {
      io.emit('video:progress', { percent: 50, status: 'Transcribing audio with AI...' });
    }

    // 3. Read the .wav file and convert to Float32Array (required by transformers.js)
    const buffer = fs.readFileSync(audioOutputPath);
    const wav = new WaveFile(buffer);
    wav.toBitDepth('32f');
    wav.toSampleRate(16000);
    let audioData = wav.getSamples();
    if (Array.isArray(audioData)) {
      if (audioData.length > 1) {
        // If stereo, convert to mono by averaging
        const mono = new Float32Array(audioData[0].length);
        for (let i = 0; i < audioData[0].length; ++i) {
            mono[i] = (audioData[0][i] + audioData[1][i]) / 2;
        }
        audioData = mono;
      } else {
        audioData = audioData[0];
      }
    }

    // 4. Run Whisper Transcription
    const output = await transcriber(audioData, { 
      return_timestamps: 'word', // get exact timings
      chunk_length_s: 30,
      stride_length_s: 5
    });

    if (clientId) {
      io.emit('video:progress', { percent: 90, status: 'Generating Redux Subtitles...' });
    }

    // 5. Map Whisper chunks to Redux Timeline Clips
    // output.chunks is like [{ text: ' Hello', timestamp: [0.0, 1.2] }]
    const subtitleClips = (output.chunks || []).map(chunk => ({
      id: crypto.randomUUID(),
      type: 'subtitle',
      trackId: 'track-s1',
      text: chunk.text.trim(),
      startOffset: chunk.timestamp[0],
      duration: chunk.timestamp[1] - chunk.timestamp[0] > 0 ? chunk.timestamp[1] - chunk.timestamp[0] : 1.0,
      color: '#f97316'
    }));

    if (clientId) {
      io.emit('video:transcription', { clips: subtitleClips });
      io.emit('video:progress', { percent: 95, status: 'Uploading media to S3...' });
    }

    // 6. Just copy the original video so we have something to return as processed media
    fs.copyFileSync(inputPath, finalVideoPath);
    const s3Url = await uploadToS3(finalVideoPath, `processed-${filename}.mp4`);

    if (clientId) {
      io.emit('video:ready', { downloadUrl: s3Url });
    }

    // Cleanup local files
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(audioOutputPath);
      fs.unlinkSync(finalVideoPath);
    } catch(e) {}

  } catch (error) {
    console.error('AI Processing error:', error);
    if (clientId) {
      io.emit('video:error', { error: 'AI processing failed' });
    }
    throw error;
  }
};
