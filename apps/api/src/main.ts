import { createApp } from './bootstrap';

async function bootstrap() {
  const app = await createApp();
  const port = process.env['API_PORT'] ?? 4000;
  await app.listen(port);
  console.log(`API running on port ${port}`);
}

bootstrap();
