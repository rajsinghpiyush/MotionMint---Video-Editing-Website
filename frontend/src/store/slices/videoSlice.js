import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  assets: [], // { id, name, url, file, thumbnailUrl, duration }
  isUploading: false,
  isProcessing: false,
  progress: 0,
  status: '',
  downloadUrl: null,
  error: null,
  activeAssetId: null, // Used to track which asset is currently processing
};

export const videoSlice = createSlice({
  name: 'video',
  initialState,
  reducers: {
    addAsset: (state, action) => {
      const exists = state.assets.find(asset => asset.id === action.payload.id);
      if (!exists) {
        state.assets.push(action.payload);
      }
    },
    removeAsset: (state, action) => {
      state.assets = state.assets.filter(asset => asset.id !== action.payload);
      if (state.activeAssetId === action.payload) {
        state.activeAssetId = null;
      }
    },
    setActiveAsset: (state, action) => {
      state.activeAssetId = action.payload;
    },
    startUpload: (state) => {
      state.isUploading = true;
      state.isProcessing = false;
      state.progress = 0;
      state.status = 'Uploading...';
      state.downloadUrl = null;
      state.error = null;
    },
    uploadComplete: (state) => {
      state.isUploading = false;
      state.isProcessing = true;
      state.status = 'Processing...';
    },
    updateProgress: (state, action) => {
      state.progress = action.payload.percent !== undefined ? action.payload.percent : action.payload;
      if (action.payload.status) {
        state.status = action.payload.status;
      }
    },
    processingComplete: (state, action) => {
      state.isProcessing = false;
      state.downloadUrl = action.payload;
      state.progress = 100;
      state.status = 'Complete';
    },
    setError: (state, action) => {
      state.isUploading = false;
      state.isProcessing = false;
      state.error = action.payload;
      state.status = 'Error';
    },
    resetState: (state) => {
      state.isUploading = false;
      state.isProcessing = false;
      state.progress = 0;
      state.status = '';
      state.downloadUrl = null;
      state.error = null;
      state.activeAssetId = null;
    }
  },
});

export const { addAsset, removeAsset, setActiveAsset, startUpload, uploadComplete, updateProgress, processingComplete, setError, resetState } = videoSlice.actions;

export default videoSlice.reducer;
