import express from 'express';
import { exportVideo } from '../services/ffmpeg.js';

const router = express.Router();

export default function(io) {
  router.post('/', async (req, res) => {
    try {
      const { timeline, clientId } = req.body;

      if (!timeline || !timeline.clips) {
        return res.status(400).json({ error: 'Invalid timeline data provided.' });
      }

      // Find the specific socket connection for this client
      // In a real app, you might map client IDs to socket IDs.
      // For MVP, we'll just broadcast to everyone, or use the global io object.
      const socket = io; 

      // Send initial response so the frontend knows the job started
      res.status(202).json({ message: 'Export started', status: 'processing' });

      // Process video in background
      try {
        await exportVideo(timeline, socket);
      } catch (err) {
        console.error('Export failed:', err);
        socket.emit('exportError', { error: err.message || 'Failed to export video.' });
      }

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error during export initialization' });
    }
  });

  return router;
}
