import {
  type GetUserSessionResponse,
  type GetUserSessionsResponse,
  type UserSessionSignInContext,
  userSessionSignInContextGuard,
} from '@logto/schemas';
import { UAParser } from 'ua-parser-js';

type UserSessionTableRow = {
  name?: string;
  sessionId: string;
  location?: string;
  lastActiveAt?: string;
};

type SessionWithLastSubmission = Pick<GetUserSessionResponse, 'lastSubmission'>;

type ParsedUserAgentInfo = {
  browserName?: string;
  osName?: string;
  deviceModel?: string;
};

type SessionDisplayInfo = ParsedUserAgentInfo & {
  name?: string;
  location?: string;
  ip?: string;
  city?: string;
  country?: string;
};

const getParsedUserAgentInfo = (
  userAgent?: string,
  chHeaders?: Record<string, string>
): ParsedUserAgentInfo => {
  if (!userAgent) {
    return {};
  }

  const uaHeaders = chHeaders
    ? {
        'sec-ch-ua-model': chHeaders.CHUAModel,
        'sec-ch-ua-platform-version': chHeaders.CHUAPlatformVersion,
        'sec-ch-ua-platform': chHeaders.CHUAPlatform,
        'sec-ch-ua-full-version-list': chHeaders.CHUAFullVersionList,
      }
    : undefined;

  const parser = new UAParser(userAgent, undefined, uaHeaders);
  const { device, browser, os } = (
    uaHeaders ? parser.withClientHints() : parser
  ).getResult();

  const deviceModel = [device.vendor, device.model].filter(Boolean).join(' ') || undefined;

  return {
    browserName: browser.name,
    osName: os.name,
    deviceModel,
  };
};

const formatSessionLocation = ({ country, city }: UserSessionSignInContext) => {
  const location = [city, country].filter(Boolean).join(', ');

  return location || undefined;
};

const formatSessionDeviceName = (signInContext: UserSessionSignInContext) => {
  const { userAgent, ...chHeaders } = signInContext;
  const { browserName, osName, deviceModel } = getParsedUserAgentInfo(userAgent, chHeaders);

  if (browserName && deviceModel) {
    return `${browserName} on ${deviceModel}`;
  }

  if (browserName && osName) {
    return `${browserName} on ${osName}`;
  }

  if (browserName) {
    return browserName;
  }

  if (deviceModel) {
    return deviceModel;
  }

  return osName;
};

const normalizeSessionInfo = (signInContext: UserSessionSignInContext): SessionDisplayInfo => {
  const { userAgent, ...chHeaders } = signInContext;
  const { browserName, osName, deviceModel } = getParsedUserAgentInfo(userAgent, chHeaders);

  return {
    name: formatSessionDeviceName(signInContext),
    location: formatSessionLocation(signInContext),
    ip: signInContext.ip,
    city: signInContext.city,
    country: signInContext.country,
    browserName,
    osName,
    deviceModel,
  };
};

export const getSessionDisplayInfo = (session: SessionWithLastSubmission): SessionDisplayInfo => {
  const signInContextResult = userSessionSignInContextGuard.safeParse(
    session.lastSubmission?.signInContext
  );

  return signInContextResult.success ? normalizeSessionInfo(signInContextResult.data) : {};
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
