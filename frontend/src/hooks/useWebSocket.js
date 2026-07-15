import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { updateProgress, processingComplete, setError } from '../store/slices/videoSlice.js';
import { addSubtitleClips } from '../store/slices/timelineSlice.js';

const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useWebSocket = () => {
  const [socket, setSocket] = useState(null);
  const [clientId, setClientId] = useState(null);
  const dispatch = useDispatch();

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket server');
      setClientId(newSocket.id);
    });

    newSocket.on('video:progress', (data) => {
      // data can have percent and status
      dispatch(updateProgress(data));
    });

    newSocket.on('video:uploading_to_s3', (data) => {
      console.log(data.message);
    });

    newSocket.on('video:transcription', (data) => {
      if (data.clips && data.clips.length > 0) {
        dispatch(addSubtitleClips(data.clips));
      }
    });

    newSocket.on('video:ready', (data) => {
      dispatch(processingComplete(data.downloadUrl));
    });

    newSocket.on('video:error', (data) => {
      dispatch(setError(data.error));
    });

    return () => {
      newSocket.close();
    };
  }, [dispatch]);

  return { socket, clientId };
};
