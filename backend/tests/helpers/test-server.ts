import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export const withTestServer = async <T>(
  app: Express,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> => {
  const server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address() as AddressInfo;

  try {
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }
};
