import { ServerMain } from './ServerMain';

ServerMain.main().catch((err) => {
  console.error('Arena server failed to start:', err);
  process.exit(1);
});
