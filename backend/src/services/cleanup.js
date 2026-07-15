import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cleanDirectory = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) return;
  
  const files = fs.readdirSync(directoryPath);
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

  files.forEach((file) => {
    const filePath = path.join(directoryPath, file);
    try {
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      // Delete files older than 24 hours
      if (age > TWENTY_FOUR_HOURS) {
        fs.unlinkSync(filePath);
        console.log(`[Cleanup] Deleted old file: ${file}`);
      }
    } catch (err) {
      console.error(`[Cleanup] Error processing file ${file}:`, err);
    }
  });
};

export const startCleanupCron = () => {
  // Run once every hour
  cron.schedule('0 * * * *', () => {
    console.log('[Cleanup] Running hourly cleanup job...');
    
    const uploadsDir = path.join(__dirname, '../../uploads');
    const exportsDir = path.join(__dirname, '../../public/exports');

    cleanDirectory(uploadsDir);
    cleanDirectory(exportsDir);
  });
  
  console.log('[Cleanup] Cron job scheduled. Files older than 24 hours will be deleted automatically.');
};
