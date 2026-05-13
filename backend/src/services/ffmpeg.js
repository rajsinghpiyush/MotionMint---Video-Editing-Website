import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export async function exportVideo(timeline, socket) {
  return new Promise((resolve, reject) => {
    try {
      const outputPath = path.join(__dirname, '../../public/exports', `export_${Date.now()}.mp4`);
      
      if (!fs.existsSync(path.dirname(outputPath))) {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      }

      const command = ffmpeg();
      
      const videoClips = timeline.clips.filter(c => c.type === 'video');
      const subtitleClips = timeline.clips.filter(c => c.type === 'subtitle');

      // 1. Create Base Canvas (Input 0)
      const projectDuration = timeline.duration || 60;
      command.input(`color=c=black:s=1920x1080:d=${projectDuration}:r=30`);
      command.inputOptions('-f lavfi');

      if (videoClips.length === 0 && subtitleClips.length === 0) {
        return reject(new Error("No clips found in the timeline."));
      }

      // Add all video inputs (Inputs 1 to N)
      videoClips.forEach(clip => {
        let inputPath = clip.src;
        if (inputPath.startsWith('http://localhost:3001/uploads/')) {
          const filename = inputPath.replace('http://localhost:3001/uploads/', '');
          inputPath = path.join(__dirname, '../../uploads', filename);
        }
        command.addInput(inputPath);
      });

      let filterGraph = [];
      let currentBaseOutput = '0:v'; // The black canvas
      let audioMixInputs = [];

      // 2. Process Videos (Trim, Scale, Overlay, and Audio Delay)
      videoClips.forEach((clip, idx) => {
        const inputIndex = idx + 1;
        const vTrimmed = `v${inputIndex}_trim`;
        const vScaled = `v${inputIndex}_scale`;
        const nextBaseOutput = `base_${inputIndex}`;
        
        // Parse frontend transform
        const width = clip.transform?.width ? parseInt(clip.transform.width) : 1920;
        const height = clip.transform?.height ? parseInt(clip.transform.height) : 1080;
        const x = clip.transform?.x ? parseInt(clip.transform.x) : 0;
        const y = clip.transform?.y ? parseInt(clip.transform.y) : 0;

        // Video Chain
        filterGraph.push({
          filter: 'trim',
          options: { start: clip.trimStart, duration: clip.duration },
          inputs: `${inputIndex}:v`,
          outputs: vTrimmed
        });
        filterGraph.push({
          filter: 'setpts',
          options: 'PTS-STARTPTS',
          inputs: vTrimmed,
          outputs: `${vTrimmed}_pts`
        });
        filterGraph.push({
          filter: 'scale',
          options: `${width}:${height}`,
          inputs: `${vTrimmed}_pts`,
          outputs: vScaled
        });
        filterGraph.push({
          filter: 'overlay',
          options: {
            x: x,
            y: y,
            enable: `between(t,${clip.startOffset},${clip.startOffset + clip.duration})`
          },
          inputs: [currentBaseOutput, vScaled],
          outputs: nextBaseOutput
        });

        currentBaseOutput = nextBaseOutput;

        // Audio Chain (assuming every video has an audio stream for simplicity)
        const aTrimmed = `a${inputIndex}_trim`;
        const aDelayed = `a${inputIndex}_delay`;
        const delayMs = Math.round(clip.startOffset * 1000);

        filterGraph.push({
          filter: 'atrim',
          options: { start: clip.trimStart, duration: clip.duration },
          inputs: `${inputIndex}:a`,
          outputs: aTrimmed
        });
        filterGraph.push({
          filter: 'asetpts',
          options: 'PTS-STARTPTS',
          inputs: aTrimmed,
          outputs: `${aTrimmed}_pts`
        });
        filterGraph.push({
          filter: 'adelay',
          options: `${delayMs}|${delayMs}`,
          inputs: `${aTrimmed}_pts`,
          outputs: aDelayed
        });
        
        audioMixInputs.push(aDelayed);
      });

      // 3. Process Subtitles
      subtitleClips.forEach((sub, idx) => {
        const nextBaseOutput = `sub_${idx}`;
        const safeText = sub.text.replace(/'/g, "\\'");
        
        filterGraph.push({
          filter: 'drawtext',
          options: {
            text: safeText,
            fontcolor: 'white',
            fontsize: '48',
            x: '(w-text_w)/2',
            y: '(h-text_h)*0.8',
            enable: `between(t,${sub.startOffset},${sub.startOffset + sub.duration})`,
            bordercolor: 'black',
            borderw: 2
          },
          inputs: currentBaseOutput,
          outputs: nextBaseOutput
        });
        currentBaseOutput = nextBaseOutput;
      });

      // Final Video Output Name
      const finalVideoOutput = currentBaseOutput;

      // 4. Mix Audio
      const finalAudioOutput = 'final_a';
      if (audioMixInputs.length > 0) {
        filterGraph.push({
          filter: 'amix',
          options: { inputs: audioMixInputs.length, duration: 'longest' },
          inputs: audioMixInputs,
          outputs: finalAudioOutput
        });
      }

      command.complexFilter(filterGraph);

      // Export settings
      const outputOptions = [
        `-map [${finalVideoOutput}]`,
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-crf 23',
        '-preset fast'
      ];

      if (audioMixInputs.length > 0) {
        outputOptions.push(`-map [${finalAudioOutput}]`);
        outputOptions.push('-c:a aac');
      }

      command
        .outputOptions(outputOptions)
        .output(outputPath)
        .on('start', (cmdLine) => {
          console.log('Started FFmpeg with command:', cmdLine);
          if (socket) socket.emit('exportProgress', { progress: 0, status: 'Starting render...' });
        })
        .on('progress', (progress) => {
          if (socket && progress.percent) {
             socket.emit('exportProgress', { progress: Math.min(99, Math.round(progress.percent)), status: 'Rendering composited frames...' });
          }
        })
        .on('end', () => {
          console.log('Export finished successfully');
          const fileName = path.basename(outputPath);
          const downloadUrl = `http://localhost:3001/exports/${fileName}`;
          if (socket) socket.emit('exportComplete', { downloadUrl });
          resolve(downloadUrl);
        })
        .on('error', (err) => {
          console.error('Error during export:', err);
          if (socket) socket.emit('exportError', { error: err.message });
          reject(err);
        });

      command.run();

    } catch (error) {
      reject(error);
    }
  });
}
