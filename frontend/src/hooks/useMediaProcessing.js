import { useCallback } from 'react';

export const useMediaProcessing = () => {
  const extractMetadata = useCallback(async (file) => {
    try {
      return new Promise((resolve) => {
        const video = document.createElement("video");
        video.onloadedmetadata = async () => {
          const metadata = {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            size: file.size,
            name: file.name
          };

          // Generate thumbnail
          try {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            // Seek to 1 second (or midpoint) for thumbnail
            video.currentTime = Math.min(1, video.duration / 2);
            await new Promise((res) => { video.onseeked = res; });

            canvas.width = Math.min(video.videoWidth, 320);
            canvas.height = Math.min(video.videoHeight, 180);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            metadata.thumbnailUrl = canvas.toDataURL("image/jpeg", 0.7);
          } catch (e) {
            console.warn("Failed to generate thumbnail", e);
          }

          URL.revokeObjectURL(video.src);
          resolve(metadata);
        };
        video.src = URL.createObjectURL(file);
      });
    } catch (error) {
      console.error("Error extracting metadata:", error);
      return { size: file.size, name: file.name, duration: 10 }; // Fallback
    }
  }, []);

  return { extractMetadata };
};
