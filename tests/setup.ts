/**
 * Global Jest setup.
 * Sets minimal env vars so validateEnv.ts does not exit(1) during tests.
 * Real integration tests override these via testcontainers.
 */

process.env['GITHUB_APP_ID'] = '12345';
process.env['GITHUB_PRIVATE_KEY'] = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIEowIBAAKCAQEA2a2rwplBQLzHPZe5TNJT5sElMFYkXMKqXzXh+vNMjpq9YQER',
  'mMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNO',
  '-----END RSA PRIVATE KEY-----',
].join('\n');
process.env['GITHUB_WEBHOOK_SECRET'] = 'test-webhook-secret-minimum-16-chars';
process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-key';
process.env['LLM_MODEL'] = 'claude-sonnet-4-20250514';
process.env['REDIS_URL'] = 'redis://localhost:6379';
process.env['QUEUE_CONCURRENCY'] = '3';
process.env['QUEUE_MAX_ATTEMPTS'] = '3';
process.env['PORT'] = '3001';
process.env['BASE_URL'] = 'https://test.example.com';
process.env['LOG_LEVEL'] = 'silent';
