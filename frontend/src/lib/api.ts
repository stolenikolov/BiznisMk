import axios from 'axios';

/**
 * Auth relies on httpOnly cookies set by the backend, so every request must
 * carry credentials — there is no token for client code to attach manually.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
  withCredentials: true,
});
