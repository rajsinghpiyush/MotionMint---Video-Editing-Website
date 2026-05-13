import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Play, Pause, SkipBack, SkipForward, Maximize2, Volume2 } from 'lucide-react';
import { togglePlay, setCurrentTime, updateClipTransform, selectClip } from '../store/slices/timelineSlice.js';
import { Rnd } from 'react-rnd';

// Child component to handle individual video elements and their sync
const VideoElement = ({ clip, currentTime, isPlaying, selectedClipId }) => {
  const dispatch = useDispatch();
  const videoRef = useRef(null);

  // Sync Redux time to native video time
  useEffect(() => {
    if (!videoRef.current) return;
    
    const expectedVideoTime = clip.trimStart + (currentTime - clip.startOffset);
    const actualVideoTime = videoRef.current.currentTime || 0;
    
    // Only force a seek if the desync is large (scrubbing)
    if (Math.abs(expectedVideoTime - actualVideoTime) > 0.4) {
      videoRef.current.currentTime = expectedVideoTime;
    }
  }, [currentTime, clip.trimStart, clip.startOffset]);

  // Handle Play/Pause
  useEffect(() => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.play().catch(e => console.log('Autoplay prevented:', e));
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  const isSelected = clip.id === selectedClipId;

  return (
    <Rnd
      size={{ 
        width: clip.transform?.width || 640, 
        height: clip.transform?.height || 360 
      }}
      position={{ 
        x: clip.transform?.x || 0, 
        y: clip.transform?.y || 0 
      }}
      onDragStop={(e, d) => {
        dispatch(updateClipTransform({ id: clip.id, transform: { x: d.x, y: d.y } }));
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        dispatch(updateClipTransform({ 
          id: clip.id, 
          transform: { 
            width: parseInt(ref.style.width, 10), 
            height: parseInt(ref.style.height, 10), 
            ...position 
          } 
        }));
      }}
      bounds="parent"
      onClick={() => dispatch(selectClip(clip.id))}
      className={`group absolute ${isSelected ? 'border-2 border-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.5)] z-20' : 'border-2 border-transparent hover:border-white/30 z-10'}`}
      style={{ zIndex: clip.transform?.zIndex || 1 }}
      resizeHandleClasses={{
        bottomRight: `w-3 h-3 bg-purple-500 rounded-full border-2 border-white translate-x-1 translate-y-1 ${!isSelected && 'hidden group-hover:block'}`,
        bottomLeft: `w-3 h-3 bg-purple-500 rounded-full border-2 border-white -translate-x-1 translate-y-1 ${!isSelected && 'hidden group-hover:block'}`,
        topRight: `w-3 h-3 bg-purple-500 rounded-full border-2 border-white translate-x-1 -translate-y-1 ${!isSelected && 'hidden group-hover:block'}`,
        topLeft: `w-3 h-3 bg-purple-500 rounded-full border-2 border-white -translate-x-1 -translate-y-1 ${!isSelected && 'hidden group-hover:block'}`,
      }}
    >
      <video 
        ref={videoRef} 
        src={clip.src}
        className="w-full h-full object-contain pointer-events-none bg-black/50"
        playsInline
      />
    </Rnd>
  );
};

export default function VideoPlayer() {
  const dispatch = useDispatch();
  const { clips, currentTime, isPlaying, duration, selectedClipId } = useSelector(state => state.timeline);
  
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const currentTimeRef = useRef(currentTime);
  
  // Keep ref in sync without triggering useEffect
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Find ALL active video clips for compositing
  const activeVideoClips = clips.filter(c => c.type === 'video' && currentTime >= c.startOffset && currentTime < c.startOffset + c.duration);
  const activeSubtitleClip = clips.find(c => c.type === 'subtitle' && currentTime >= c.startOffset && currentTime < c.startOffset + c.duration);

  // Redux Timeline Playback Loop (Master Clock)
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = performance.now();
      
      const updateLoop = (now) => {
        const dt = (now - lastTimeRef.current) / 1000;
        lastTimeRef.current = now;
        
        const newTime = Math.min(currentTimeRef.current + dt, duration);
        dispatch(setCurrentTime(newTime));
        rafRef.current = requestAnimationFrame(updateLoop);
      };
      
      rafRef.current = requestAnimationFrame(updateLoop);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, duration, dispatch]);

  // Stop playing if we hit the end
  useEffect(() => {
    if (currentTime >= duration && isPlaying) {
      dispatch(togglePlay());
      dispatch(setCurrentTime(duration));
    }
  }, [currentTime, duration, isPlaying, dispatch]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const scrubberRef = useRef(null);

  const handleScrubberClick = (e) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percentage = x / rect.width;
    dispatch(setCurrentTime(percentage * duration));
  };

  return (
    <div className="flex flex-col h-full bg-[#14141A] rounded-2xl border border-white/5 overflow-hidden shadow-2xl relative">
      {/* Video Screen / Canvas Container */}
      <div 
        className="relative flex-1 bg-black overflow-hidden"
        onClick={(e) => {
          // Deselect if clicking the background canvas
          if (e.target === e.currentTarget) {
            dispatch(selectClip(null));
          }
        }}
      >
        
        {/* Render all active video clips */}
        {activeVideoClips.map(clip => (
          <VideoElement 
            key={clip.id} 
            clip={clip} 
            currentTime={currentTime} 
            isPlaying={isPlaying} 
            selectedClipId={selectedClipId}
          />
        ))}

        {/* Fallback when no clip is active */}
        {activeVideoClips.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1A1A24] to-[#0A0A0F] opacity-50 z-0 pointer-events-none">
            <p className="text-white/30 text-sm font-mono tracking-widest uppercase">No Media</p>
          </div>
        )}

        {/* Subtitle Overlay */}
        {activeSubtitleClip && (
          <div className="absolute inset-0 pointer-events-none flex items-end justify-center pb-12 z-[100]">
            <div className="px-6 py-2 rounded max-w-[80%] text-center">
              <span 
                className="text-white text-2xl font-bold tracking-wide" 
                style={{ 
                  color: '#FFFFFF',
                  textShadow: '0px 2px 4px rgba(0,0,0,0.8), 0px 4px 10px rgba(0,0,0,0.5)',
                  WebkitTextStroke: '1px rgba(0,0,0,0.5)'
                }}
              >
                {activeSubtitleClip.text}
              </span>
            </div>
          </div>
        )}

        {/* Time overlay */}
        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 z-[100] pointer-events-none">
          <span className="text-white font-mono text-sm">{formatTime(currentTime)}</span>
          <span className="text-white/40 font-mono text-xs ml-1">/ {formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="h-16 bg-[#1C1C24] border-t border-white/5 px-4 flex items-center justify-between shrink-0 z-[101]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => dispatch(setCurrentTime(0))}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <SkipBack size={16} />
          </button>
          
          <button 
            onClick={() => dispatch(togglePlay())}
            className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-500 flex items-center justify-center text-white shadow-[0_0_15px_rgba(139,92,246,0.4)] transition-all hover:scale-105"
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
          </button>
          
          <button 
            onClick={() => dispatch(setCurrentTime(duration))}
            className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Playback Scrubber (Mini) */}
        <div className="flex-1 mx-6 group">
          <div 
            ref={scrubberRef}
            onClick={handleScrubberClick}
            className="h-1.5 bg-white/10 rounded-full overflow-hidden relative cursor-pointer group-hover:h-2 transition-all"
          >
            <div 
              className="absolute top-0 left-0 bottom-0 bg-purple-500 rounded-full"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            ></div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <Volume2 size={16} />
          </button>
          <button className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
