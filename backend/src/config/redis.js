import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = process.env.REDIS_URL || {
  // Use 127.0.0.1 instead of localhost to prevent IPv6 Docker issues
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const redisConnection = new Redis(redisConfig, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisConnection.on('error', (error) => {
  console.error('❌ Redis connection error:', error);
});

export const closeRedisConnection = async () => {
  if (redisConnection) {
    await redisConnection.quit();
    console.log('🔌 Redis connection closed gracefully');
  }
};
