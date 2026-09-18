import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';

let io: Server | null = null;

export function initRealtime(httpServer: HttpServer): void {
  io = new Server(httpServer, { cors: { origin: true, credentials: true } });
}

/**
 * Barcha ochiq interfeyslarga "yangilan" signali.
 *
 * Ma'lumotning o'zi yuborilmaydi — mijoz o'zi qayta so'raydi. Shunday qilinsa
 * huquq tekshiruvi bitta joyda qoladi va xabar tarkibi eskirib qolmaydi.
 */
export function broadcast(event = 'refresh'): void {
  io?.emit(event, Date.now());
}
