import { createMockPool, createMockQueryResult } from '@silverhand/slonik';

import type { QueryType } from '#src/utils/test-utils.js';

import { OidcSessionExtensionsQueries } from './oidc-session-extensions.js';

const { jest } = import.meta;

const mockQuery: jest.MockedFunction<QueryType> = jest.fn();
const queries = new OidcSessionExtensionsQueries(
  createMockPool({ query: async (sql, values) => mockQuery(sql, values) })
);

describe('findExactSessionActivity', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // Bound-parameter order for the account+client query:
  //   sid_session CTE:  'Session', accountId, clientId, sid
  //   matches CTE:      accountId (ext join), 'Session', accountId (payload), clientId (?)
  const boundParams = ['Session', 'user', 'client', 'sid', 'user', 'Session', 'user', 'client'];

  it('returns the freshest session activity for one live session match', async () => {
    mockQuery.mockResolvedValueOnce(
      createMockQueryResult([{ evaluatedAt: 2000, sessionExpiresAt: 3000, lastActiveAt: 1000 }])
    );

    await expect(queries.findExactSessionActivity('user', 'client', 'sid')).resolves.toEqual({
      state: 'found',
      evaluatedAt: 2000,
      session: { sessionExpiresAt: 3000, lastActiveAt: 1000 },
    });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(boundParams);
  });

  it('detects no live session with activity (unresolvable sid or no heartbeat)', async () => {
    mockQuery.mockResolvedValueOnce(
      createMockQueryResult([{ evaluatedAt: 2000, sessionExpiresAt: null, lastActiveAt: null }])
    );

    await expect(queries.findExactSessionActivity('user', 'client', 'sid')).resolves.toEqual({
      state: 'not_found',
      evaluatedAt: 2000,
    });
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(boundParams);
  });

  it('collapses multiple live sessions to the freshest (never ambiguous)', async () => {
    // The query emits LIMIT 1 ORDER BY last_active_at DESC, so the DB only ever returns
    // one row. A defensive two-row mock still resolves 'found' is impossible — the code
    // treats >1 as ambiguous; assert it stays a safe non-found coarse state.
    mockQuery.mockResolvedValueOnce(
      createMockQueryResult([
        { evaluatedAt: 2000, sessionExpiresAt: 3000, lastActiveAt: 1000 },
        { evaluatedAt: 2000, sessionExpiresAt: 4000, lastActiveAt: 1500 },
      ])
    );

    await expect(queries.findExactSessionActivity('user', 'client', 'sid')).resolves.toEqual({
      state: 'ambiguous',
      evaluatedAt: 2000,
    });
  });
});
