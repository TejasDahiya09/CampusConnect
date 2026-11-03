import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { attachMessagingSocket } from './modules/messaging/messaging.socket.js';

const server = createServer(createApp());
const messagingSocket = attachMessagingSocket(server);

server.listen(env.port, () => {
  console.log(`CampusConnect API listening on http://localhost:${env.port}`);
});

const shutDown = (signal: NodeJS.Signals) => {
  console.log(`${signal} received. Closing HTTP server.`);

  void messagingSocket.close(() => process.exit(0));
};

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
