// config.ts requires these at import time (activities import config).
process.env.DATABASE_URL = 'postgres://test/test';
process.env.REDIS_URL = 'redis://test';
process.env.RABBITMQ_URL = 'amqp://test';
process.env.LOG_LEVEL = 'silent';
