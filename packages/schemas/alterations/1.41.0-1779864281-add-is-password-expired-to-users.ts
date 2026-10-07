import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

const alteration: AlterationScript = {
  up: async (pool) => {
    await pool.query(sql`
      alter table users add column if not exists is_password_expired boolean not null default false;
    `);
  },
  down: async (pool) => {
    await pool.query(sql`
      alter table users drop column if exists is_password_expired;
    `);
  },
};

export default alteration;
