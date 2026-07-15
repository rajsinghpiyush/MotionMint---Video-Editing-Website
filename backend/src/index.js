import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { videoQueue, videoQueueEvents } from './config/queue.js';
import './workers/videoWorker.js';
import exportRouter from './routes/export.js';
import { startCleanupCron } from './services/cleanup.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.use('/api/export', exportRouter(io));
app.use('/exports', express.static(path.join(__dirname, '../public/exports')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Start automatic 24h file cleanup
startCleanupCron();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Setup Queue Events for real-time updates
videoQueueEvents.on('progress', ({ jobId, data }) => {
  if (!data) return;
  const { percent, status, clips, clientId } = data;
  if (clientId) {
    if (percent) {
      io.to(clientId).emit('video:progress', { percent, status });
    }
    if (clips) {
      io.to(clientId).emit('video:transcription', { clips });
    }
  }
});

videoQueueEvents.on('completed', ({ jobId, returnvalue }) => {
  const { downloadUrl, subtitleClips, clientId } = returnvalue;
  if (clientId) {
    if (subtitleClips) {
      io.to(clientId).emit('video:transcription', { clips: subtitleClips });
    }
    io.to(clientId).emit('video:ready', { downloadUrl });
  }
});

videoQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed: ${failedReason}`);
  try {
    const job = await videoQueue.getJob(jobId);
    if (job && job.data && job.data.clientId) {
      io.to(job.data.clientId).emit('video:error', { error: 'Failed to process video: ' + failedReason });
    }
  } catch (err) {
    console.error('Could not fetch failed job details:', err);
  }
});


app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const clientId = req.body.clientId;
    const filePath = req.file.path;
    const filename = req.file.filename;

    const job = await videoQueue.add('process-video', {
      inputPath: filePath,
      filename,
      clientId
    });

    res.status(202).json({ 
      message: 'Video upload received, processing started', 
      jobId: job.id 
    });

  } catch (error) {
    console.error('Upload route error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/upload-raw', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }
  const url = `http://localhost:3001/uploads/${req.file.filename}`;
  res.json({ url });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
