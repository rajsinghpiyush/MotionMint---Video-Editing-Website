import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { startUpload, uploadComplete, setError, resetState, addAsset, setActiveAsset } from './store/slices/videoSlice.js';
import { addVideoClip } from './store/slices/timelineSlice.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useMediaProcessing } from './hooks/useMediaProcessing.js';
import { Upload, Video, Download, RefreshCw, AlertCircle, Plus, Search, FolderOpen, Image as ImageIcon, Music, LayoutDashboard, Settings, GripVertical, GripHorizontal } from 'lucide-react';
import axios from 'axios';
import VideoPlayer from './components/VideoPlayer.jsx';
import Timeline from './components/Timeline.jsx';
import { Panel, Group, Separator } from 'react-resizable-panels';

export default function App() {
  const [file, setFile] = useState(null);
  const dispatch = useDispatch();
  const { socket, clientId } = useWebSocket();
  const { extractMetadata } = useMediaProcessing();
  const { assets, isUploading, isProcessing, progress, status, downloadUrl, error } = useSelector((state) => state.video);
  const timelineState = useSelector(state => state.timeline);

  const [exportState, setExportState] = useState({
    isExporting: false,
    progress: 0,
    status: '',
    url: null,
    error: null
  });

  useEffect(() => {
    if (!socket) return;
    const onProgress = (data) => setExportState(prev => ({ ...prev, progress: data.progress, status: data.status }));
    const onComplete = (data) => setExportState(prev => ({ ...prev, isExporting: false, url: data.downloadUrl, progress: 100, status: 'Complete!' }));
    const onError = (data) => setExportState(prev => ({ ...prev, isExporting: false, error: data.error, status: 'Failed' }));
    
    socket.on('exportProgress', onProgress);
    socket.on('exportComplete', onComplete);
    socket.on('exportError', onError);
    
    return () => {
      socket.off('exportProgress', onProgress);
      socket.off('exportComplete', onComplete);
      socket.off('exportError', onError);
    };
  }, [socket]);

  const handleExport = async () => {
    if (!clientId) return;
    setExportState({ isExporting: true, progress: 0, status: 'Initializing...', url: null, error: null });
    try {
      await axios.post('http://localhost:3001/api/export', {
        timeline: timelineState,
        clientId
      });
    } catch(err) {
      setExportState(prev => ({ ...prev, isExporting: false, error: 'Failed to start export', status: 'Error' }));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      dispatch(resetState());
    }
  };

  const handleUploadAsset = async (asset) => {
    if (!asset || !clientId) return;

    dispatch(startUpload());
    dispatch(setActiveAsset(asset.id));
    const formData = new FormData();
    formData.append('video', asset.file);
    formData.append('clientId', clientId);

    try {
      await axios.post('http://localhost:3001/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      dispatch(uploadComplete());
    } catch (err) {
      console.error(err);
      dispatch(setError('Failed to upload video for AI processing'));
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0A0A0F] text-white font-sans selection:bg-purple-500/30">
      
      {/* Top Navbar */}
      <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#14141A] shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-purple-600 to-blue-500 shadow-[0_0_15px_rgba(139,92,246,0.5)]"></div>
            <span className="font-bold text-lg tracking-tight">Orbit<span className="text-purple-400">AI</span></span>
          </div>
          <nav className="flex gap-1 ml-4">
            <button className="px-3 py-1.5 text-sm font-medium rounded-md bg-white/5 text-white">Project</button>
            <button className="px-3 py-1.5 text-sm font-medium rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors">Export</button>
          </nav>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <Settings size={16} className="text-white/70" />
          </button>
          <div onClick={handleExport} className="h-8 px-4 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-sm font-medium cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all">
            Export Video
          </div>
        </div>
      </header>

      {/* Main Workspace Area with Resizable Panels */}
      <div className="flex-1 w-full h-full min-h-0 p-4 flex flex-col">
        <Group orientation="vertical" className="w-full h-full flex-col">
          
          {/* TOP HALF: Assets, Player, Properties */}
          <Panel defaultSize={60} minSize={30} className="w-full h-full flex flex-col">
            <Group orientation="horizontal" className="w-full h-full flex-row">
              
              {/* Left Panel: Asset Library */}
              <Panel defaultSize={20} minSize={15} className="flex flex-col bg-[#14141A] rounded-2xl border border-white/5 overflow-hidden shadow-xl h-full">
                <div className="h-12 border-b border-white/5 flex items-center px-4 justify-between bg-[#1C1C24] shrink-0">
                  <span className="text-sm font-semibold text-white/90">Project Media</span>
                  <div className="flex gap-2 text-white/50">
                    <Search size={16} className="hover:text-white cursor-pointer" />
                    <Plus size={16} className="hover:text-white cursor-pointer" />
                  </div>
                </div>
                
                {/* Asset Categories */}
                <div className="flex p-2 gap-1 border-b border-white/5 shrink-0">
                  <button className="flex-1 py-1.5 text-xs font-medium rounded bg-white/10 text-white flex items-center justify-center gap-1"><Video size={14}/> Video</button>
                  <button className="flex-1 py-1.5 text-xs font-medium rounded text-white/50 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-1"><Music size={14}/> Audio</button>
                  <button className="flex-1 py-1.5 text-xs font-medium rounded text-white/50 hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-1"><ImageIcon size={14}/> Image</button>
                </div>

                {/* Asset List / Upload Area */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  
                  {/* Upload Button */}
                  <div className="mb-4">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          const newFile = e.target.files[0];
                          const metadata = await extractMetadata(newFile);
                          
                          // Upload raw file to backend immediately so FFmpeg has physical access during export
                          const formData = new FormData();
                          formData.append('video', newFile);
                          
                          let backendUrl = URL.createObjectURL(newFile);
                          try {
                            const res = await axios.post('http://localhost:3001/api/upload-raw', formData, {
                              headers: { 'Content-Type': 'multipart/form-data' }
                            });
                            backendUrl = res.data.url;
                          } catch (err) {
                            console.error("Failed to upload raw asset to backend", err);
                          }

                          const newAsset = {
                            id: `asset-${Date.now()}`,
                            file: newFile,
                            name: metadata.name,
                            duration: metadata.duration,
                            thumbnailUrl: metadata.thumbnailUrl,
                            url: backendUrl,
                            mimeType: newFile.type,
                          };
                          dispatch(addAsset(newAsset));
                        }
                      }}
                      className="hidden"
                      id="video-upload"
                      disabled={isUploading || isProcessing}
                    />
                    <label
                      htmlFor="video-upload"
                      className="cursor-pointer bg-[#1C1C24] border border-white/5 border-dashed rounded-xl p-4 flex flex-col items-center justify-center hover:border-purple-500/50 hover:bg-white/5 transition-all"
                    >
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mb-2">
                        <Upload className="w-4 h-4 text-white/50" />
                      </div>
                      <span className="text-[10px] font-medium text-white/70 uppercase tracking-wider">
                        Upload Asset
                      </span>
                    </label>
                  </div>

                  {/* Processing Status Block (if active) */}
                  {(isUploading || isProcessing || downloadUrl) && (
                    <div className="bg-[#1C1C24] border border-white/5 rounded-xl p-4 mb-4">
                      {downloadUrl ? (
                         <div className="flex flex-col items-center text-center">
                           <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center mb-2">
                             <Download className="w-3 h-3 text-green-400" />
                           </div>
                           <span className="text-[10px] text-white/90 mb-2">AI Processing Complete</span>
                           <div className="flex gap-2 w-full">
                             <button 
                               onClick={() => dispatch(addVideoClip({ url: downloadUrl, name: 'AI Processed Video' }))}
                               className="flex-1 bg-purple-600 hover:bg-purple-500 text-white text-[10px] py-1 rounded transition-colors"
                             >
                               + Timeline
                             </button>
                             <button 
                               onClick={() => dispatch(resetState())}
                               className="flex-1 bg-white/10 hover:bg-white/20 text-white text-[10px] py-1 rounded transition-colors"
                             >
                               Clear
                             </button>
                           </div>
                         </div>
                      ) : (
                        <div className="w-full">
                          <div className="flex justify-between text-[10px] text-white/50 mb-1.5">
                            <span className="truncate pr-2">{status || (isUploading ? 'Uploading...' : 'Processing...')}</span>
                            <span className="shrink-0">{progress}%</span>
                          </div>
                          <div className="w-full bg-black/50 rounded-full h-1 overflow-hidden">
                            <div 
                              className="bg-purple-500 h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(139,92,246,0.8)]" 
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Asset Items */}
                  <div className="space-y-2">
                    {assets.length === 0 && !isUploading && !isProcessing && (
                      <p className="text-xs text-white/30 text-center py-4">No assets uploaded yet.</p>
                    )}
                    {assets.map(asset => (
                      <div key={asset.id} className="relative p-2 rounded-lg bg-[#1C1C24] border border-white/5 hover:border-purple-500/30 transition-all group overflow-hidden">
                        <div className="flex gap-3 relative z-10">
                          <div className="w-16 h-10 bg-black rounded overflow-hidden relative border border-white/5 shrink-0 flex items-center justify-center">
                            {asset.thumbnailUrl ? (
                              <img src={asset.thumbnailUrl} alt="Thumb" className="w-full h-full object-cover" />
                            ) : (
                              <Video className="w-4 h-4 text-white/30" />
                            )}
                            <span className="absolute bottom-1 right-1 bg-black/80 px-1 rounded-[2px] text-[8px] font-mono">
                              {Math.floor(asset.duration)}s
                            </span>
                          </div>
                          <div className="flex flex-col justify-center min-w-0 flex-1">
                            <span className="text-xs font-medium text-white/90 group-hover:text-purple-400 transition-colors truncate">
                              {asset.name}
                            </span>
                            <span className="text-[10px] text-white/40">Local Video</span>
                          </div>
                        </div>
                        
                        {/* Hover Actions */}
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-20">
                          <button 
                            onClick={() => dispatch(addVideoClip({ url: asset.url, name: asset.name, duration: asset.duration, mimeType: asset.mimeType }))}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] px-2 py-1 rounded font-medium transition-colors flex items-center gap-1"
                          >
                            <Plus size={12}/> Timeline
                          </button>
                          <button 
                            onClick={() => handleUploadAsset(asset)}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] px-2 py-1 rounded font-medium transition-colors"
                          >
                            AI
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>

              <Separator className="group flex items-center justify-center transition-colors w-2 mx-1 cursor-col-resize hover:bg-purple-500/20 active:bg-purple-500/40">
                <div className="rounded-full bg-white/10 group-hover:bg-purple-500 transition-colors w-0.5 h-8" />
              </Separator>

              {/* Center Panel: Video Player */}
              <Panel defaultSize={60} minSize={30} className="flex flex-col h-full">
                <VideoPlayer />
              </Panel>

              <Separator className="group flex items-center justify-center transition-colors w-2 mx-1 cursor-col-resize hover:bg-purple-500/20 active:bg-purple-500/40">
                <div className="rounded-full bg-white/10 group-hover:bg-purple-500 transition-colors w-0.5 h-8" />
              </Separator>

              {/* Right Panel: Properties */}
              <Panel defaultSize={20} minSize={15} className="flex flex-col bg-[#14141A] rounded-2xl border border-white/5 overflow-hidden shadow-xl h-full">
                <div className="h-12 border-b border-white/5 flex items-center px-4 bg-[#1C1C24] shrink-0">
                  <span className="text-sm font-semibold text-white/90">Properties</span>
                </div>
                
                {(() => {
                  const selectedClip = useSelector(state => state.timeline.clips.find(c => c.id === state.timeline.selectedClipId));
                  
                  if (selectedClip && selectedClip.type === 'subtitle') {
                    return (
                      <div className="flex-1 p-4 flex flex-col gap-4">
                        <div>
                          <label className="text-xs font-medium text-white/70 mb-2 block">Subtitle Text</label>
                          <textarea 
                            value={selectedClip.text}
                            onChange={(e) => dispatch({ type: 'timeline/updateClipText', payload: { id: selectedClip.id, text: e.target.value } })}
                            className="w-full h-32 bg-[#0A0A0F] border border-white/10 rounded-lg p-3 text-sm text-white resize-none focus:outline-none focus:border-purple-500 transition-colors custom-scrollbar"
                            placeholder="Enter subtitle text..."
                          />
                        </div>
                        <div className="flex gap-2">
                          <button className="flex-1 py-2 text-xs font-medium rounded bg-white/10 text-white hover:bg-white/20 transition-colors">Style</button>
                          <button className="flex-1 py-2 text-xs font-medium rounded bg-white/10 text-white hover:bg-white/20 transition-colors">Animation</button>
                        </div>
                      </div>
                    );
                  }

                  if (selectedClip) {
                    return (
                      <div className="flex-1 p-4 flex flex-col items-center justify-center text-center opacity-50">
                        <Settings className="w-8 h-8 mb-3 text-white/30" />
                        <p className="text-xs text-white/60">Properties for {selectedClip.assetName}</p>
                      </div>
                    );
                  }

                  return (
                    <div className="flex-1 p-4 flex flex-col items-center justify-center text-center">
                      <Settings className="w-8 h-8 mb-3 text-white/30" />
                      <p className="text-xs text-white/60 mb-4">Select a clip on the timeline to edit properties.</p>
                      <button 
                        onClick={() => dispatch({ type: 'timeline/addSubtitleClip' })}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Plus size={14} /> Add Subtitle Block
                      </button>
                    </div>
                  );
                })()}
              </Panel>

            </Group>
          </Panel>

          <Separator className="group flex items-center justify-center transition-colors h-2 my-1 cursor-row-resize hover:bg-purple-500/20 active:bg-purple-500/40">
            <div className="rounded-full bg-white/10 group-hover:bg-purple-500 transition-colors h-0.5 w-8" />
          </Separator>

          {/* BOTTOM HALF: Timeline */}
          <Panel defaultSize={40} minSize={20} className="flex flex-col h-full">
            <Timeline />
          </Panel>

        </Group>
      </div>

      {/* Export Modal Overlay */}
      {(exportState.isExporting || exportState.url || exportState.error) && (
        <div className="absolute inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-[#1C1C24] border border-white/10 rounded-2xl p-6 w-96 shadow-2xl flex flex-col items-center text-center">
            <h3 className="text-lg font-bold text-white mb-2">Exporting Video</h3>
            {exportState.isExporting && (
              <>
                <p className="text-xs text-white/50 mb-6">{exportState.status}</p>
                <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-purple-500 rounded-full transition-all duration-300" style={{ width: `${exportState.progress}%` }}></div>
                </div>
                <p className="text-xs text-white/80 font-mono">{exportState.progress}%</p>
              </>
            )}
            {exportState.url && (
              <>
                <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                  <Download className="text-green-500 w-6 h-6" />
                </div>
                <p className="text-sm text-white/80 mb-6">Your video has been rendered successfully!</p>
                <div className="flex gap-3 w-full">
                  <button onClick={() => setExportState({ isExporting: false, progress: 0, status: '', url: null, error: null })} className="flex-1 py-2 rounded bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium">Close</button>
                  <a href={exportState.url} target="_blank" rel="noreferrer" className="flex-1 py-2 rounded bg-purple-600 hover:bg-purple-500 transition-colors text-sm font-medium text-white block">Download</a>
                </div>
              </>
            )}
            {exportState.error && (
              <>
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                  <AlertCircle className="text-red-500 w-6 h-6" />
                </div>
                <p className="text-sm text-red-400 mb-6">{exportState.error}</p>
                <button onClick={() => setExportState({ isExporting: false, progress: 0, status: '', url: null, error: null })} className="w-full py-2 rounded bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium">Dismiss</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
