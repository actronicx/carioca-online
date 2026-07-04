import { io } from "socket.io-client";

// In produzione il client viene servito dallo stesso server Node, quindi
// basta connettersi alla stessa origine. In sviluppo locale (vite dev)
// il proxy in vite.config.js instrada /socket.io verso localhost:3001.
const URL = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(URL, {
  autoConnect: true,
});
