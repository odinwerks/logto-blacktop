import type { EmailTemplateDetails } from '@logto/connector-kit';
import { useEffect, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';

import CodeEditor from '@/ds-components/CodeEditor';
import FormField from '@/ds-components/FormField';
import Select, { type Option } from '@/ds-components/Select';
import TextInput from '@/ds-components/TextInput';
import Textarea from '@/ds-components/Textarea';

import styles from './EmailTemplateDetailsForm.module.scss';
import { contentTypeOptions } from './utils';

type Props = {
  readonly defaultValue: EmailTemplateDetails;
  /** Fired with the latest form values whenever they change (not on mount). */
  readonly onChange: (details: EmailTemplateDetails) => void;
};

const contentTypeSelectOptions: Array<Option<string>> = contentTypeOptions.map((value) => ({
  value,
  title: value,
}));

/**
 * Form for a single `(languageTag, templateType)` email template.
 *
 * Controlled from the parent via `defaultValue` (seeded on mount) + `onChange` (emitted on edits).
 * The parent keys this component by template type, so switching tabs remounts it with the new
 * seed — and edits are propagated back on every change so the parent's per-type draft never goes
 * stale before a remount.
 *
 * Validation mirrors {@link emailTemplateDetailsGuard} manually (`@hookform/resolvers` is not a
 * console dependency). `subject` and `content` are required (live `onChange` errors); `contentType`
 * is a fixed two-value enum; `replyTo`/`sendFrom` are optional. The stricter "non-empty" check
 * (not just "is a string") is enforced at save time in the parent via `isDetailsEmpty`.
 */
function EmailTemplateDetailsForm({ defaultValue, onChange }: Props) {
  const {
    control,
    register,
    watch,
    formState: { errors },
  } = useForm<EmailTemplateDetails>({
    defaultValues: defaultValue,
    mode: 'onChange',
  });

  const formValues = watch();
  const lastEmitted = useRef<EmailTemplateDetails>(defaultValue);

  // Propagate edits up; the `lastEmitted` guard prevents a render loop (RHF snapshots are not
  // referentially stable) and avoids falsely firing `onChange` on mount.
  useEffect(() => {
    if (JSON.stringify(formValues) !== JSON.stringify(lastEmitted.current)) {
      // eslint-disable-next-line @silverhand/fp/no-mutation -- ref.current mutation is the standard React escape hatch (matches hooks/use-debounce).
      lastEmitted.current = formValues;
      onChange(formValues);
    }
  }, [formValues, onChange]);

  const { contentType } = formValues;
  const isHtml = contentType !== 'text/plain';

  return (
    <div className={styles.form}>
      <FormField isRequired title="connector_details.email_templates.subject">
        <TextInput {...register('subject', { required: true })} error={Boolean(errors.subject)} />
      </FormField>
      <FormField title="connector_details.email_templates.content_type">
        <Controller
          control={control}
          name="contentType"
          render={({ field }) => (
            <Select
              value={field.value}
              options={contentTypeSelectOptions}
              onChange={field.onChange}
            />
          )}
        />
      </FormField>
      <FormField isRequired title="connector_details.email_templates.content">
        <Controller
          control={control}
          name="content"
          rules={{ required: true }}
          render={({ field, fieldState: { error } }) =>
            isHtml ? (
              <CodeEditor
                language="html"
                value={field.value}
                error={Boolean(error)}
                onChange={field.onChange}
              />
            ) : (
              <Textarea
                className={styles.content}
                value={field.value}
                error={Boolean(error)}
                onChange={(event) => {
                  field.onChange(event.currentTarget.value);
                }}
              />
            )
          }
        />
      </FormField>
      <FormField title="connector_details.email_templates.reply_to">
        <TextInput {...register('replyTo')} />
      </FormField>
      <FormField title="connector_details.email_templates.send_from">
        <TextInput {...register('sendFrom')} />
      </FormField>
    </div>
  );
}

export default EmailTemplateDetailsForm;
