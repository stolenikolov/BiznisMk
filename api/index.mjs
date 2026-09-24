// The whole backend as one Vercel function: vercel.json routes /api/* here, and
// backend/src/serverless.ts strips the prefix before Nest sees the request.
export { default } from '../backend/dist/serverless.js';
