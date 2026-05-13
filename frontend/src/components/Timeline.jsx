import { useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setCurrentTime, selectClip, deleteClip, splitClip, togglePlay } from '../store/slices/timelineSlice.js';
import TimelineClip from './TimelineClip.jsx';
import { Settings2, Eye, EyeOff, Lock, Unlock } from 'lucide-react';

export default function Timeline() {
  const dispatch = useDispatch();
  const { tracks, clips, currentTime, duration, zoom } = useSelector(state => state.timeline);
  const timelineRef = useRef(null);

  const PIXELS_PER_SECOND = 20 * zoom;
  const timelineWidth = duration * PIXELS_PER_SECOND;

  // Handle clicking on the timeline to seek
  const handleTimelineClick = (e) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const newTime = Math.max(0, Math.min(duration, x / PIXELS_PER_SECOND));
    dispatch(setCurrentTime(newTime));
    dispatch(selectClip(null)); // Deselect clips
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        dispatch(togglePlay());
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        dispatch(deleteClip());
      } else if (e.key.toLowerCase() === 's') {
        dispatch(splitClip());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  // Generate ruler markers
  const markers = [];
  for (let i = 0; i <= duration; i += (zoom > 1 ? 1 : 5)) {
    markers.push(
      <div 
        key={i} 
        className="absolute h-full border-l border-white/10"
        style={{ left: `${i * PIXELS_PER_SECOND}px` }}
      >
        <span className="absolute -left-3 top-1 text-[10px] text-white/40 font-mono">
          00:{i.toString().padStart(2, '0')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#14141A] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
      {/* Toolbar */}
      <div className="h-10 border-b border-white/5 flex items-center px-4 justify-between bg-[#1C1C24]">
        <div className="flex items-center gap-4 text-xs font-medium text-white/50">
          <button onClick={() => dispatch(splitClip())} className="hover:text-white transition-colors">Split (S)</button>
          <button onClick={() => dispatch(deleteClip())} className="hover:text-white transition-colors">Delete (Del)</button>
          <button className="hover:text-white transition-colors">Snapping</button>
        </div>
        <div className="flex items-center gap-2">
          <Settings2 size={14} className="text-white/40 hover:text-white cursor-pointer" />
        </div>
      </div>

      {/* Timeline Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track Headers (Left Sidebar) */}
        <div className="w-48 bg-[#1A1A22] border-r border-white/5 flex flex-col z-20 shrink-0">
          <div className="h-8 border-b border-white/5"></div> {/* Ruler alignment space */}
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {tracks.map(track => (
              <div key={track.id} className="h-[60px] border-b border-white/5 px-3 flex items-center justify-between group hover:bg-white/[0.02] transition-colors">
                <span className="text-xs font-medium text-white/70 truncate mr-2">{track.name}</span>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="text-white/30 hover:text-white"><EyeOff size={14} /></button>
                  <button className="text-white/30 hover:text-white"><Unlock size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tracks Canvas */}
        <div 
          className="flex-1 overflow-auto custom-scrollbar relative bg-[#0A0A0F]"
          ref={timelineRef}
          onClick={handleTimelineClick}
        >
          <div style={{ width: `${timelineWidth}px`, minWidth: '100%', height: '100%' }} className="relative">
            {/* Time Ruler */}
            <div className="h-8 border-b border-white/10 bg-[#14141A] sticky top-0 z-10 pointer-events-none">
              {markers}
            </div>

            {/* Playhead (Vertical Line) */}
            <div 
              className="absolute top-0 bottom-0 w-[1px] bg-purple-500 z-30 pointer-events-none shadow-[0_0_10px_rgba(139,92,246,0.8)]"
              style={{ left: `${currentTime * PIXELS_PER_SECOND}px`, transform: 'translateX(-50%)' }}
            >
              {/* Playhead Top Triangle */}
              <div className="absolute -top-0 -left-1.5 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-purple-500"></div>
            </div>

            {/* Track Lanes */}
            <div className="relative">
              {tracks.map((track, idx) => (
                <div key={track.id} className="h-[60px] border-b border-white/5 relative w-full box-border">
                  {/* Render clips for this track */}
                  {clips.filter(c => c.trackId === track.id).map(clip => (
                    <TimelineClip 
                      key={clip.id} 
                      clip={clip} 
                      PIXELS_PER_SECOND={PIXELS_PER_SECOND} 
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
