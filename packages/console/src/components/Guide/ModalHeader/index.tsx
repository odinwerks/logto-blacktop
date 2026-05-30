import { type AdminConsoleKey } from '@logto/phrases';

import Box from '@/assets/icons/box.svg?react';
import { githubIssuesLink } from '@/consts';
import Button from '@/ds-components/Button';
import DsModalHeader from '@/ds-components/ModalHeader';

import styles from './index.module.scss';

type Props = {
  readonly title: AdminConsoleKey;
  readonly subtitle: AdminConsoleKey;
  readonly buttonText: AdminConsoleKey;
  readonly onClose: () => void;
};

function ModalHeader({ title, subtitle, buttonText, onClose }: Props) {
  return (
    <DsModalHeader
      title={title}
      subtitle={subtitle}
      actionButton={
        <Button
          className={styles.requestSdkButton}
          type="outline"
          icon={<Box />}
          title={buttonText}
          onClick={() => {
            window.open(githubIssuesLink, '_blank');
          }}
        />
      }
      onClose={onClose}
    />
  );
}

export default ModalHeader;
