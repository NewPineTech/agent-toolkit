import { config } from './config/env.js';
import { createApp } from './app.js';

async function main() {
  const app = await createApp(config);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, starting graceful shutdown...`);
    const timeout = setTimeout(() => {
      app.log.error('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);

    try {
      await app.close();
      clearTimeout(timeout);
      app.log.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error during shutdown');
      clearTimeout(timeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Server listening on ${config.HOST}:${config.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
