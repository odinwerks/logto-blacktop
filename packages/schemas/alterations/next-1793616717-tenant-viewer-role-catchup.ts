import { sql } from '@silverhand/slonik';

import type { AlterationScript } from '../lib/types/alteration.js';

/**
 * Blacktop catch-up: upstream's `1.45.0-1791531333-add-tenant-viewer-role.ts` is older than the
 * fork's `next-1792005720-migrate-brand-colors-to-fork-palette.ts`. A deployment whose alteration
 * watermark is already past 1791531333 never runs it, and the admin tenant then has no `viewer`
 * organization role for `TenantRole.Viewer` (Console members and invitations). Re-assert the role
 * here, after every upstream alteration.
 *
 * Idempotent: a database that did run the upstream alteration only gets the same description
 * update again, and every insert skips rows that already exist.
 */
const alteration: AlterationScript = {
  up: async (pool) => {
    // Cloud region databases other than the admin tenant's own have no `admin` tenant to hold the role.
    const adminTenant = await pool.maybeOne(sql`
      select id from tenants where id = 'admin'
    `);

    if (!adminTenant) {
      return;
    }

    await pool.query(sql`
      update organization_scopes
        set description = 'Write the tenant data.'
        where tenant_id = 'admin' and id = 'write-data';

      insert into organization_roles (tenant_id, id, name, description, type)
        values ('admin', 'viewer', 'viewer', 'Viewer of the tenant, who can read the tenant data and members but cannot change anything.', 'User')
        on conflict do nothing;

      insert into organization_role_scope_relations (tenant_id, organization_role_id, organization_scope_id)
        values ('admin', 'viewer', 'read-data'),
               ('admin', 'viewer', 'read-member')
        on conflict do nothing;
    `);
  },
  down: async () => {
    /**
     * No-op: the role belongs to upstream's `1.45.0-1791531333-add-tenant-viewer-role.ts`, whose
     * `down` removes it. Dropping it here would also undo that alteration on databases that ran it.
     */
  },
};

export default alteration;
