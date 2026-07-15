import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from './redis.js';

export const videoQueueName = 'video-processing';

export const videoQueue = new Queue(videoQueueName, {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const videoQueueEvents = new QueueEvents(videoQueueName, {
  connection: redisConnection,
});
