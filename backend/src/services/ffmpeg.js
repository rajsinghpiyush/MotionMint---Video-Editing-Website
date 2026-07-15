import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToS3 } from './s3.js';

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
        // Replace single quote with smart quote so we can wrap the whole text in single quotes safely
        const safeText = sub.text.replace(/'/g, "\u2019"); 
        
        const drawtextOptions = {
          text: `'${safeText}'`,
          fontcolor: 'white',
          fontsize: '48',
          x: '(w-text_w)/2',
          y: '(h-text_h)*0.8',
          enable: `between(t,${sub.startOffset},${sub.startOffset + sub.duration})`,
          bordercolor: 'black',
          borderw: 2
        };

        // Fix Windows drive letter colon escaping by using root absolute path without drive letter
        if (process.platform === 'win32') {
          drawtextOptions.fontfile = '/Windows/Fonts/arial.ttf';
        }

        filterGraph.push({
          filter: 'drawtext',
          options: drawtextOptions,
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
        '-threads 2',
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
          if (socket) {
            let percent = progress.percent;
            // Fallback: manually calculate percent if FFmpeg doesn't report it due to complex filters
            if (!percent && progress.timemark) {
              const parts = progress.timemark.split(':');
              if (parts.length === 3) {
                const currentSecs = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
                percent = (currentSecs / projectDuration) * 100;
              }
            }
            if (percent !== undefined && percent !== null) {
              socket.emit('exportProgress', { progress: Math.min(99, Math.round(percent)), status: 'Rendering composited frames...' });
            } else {
              socket.emit('exportProgress', { progress: 50, status: 'Rendering composited frames...' });
            }
          }
        })
        .on('end', async () => {
          console.log('Export finished locally, starting S3 upload...');
          try {
            if (socket) socket.emit('exportProgress', { progress: 100, status: 'Uploading final video to AWS S3...' });
            
            const fileName = path.basename(outputPath);
            const downloadUrl = await uploadToS3(outputPath, fileName);
            
            console.log('S3 Upload complete. Cleaning up local files...');
            if (socket) socket.emit('exportComplete', { downloadUrl });
            resolve(downloadUrl);

            // Cleanup local exported file ONLY, leave the raw uploads so the user can keep editing
            try {
              if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
              }
            } catch(e) { console.error('Cleanup export error:', e); }

          } catch (err) {
            console.error('Error during S3 upload after export:', err);
            if (socket) socket.emit('exportError', { error: 'Failed to upload export to S3: ' + err.message });
            reject(err);
          }
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
