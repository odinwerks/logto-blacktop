import { readFile } from 'node:fs/promises';

import { uploadFileGuard, maxUploadFileSize, adminTenantId } from '@logto/schemas';
import { generateStandardId } from '@logto/shared';
import AdmZip from 'adm-zip';
import { object, z } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';
import { buildUploadFile } from '#src/utils/storage/index.js';
import { getTenantId } from '#src/utils/tenant.js';

import { type ManagementApiRouter, type RouterInitArgs } from '../../types.js';

export default function customUiAssetsRoutes<T extends ManagementApiRouter>(
  ...[router]: RouterInitArgs<T>
) {
  router.post(
    '/sign-in-exp/default/custom-ui-assets',
    koaGuard({
      files: object({
        file: uploadFileGuard.array().min(1).max(1),
      }),
      response: z.object({
        customUiAssetId: z.string(),
      }),
      status: [200, 400, 500],
    }),
    async (ctx, next) => {
      const { file: bodyFiles } = ctx.guard.files;
      const file = bodyFiles[0];

      assertThat(file, 'guard.invalid_input');
      assertThat(file.size <= maxUploadFileSize, 'guard.file_size_exceeded');
      assertThat(file.mimetype === 'application/zip', 'guard.mime_type_not_allowed');

      const [tenantId] = await getTenantId(ctx.URL);
      assertThat(tenantId, 'guard.can_not_get_tenant_id');
      assertThat(tenantId !== adminTenantId, 'guard.not_allowed_for_admin_tenant');

      const { storageProviderConfig } = SystemContext.shared;
      assertThat(storageProviderConfig, 'storage.not_configured', 500);

      const storage = buildUploadFile(storageProviderConfig);
      const customUiAssetId = generateStandardId(8);

      try {
        const zipBuffer = await readFile(file.filepath);
        const zip = new AdmZip(zipBuffer);
        const entries = zip.getEntries().filter((entry) => !entry.isDirectory);

        await Promise.all(
          entries.map(async (entry) => {
            const objectKey = `${tenantId}/${customUiAssetId}/${entry.entryName}`;
            const content = entry.getData();
            await storage.uploadFile(content, objectKey, {
              publicUrl: storageProviderConfig.publicUrl,
            });
          })
        );
      } catch (error: unknown) {
        getConsoleLogFromContext(ctx).error(error);
        throw new RequestError({ code: 'storage.upload_error', status: 500 });
      }

      ctx.body = { customUiAssetId };
      return next();
    }
  );
}
