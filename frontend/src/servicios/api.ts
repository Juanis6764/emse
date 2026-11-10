import axios from 'axios';

// Se incorpora en el build de Next.js. En Vercel debe apuntar al servicio
// público de Render, por ejemplo: https://emse-api.onrender.com
// En la red local se usa el proxy de Next en el mismo origen; así el navegador
// no debe alcanzar directamente el puerto interno del backend.
const URL_API = process.env.NEXT_PUBLIC_API_URL ||
  (typeof window === 'undefined'
    ? 'http://localhost:3001'
    : '/api');

const api = axios.create({
  baseURL: URL_API,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      const url = String(error.config?.url || '');
      const esIntentoLogin = url.includes('/autenticacion/iniciar-sesion') || url.includes('/autenticacion/verificar-codigo');
      if (!esIntentoLogin) window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  },
);

export default api;
