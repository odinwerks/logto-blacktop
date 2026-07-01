const connector_details = {
  page_title: 'Connector details',
  back_to_connectors: 'Back to connectors',
  check_readme: 'Check README',
  settings: 'General settings',
  settings_description:
    'Integrate third-party providers for quick social sign-in and social account linking',
  setting_description_with_token_storage_supported:
    'Integrate third-party providers for quick social sign-in, social account linking, and API access.',
  email_connector_settings_description:
    'Integrate with your email delivery provider to enable passwordless email registration and sign-in for end-users.',
  parameter_configuration: 'Parameter configuration',
  test_connection: 'Test',
  save_error_empty_config: 'Please enter config',
  send: 'Send',
  select_template: 'Template',
  select_language: 'Language',
  send_error_invalid_format: 'Invalid input',
  edit_config_label: 'Enter your JSON here',
  test_email_sender: 'Test your email connector',
  test_sms_sender: 'Test your SMS connector',
  test_email_placeholder: 'john.doe@example.com',
  test_sms_placeholder: '+1 555-123-4567',
  test_message_sent: 'Test message sent',
  test_sender_description:
    'Logto uses the "Generic" template for testing. You will receive a message if your connector is rightly configured.',
  options_change_email: 'Change email connector',
  options_change_sms: 'Change SMS connector',
  connector_deleted: 'The connector has been successfully deleted',
  type_email: 'Email connector',
  type_sms: 'SMS connector',
  type_social: 'Social connector',
  in_used_social_deletion_description:
    'This connector is in-use in your sign in experience. By deleting, <name/> sign in experience will be deleted in sign in experience settings. You will need to reconfigure it if you decide to add it back.',
  in_used_passwordless_deletion_description:
    'This {{name}} is in-use in your sign-in experience. By deleting, your sign-in experience will not work properly until you resolve the conflict. You will need to reconfigure it if you decide to add it back.',
  deletion_description:
    'You are removing this connector. It cannot be undone, and you will need to reconfigure it if you decide to add it back.',
  logto_email: {
    total_email_sent: 'Total email sent: {{value, number}}',
    total_email_sent_tip:
      'Logto utilizes SendGrid for secure and stable built-in email. It’s completely free to use. <a>Learn more</a>',
    email_template_title: 'Email Template',
    template_description:
      'Built-in email uses default templates for seamless delivery of verification emails. No configuration is required, and you can customize basic brand information.',
    template_description_link_text: 'View templates',
    description_action_text: 'View templates',
    from_email_field: 'From email',
    sender_name_field: 'Sender name',
    sender_name_tip:
      'Customize the sender name for emails. If left empty, "Verification" will be used as the default name.',
    sender_name_placeholder: 'Your sender name',
    company_information_field: 'Company information',
    company_information_description:
      'Display your company name, address, or zip code in the bottom of emails to enhance authenticity.',
    company_information_placeholder: "Your company's basic information",
    email_logo_field: 'Email logo',
    email_logo_tip:
      'Display your brand logo in the top of emails. Use the same image for both light mode and dark mode.',
    urls_not_allowed: 'URLs are not allowed',
    test_notes: 'Logto uses the “Generic” template for testing.',
  },
  email_templates: {
    card_title: 'Email templates',
    description:
      'Customize the subject, content, and sender of verification and notification emails for each supported language. These templates apply to all email connectors; Logto automatically falls back to your default language when a localized template is missing.',
    manage_button: 'Manage templates',
    empty_state:
      'No email templates for this language yet. Fill in a subject and content for any template type to create one.',
    fallback_hint: 'Falls back to {{language}} when this template is empty.',
    subject: 'Subject',
    content: 'Content',
    content_type: 'Content type',
    reply_to: 'Reply-to',
    send_from: 'Send from',
    text_version: 'Plain-text version',
    delete_language: 'Delete language',
    delete_language_confirmation:
      'Are you sure you want to delete all email templates for this language? This action cannot be undone.',
    save_language: 'Save',
  },
  template_editor: {
    template_translations_available: 'Template translations available',
    add_localizations: 'Add localizations',
    add_key: 'Add key',
    key: 'Key',
    value: 'Value',
    delivery_templates: 'Delivery templates',
    test_template: 'Test',
    edit_translations: 'Edit translations',
    delete_language: 'Delete language',
    close: 'Close',
    content_placeholder:
      'Use {{code}} for the payload value and {{t.key}} for localized text from the translations dictionary.',
    subject_placeholder: 'Email subject (supports {{code}} and {{t.key}})',
    no_translation_keys:
      'No translation keys yet. Add {{t.key}} placeholders to a template above to start localizing.',
    alias: 'Template alias',
    alias_placeholder: 'Provider template alias',
    alias_hint:
      'This usage type references a provider-stored template; the per-language translations dictionary does not apply.',
    provider_template_hint:
      'This usage type uses a provider-stored template; only the subject is editable here.',
    apply: 'Apply',
    form_mode: 'Form',
    json_mode: 'JSON',
    translations_for_language: 'Translations for {{language}}',
    json_merge_hint: 'Paste a JSON object of translation key → string value to merge.',
    invalid_json_format: 'The JSON is not valid. Fix the syntax and try again.',
    json_must_be_object: 'Translations must be a JSON object (for example, {}).',
    json_values_must_be_strings: 'All translation values must be strings.',
  },
  unified_editor: {
    mode_classic: 'Classic per-type',
    mode_unified: 'Unified',
    mode_unified_hint:
      'Author one template plus optional <If type="UsageType"> blocks, variables, and per-language localizations. Compiled into the connector per-type rows on save (dev feature).',
    tab_template: 'Template',
    tab_variables: 'Variables',
    tab_localizations: 'Localizations',
    template: 'Unified template',
    variables: 'Variables',
    localizations: 'Localizations',
    preview: 'Preview',
    preview_as_type: 'Preview as type',
    preview_language: 'Preview language',
    parse_error:
      'The template has invalid <If> blocks (nested, unclosed, self-closing, or with attributes other than type).',
    add_variable: 'Add variable',
    variable_key_prompt: 'Enter variable key',
    delete_variable: 'Delete variable',
    no_variables: 'No variables yet. Add one to reuse a value across template types.',
    no_languages: 'No languages yet. Add one to start localizing.',
    json_merge_hint: 'Paste a JSON object of key → value (string) to merge.',
    invalid_json_format: 'The JSON is not valid. Fix the syntax and try again.',
    json_must_be_object: 'The value must be a JSON object (for example, {}).',
    json_values_must_be_strings: 'All values must be strings.',
    subject_settings: 'Subject settings',
  },
  google_one_tap: {
    title: 'Google One Tap',
    description: 'Google One Tap is a secure and easy way for users to sign in to your website.',
    enable_google_one_tap: 'Enable Google One Tap',
    enable_google_one_tap_description:
      "Enable Google One Tap in your sign-in experience: Let users quickly sign up or sign in with their Google account if they're already signed in on their device.",
    configure_google_one_tap: 'Configure Google One Tap',
    auto_select: 'Auto-select credential if possible',
    close_on_tap_outside: 'Cancel the prompt if user click/tap outside',
    itp_support: 'Enable <a>Upgraded One Tap UX on ITP browsers</a>',
  },
  sign_in_experience: {
    in_use: 'Enabled for sign-in ',
    not_in_use: 'Disabled for sign-in ',
  },
};

export default Object.freeze(connector_details);
