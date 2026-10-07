import type { GetUserSessionsResponse } from '@logto/schemas';
import { getSessionDisplayInfo } from '@logto/shared/universal';

type UserSessionTableRow = {
  name?: string;
  sessionId: string;
  location?: string;
  lastActiveAt?: string;
};

export const normalizeSessionRows = (
  sessions: GetUserSessionsResponse['sessions']
): UserSessionTableRow[] => {
  return sessions.map<UserSessionTableRow>((session) => {
    const normalized = getSessionDisplayInfo(session);

    return {
      name: normalized.name,
      sessionId: session.payload.uid,
      location: normalized.location,
      lastActiveAt: session.lastActiveAt ?? undefined,
    };
  });
};
