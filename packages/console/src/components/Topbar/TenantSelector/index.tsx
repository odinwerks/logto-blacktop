import { useContext } from 'react';

import { type TenantResponse } from '@/types/cloud-router';
import TenantEnvTag from '@/components/TenantEnvTag';
import { TenantsContext } from '@/contexts/TenantsProvider';

import styles from './index.module.scss';

export default function TenantSelector() {
  const { currentTenant: currentTenantInfo } = useContext(TenantsContext);

  if (!currentTenantInfo) {
    return null;
  }

  return (
    <div className={styles.currentTenantCard}>
      <div className={styles.name}>{currentTenantInfo.name}</div>
      <TenantEnvTag tag={currentTenantInfo.tag} />
    </div>
  );
}
