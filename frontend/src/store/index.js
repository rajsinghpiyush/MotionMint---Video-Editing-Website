import { configureStore } from '@reduxjs/toolkit';
import videoReducer from './slices/videoSlice.js';
import timelineReducer from './slices/timelineSlice.js';

export const store = configureStore({
  reducer: {
    video: videoReducer,
    timeline: timelineReducer,
  },
});
