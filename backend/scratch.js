import { Queue } from 'bullmq';
import { redisConnection } from './src/config/redis.js';

async function fixRedis() {
  try {
    console.log('Setting maxmemory-policy to noeviction...');
    await redisConnection.config('SET', 'maxmemory-policy', 'noeviction');
    console.log('Policy set successfully.');

    const q1 = new Queue('video-processing', { connection: redisConnection });
    const q2 = new Queue('video-processing-dev', { connection: redisConnection });

    console.log('Emptying video-processing queue...');
    await q1.obliterate({ force: true });
    console.log('Emptying video-processing-dev queue...');
    await q2.obliterate({ force: true });

    console.log('Queues cleared successfully.');
  } catch (error) {
    console.error('Error in fixRedis:', error);
  } finally {
    process.exit(0);
  }
}

fixRedis();
