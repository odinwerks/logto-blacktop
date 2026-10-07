import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

/**
 * Blacktop catch-up: `1.39.0-1778000000-add-blacktop-columns.ts` predates upstream's 1.40.x
 * alterations, so deployments that ran upstream >= 1.40 (watermark past 1778000000) never apply
 * it and would miss `oidc_session_extensions.last_active_at` (plus the password-expiration
 * columns on paths where the 1.41.0 alterations were already consumed upstream). Re-assert all
 * four columns here, after every upstream alteration.
 *
 * Also repairs legacy `password_expiration` rows the fork's pre-GA guard allowed through:
 * `{enabled: true}` without a valid `validPeriodDays` fails the current union guard and would
 * 500 sign-in-experience reads for the whole tenant; backfill it to 90 days.
 */
const alteration: AlterationScript = {
  up: async (pool) => {
    await pool.query(sql`
      alter table users add column if not exists password_updated_at timestamptz;
      alter table sign_in_experiences add column if not exists password_expiration jsonb not null default '{}'::jsonb;
      alter table users add column if not exists is_password_expired boolean not null default false;
      alter table oidc_session_extensions add column if not exists last_active_at timestamptz;
    `);

    await pool.query(sql`
      update sign_in_experiences
      set password_expiration = password_expiration || '{"validPeriodDays": 90}'::jsonb
      where password_expiration->>'enabled' = 'true'
        and (
          jsonb_typeof(password_expiration->'validPeriodDays') is distinct from 'number'
          or (password_expiration->>'validPeriodDays')::numeric < 1
        );
    `);
  },
  down: async (pool) => {
    /**
     * Mirrors the base file's drops. Rolling back only this alteration leaves the base file
     * "applied" without its columns — same known limitation as the base file's own down.
     */
    await pool.query(sql`
      alter table users drop column if exists password_updated_at;
      alter table sign_in_experiences drop column if exists password_expiration;
      alter table users drop column if exists is_password_expired;
      alter table oidc_session_extensions drop column if exists last_active_at;
    `);
  },
};

export default alteration;
