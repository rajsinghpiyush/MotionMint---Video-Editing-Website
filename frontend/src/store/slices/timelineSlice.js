import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentTime: 0,
  duration: 60, // Total project duration in seconds
  isPlaying: false,
  zoom: 1, // 1x = standard width
  selectedClipId: null,
  tracks: [
    { id: 'track-v1', type: 'video', name: 'Video 1', isMuted: false, isLocked: false },
    { id: 'track-v2', type: 'video', name: 'Video 2', isMuted: false, isLocked: false },
    { id: 'track-s1', type: 'subtitle', name: 'Subtitles', isMuted: false, isLocked: false },
    { id: 'track-a1', type: 'audio', name: 'Audio 1', isMuted: false, isLocked: false }
  ],
  clips: []
};

export const timelineSlice = createSlice({
  name: 'timeline',
  initialState,
  reducers: {
    setCurrentTime: (state, action) => {
      state.currentTime = action.payload;
    },
    togglePlay: (state) => {
      state.isPlaying = !state.isPlaying;
    },
    setPlaying: (state, action) => {
      state.isPlaying = action.payload;
    },
    selectClip: (state, action) => {
      state.selectedClipId = action.payload;
    },
    updateClipPosition: (state, action) => {
      const { id, startOffset } = action.payload;
      const clip = state.clips.find(c => c.id === id);
      if (clip) {
        clip.startOffset = Math.max(0, startOffset); // Prevent negative start
      }
    },
    updateClipDuration: (state, action) => {
      const { id, duration, startOffset } = action.payload;
      const clip = state.clips.find(c => c.id === id);
      if (clip) {
        if (startOffset !== undefined) clip.startOffset = Math.max(0, startOffset);
        if (duration !== undefined) clip.duration = Math.max(1, duration); // Minimum 1s
        
        // Prevent duration from exceeding available media
        if (clip.originalDuration && clip.duration > clip.originalDuration) {
           clip.duration = clip.originalDuration;
        }

        clip.trimEnd = clip.trimStart + clip.duration;

        // If we stretch right past the original end of the video
        if (clip.originalDuration && clip.trimEnd > clip.originalDuration) {
           clip.trimEnd = clip.originalDuration;
           clip.duration = clip.trimEnd - clip.trimStart;
        }
      }
    },
    updateClipTransform: (state, action) => {
      const { id, transform } = action.payload;
      const clip = state.clips.find(c => c.id === id);
      if (clip && clip.transform) {
        clip.transform = { ...clip.transform, ...transform };
      }
    },
    setZoom: (state, action) => {
      state.zoom = Math.max(0.1, Math.min(5, action.payload));
    },
    deleteClip: (state) => {
      if (state.selectedClipId) {
        state.clips = state.clips.filter(c => c.id !== state.selectedClipId);
        state.selectedClipId = null;
      }
    },
    splitClip: (state) => {
      if (!state.selectedClipId) return;
      
      const clipIndex = state.clips.findIndex(c => c.id === state.selectedClipId);
      if (clipIndex === -1) return;
      
      const clip = state.clips[clipIndex];
      const splitTime = state.currentTime;
      
      // Check if playhead is actually over the clip
      if (splitTime > clip.startOffset && splitTime < clip.startOffset + clip.duration) {
        // Calculate the split point
        const firstPartDuration = splitTime - clip.startOffset;
        const secondPartDuration = clip.duration - firstPartDuration;
        
        // Create the second part
        const newClip = {
          ...clip,
          id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          startOffset: splitTime,
          duration: secondPartDuration,
          trimStart: clip.trimStart + firstPartDuration,
        };
        
        // Update the first part
        clip.duration = firstPartDuration;
        clip.trimEnd = clip.trimStart + firstPartDuration;
        
        // Add new clip and select it
        state.clips.push(newClip);
        state.selectedClipId = newClip.id;
      }
    },
    addSubtitleClip: (state) => {
      const newClip = {
        id: `subtitle-${Date.now()}`,
        trackId: 'track-s1',
        type: 'subtitle',
        assetName: 'Subtitle Block',
        text: 'New Subtitle Text',
        startOffset: state.currentTime,
        duration: 3,
        trimStart: 0,
        trimEnd: 3,
        color: '#F59E0B' // Amber accent
      };
      state.clips.push(newClip);
      state.selectedClipId = newClip.id;
    },
    addSubtitleClips: (state, action) => {
      // payload is an array of clip objects
      const newClips = action.payload.map(clip => ({
        ...clip,
        assetName: 'AI Subtitle',
        trimStart: 0
      }));
      state.clips.push(...newClips);
    },
    addVideoClip: (state, action) => {
      const { url, name, duration, mimeType } = action.payload;
      const initialDuration = duration ? duration : 10;
      const newClip = {
        id: `video-${Date.now()}`,
        trackId: 'track-v2', // Put it on the second track by default
        type: 'video',
        assetName: name || 'Uploaded Video',
        src: url,
        mimeType: mimeType || 'video/mp4',
        startOffset: state.currentTime,
        duration: initialDuration,
        originalDuration: initialDuration,
        trimStart: 0,
        trimEnd: initialDuration,
        color: '#10B981', // Emerald
        transform: { x: 0, y: 0, width: 640, height: 360, zIndex: 1 } // Default PiP layout size
      };
      state.clips.push(newClip);
      state.selectedClipId = newClip.id;
    },
    updateClipText: (state, action) => {
      const { id, text } = action.payload;
      const clip = state.clips.find(c => c.id === id);
      if (clip && clip.type === 'subtitle') {
        clip.text = text;
      }
    }
  }
});

export const { 
  setCurrentTime, 
  togglePlay, 
  setPlaying,
  selectClip, 
  updateClipPosition, 
  updateClipDuration,
  setZoom,
  deleteClip,
  splitClip,
  addSubtitleClip,
  addSubtitleClips,
  addVideoClip,
  updateClipText,
  updateClipTransform
} = timelineSlice.actions;

export default timelineSlice.reducer;
