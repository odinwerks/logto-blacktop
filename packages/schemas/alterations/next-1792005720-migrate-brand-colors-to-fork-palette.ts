import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

/**
 * Migrate the seeded sign-in experience brand colors to the fork palette.
 *
 * Rows still carrying the upstream default pair (`#6139F6` / `#8768F8`) are
 * rewritten to the fork defaults (`#0062cc` / `#007BFF`); `isDarkModeEnabled`
 * and any customized colors are left untouched.
 */
const alteration: AlterationScript = {
  up: async (pool) => {
    await pool.query(sql`
      update sign_in_experiences
      set color = jsonb_set(
        jsonb_set(color, '{primaryColor}', '"#0062cc"'),
        '{darkPrimaryColor}',
        '"#007BFF"'
      )
      where color ->> 'primaryColor' = '#6139F6'
        and color ->> 'darkPrimaryColor' = '#8768F8'
    `);
  },
  down: async (pool) => {
    await pool.query(sql`
      update sign_in_experiences
      set color = jsonb_set(
        jsonb_set(color, '{primaryColor}', '"#6139F6"'),
        '{darkPrimaryColor}',
        '"#8768F8"'
      )
      where color ->> 'primaryColor' = '#0062cc'
        and color ->> 'darkPrimaryColor' = '#007BFF'
    `);
  },
};

export default alteration;
