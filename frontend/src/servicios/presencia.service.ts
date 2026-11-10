"use client";

import { io, Socket } from "socket.io-client";

export interface CambioPresencia {
  id_usuario: number;
  estado_conexion: "EN_LINEA" | "DESCONECTADO";
}

// Debe ser la misma URL configurada para las solicitudes HTTP.
const URL_API = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === "undefined"
    ? "http://localhost:3001"
    : `${window.location.protocol}//${window.location.hostname}:3001`);
let socket: Socket | null = null;
let tokenActual: string | null = null;

export function conectarPresencia(token: string) {
  if (socket && tokenActual === token) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket?.disconnect();
  tokenActual = token;
  socket = io(`${URL_API}/presencia`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
  });
  return socket;
}

export function desconectarPresencia() {
  socket?.disconnect();
  socket = null;
  tokenActual = null;
}
