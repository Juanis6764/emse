"use client";

import { io, Socket } from "socket.io-client";

export interface EventoDocumental {
  tipo: string;
  tipo_evento?: string;
  id_documento: number;
  id_movimiento?: number;
  id_plazo?: number;
}

// Debe ser la misma URL configurada para las solicitudes HTTP.
const URL_API = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === "undefined"
    ? "http://localhost:3001"
    : `${window.location.protocol}//${window.location.hostname}:3001`);
let socket: Socket | null = null;
let tokenActual: string | null = null;

export function conectarDocumentacion(token: string) {
  if (socket && tokenActual === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket?.disconnect();
  tokenActual = token;
  socket = io(`${URL_API}/documentacion`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
  });
  return socket;
}

export function desconectarDocumentacion() {
  socket?.disconnect();
  socket = null;
  tokenActual = null;
}
