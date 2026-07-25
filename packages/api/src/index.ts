/** Bootstrap: starts the API subsystem via `ApiMain.main()`. */
import { ApiMain } from './ApiMain';

ApiMain.main().catch((err) => {
  console.error('Arena API failed to start:', err);
  process.exit(1);
});
