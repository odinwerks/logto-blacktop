import TenantMembers from '@/pages/TenantSettings/TenantMembers';

/**
 * The members and invitations of a self-hosted deployment, the same pages Cloud tenants use.
 * Blacktop: always available on self-hosted — no license gate and no upsell.
 */
function Members() {
  return <TenantMembers />;
}

export default Members;
