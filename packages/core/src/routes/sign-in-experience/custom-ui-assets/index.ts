import { readFile } from 'node:fs/promises';

import { uploadFileGuard, maxUploadFileSize, adminTenantId } from '@logto/schemas';
import { generateStandardId } from '@logto/shared';
import { object, z } from 'zod';

import RequestError from '#src/errors/RequestError/index.js';
import koaGuard from '#src/middleware/koa-guard.js';
import SystemContext from '#src/tenants/SystemContext.js';
import assertThat from '#src/utils/assert-that.js';
import { getConsoleLogFromContext } from '#src/utils/console.js';
import { buildStorage } from '#src/utils/storage/index.js';
import { getTenantId } from '#src/utils/tenant.js';

import { type ManagementApiRouter, type RouterInitArgs } from '../../types.js';

import { unzipCustomUiAssets } from './unzip.js';

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

      const storage = buildStorage(storageProviderConfig);
      const customUiAssetId = generateStandardId(8);

      try {
        const data = await readFile(file.filepath);

        // Blacktop: self-hosted deployments unzip straight into the configured storage, which is
        // also what the custom-UI serve middleware reads from. Bounded inflate, entry caps and
        // path sanitization match upstream's unzip (previously an Azure function).
        await unzipCustomUiAssets(data, `${tenantId}/${customUiAssetId}`, storage.uploadFile);
      } catch (error: unknown) {
        if (error instanceof RequestError) {
          throw error;
        }

        getConsoleLogFromContext(ctx).error(error);
        throw new RequestError(
          { code: 'storage.upload_error', status: 500 },
          { details: error instanceof Error ? error.message : String(error) }
        );
      }

      ctx.body = { customUiAssetId };
      return next();
    }
  );
}
