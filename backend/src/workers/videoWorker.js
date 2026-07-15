import { Worker } from 'bullmq';
import { redisConnection } from '../config/redis.js';
import { videoQueueName } from '../config/queue.js';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
import { uploadToS3 } from '../services/s3.js';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@xenova/transformers';
import wavefilePkg from 'wavefile';
import crypto from 'crypto';

const { WaveFile } = wavefilePkg;

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

export const videoWorker = new Worker(videoQueueName, async (job) => {
  const { inputPath, filename, clientId } = job.data;
  const audioOutputPath = path.join(__dirname, '../../uploads', `audio-${filename}.wav`);
  const finalVideoPath = path.join(__dirname, '../../uploads', `processed-${filename}.mp4`);

  try {
    await job.updateProgress({ percent: 10, status: 'Extracting audio for AI...', clientId });

    // 1. Extract audio
    await extractAudio(inputPath, audioOutputPath);

    await job.updateProgress({ percent: 30, status: 'Loading AI model (Whisper)...', clientId });

    // 2. Load Transformers.js Pipeline
    const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
      progress_callback: async (info) => {
        if (info.status === 'progress') {
           const scaledProgress = 30 + Math.round((info.progress / 100) * 20);
           await job.updateProgress({ percent: scaledProgress, status: `Downloading Model: ${info.file}`, clientId });
        }
      }
    });

    await job.updateProgress({ percent: 50, status: 'Transcribing audio with AI...', clientId });

    // 3. Read the .wav file and convert to Float32Array
    const buffer = fs.readFileSync(audioOutputPath);
    const wav = new WaveFile(buffer);
    wav.toBitDepth('32f');
    wav.toSampleRate(16000);
    let audioData = wav.getSamples();
    if (Array.isArray(audioData)) {
      if (audioData.length > 1) {
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
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5
    });

    await job.updateProgress({ percent: 90, status: 'Generating Redux Subtitles...', clientId });

    // 5. Map Whisper chunks to Redux Timeline Clips
    const subtitleClips = (output.chunks || []).map(chunk => ({
      id: crypto.randomUUID(),
      type: 'subtitle',
      trackId: 'track-s1',
      text: chunk.text.trim(),
      startOffset: chunk.timestamp[0],
      duration: chunk.timestamp[1] - chunk.timestamp[0] > 0 ? chunk.timestamp[1] - chunk.timestamp[0] : 1.0,
      color: '#f97316'
    }));

    await job.updateProgress({ percent: 95, status: 'Uploading media to S3...', clips: subtitleClips, clientId });

    // 6. Copy original video and upload to S3
    fs.copyFileSync(inputPath, finalVideoPath);
    const s3Url = await uploadToS3(finalVideoPath, `processed-${filename}.mp4`);

    // Cleanup local files
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(audioOutputPath);
      fs.unlinkSync(finalVideoPath);
    } catch(e) {}

    return { downloadUrl: s3Url, subtitleClips, clientId };

  } catch (error) {
    console.error('AI Processing error in worker:', error);
    try {
      fs.unlinkSync(inputPath);
      fs.unlinkSync(audioOutputPath);
      fs.unlinkSync(finalVideoPath);
    } catch(e) {}
    throw error;
  }
}, { 
  connection: redisConnection,
  concurrency: 2
});

videoWorker.on('completed', (job) => {
  console.log(`Job ${job.id} has completed!`);
});

videoWorker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} has failed with ${err.message}`);
});
