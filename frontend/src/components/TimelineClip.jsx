import { Rnd } from 'react-rnd';
import { useDispatch, useSelector } from 'react-redux';
import { selectClip, updateClipPosition, updateClipDuration } from '../store/slices/timelineSlice.js';
import { Scissors } from 'lucide-react';

export default function TimelineClip({ clip, PIXELS_PER_SECOND }) {
  const dispatch = useDispatch();
  const { selectedClipId } = useSelector(state => state.timeline);
  const isSelected = selectedClipId === clip.id;

  const width = clip.duration * PIXELS_PER_SECOND;
  const x = clip.startOffset * PIXELS_PER_SECOND;

  const handleDragStop = (e, d) => {
    const newStartOffset = Math.max(0, d.x / PIXELS_PER_SECOND);
    dispatch(updateClipPosition({ id: clip.id, startOffset: newStartOffset }));
  };

  const handleResizeStop = (e, direction, ref, delta, position) => {
    const newWidth = parseInt(ref.style.width, 10);
    const newDuration = newWidth / PIXELS_PER_SECOND;
    const newStartOffset = Math.max(0, position.x / PIXELS_PER_SECOND);
    
    dispatch(updateClipDuration({ 
      id: clip.id, 
      duration: newDuration,
      startOffset: newStartOffset 
    }));
  };

  return (
    <Rnd
      size={{ width, height: 50 }}
      position={{ x, y: 0 }}
      onDragStop={handleDragStop}
      onResizeStop={handleResizeStop}
      bounds="parent"
      dragAxis="x"
      enableResizing={{
        left: true, right: true, top: false, bottom: false,
        topLeft: false, topRight: false, bottomLeft: false, bottomRight: false
      }}
      resizeHandleClasses={{
        left: 'clip-handle left-handle',
        right: 'clip-handle right-handle'
      }}
      className={`absolute top-1 rounded-md overflow-hidden transition-shadow ${isSelected ? 'z-20 ring-2 ring-white shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'z-10'}`}
      onClick={(e) => {
        e.stopPropagation();
        dispatch(selectClip(clip.id));
      }}
    >
      {/* Clip Background with Gradient/Color */}
      <div 
        className="w-full h-full flex flex-col justify-center px-2 relative group"
        style={{ 
          backgroundColor: `${clip.color}20`, // 20% opacity
          border: `1px solid ${clip.color}50`,
          borderLeft: `4px solid ${clip.color}`
        }}
      >
        {/* Mock Waveform / Thumbnail bar */}
        {clip.type !== 'subtitle' && (
          <div className="absolute inset-0 opacity-30 flex items-center justify-around pointer-events-none px-1 overflow-hidden">
             {Array.from({length: 20}).map((_, i) => (
               <div key={i} className="w-1 bg-white rounded-full" style={{ height: `${20 + Math.random() * 60}%` }}></div>
             ))}
          </div>
        )}
        
        <span className="text-xs font-medium text-white truncate drop-shadow-md relative z-10 select-none">
          {clip.assetName}
        </span>

        {/* Hover Trim Hint */}
        <div className="absolute inset-y-0 left-0 w-2 cursor-col-resize group-hover:bg-white/20 transition-colors"></div>
        <div className="absolute inset-y-0 right-0 w-2 cursor-col-resize group-hover:bg-white/20 transition-colors"></div>
      </div>
    </Rnd>
  );
}
