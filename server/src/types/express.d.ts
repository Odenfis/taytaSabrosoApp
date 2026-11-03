import type { User } from '@prisma/client';
import type { VerifiedOfflineProof } from '../lib/offline-authorship.js';

declare global {
  namespace Express {
    interface Request {
      auth?: { user: User; deviceId: string };
      offline?: VerifiedOfflineProof;
    }
  }
}

export {};
