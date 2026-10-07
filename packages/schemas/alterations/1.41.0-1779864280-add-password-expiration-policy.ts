import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

const alteration: AlterationScript = {
  up: async (pool) => {
    await pool.query(sql`
      alter table users
        add column if not exists password_updated_at timestamptz;

      alter table sign_in_experiences
        add column if not exists password_expiration jsonb not null default '{}'::jsonb;
    `);
  },
  down: async (pool) => {
    await pool.query(sql`
      alter table users drop column if exists password_updated_at;
      alter table sign_in_experiences drop column if exists password_expiration;
    `);
  },
};

export default alteration;
