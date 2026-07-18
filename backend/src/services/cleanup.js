import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { cleanS3Bucket } from './s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cleanDirectory = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) return;
  
  const files = fs.readdirSync(directoryPath);
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;

  files.forEach((file) => {
    // Protect specific test videos from deletion
    if (file.includes('Test Video')) {
      return;
    }

    const filePath = path.join(directoryPath, file);
    try {
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      // Delete files older than 1 hour
      if (age > ONE_HOUR) {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] Deleted old file: ${file}`);
      }
    } catch (err) {
      console.error(`[Cleanup] Error processing file ${file}:`, err);
    }
  });
};

export const startCleanupCron = () => {
  // Run every 15 minutes to accurately catch 1-hour old files
  cron.schedule('*/15 * * * *', () => {
    console.log('[Cleanup] Running cleanup job...');
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    const exportsDir = path.join(__dirname, '../../public/exports');

    cleanDirectory(uploadsDir);
    cleanDirectory(exportsDir);
  });
  
  // S3 Cleanup Job (Runs every hour to delete files older than 24 hours)
  cron.schedule('0 * * * *', () => {
    console.log('[Cleanup] Running S3 cleanup job...');
    cleanS3Bucket();
  });
  
  console.log('[Cleanup] Cron job scheduled. Files older than 1 hour will be deleted automatically.');
};
