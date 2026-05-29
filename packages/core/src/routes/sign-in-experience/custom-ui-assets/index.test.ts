import { StorageProvider } from '@logto/schemas';
import { createMockUtils, pickDefault } from '@logto/shared/esm';
import AdmZip from 'adm-zip';

import SystemContext from '#src/tenants/SystemContext.js';
import { MockTenant } from '#src/test-utils/tenant.js';
import { createRequester } from '#src/utils/test-utils.js';

const { jest } = import.meta;
const { mockEsmWithActual } = createMockUtils(jest);

const storageProviderConfig = {
  provider: StorageProvider.S3Storage as StorageProvider.S3Storage,
  bucket: 'test-bucket',
  accessKeyId: 'key',
  accessSecretKey: 'secret',
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
};

// eslint-disable-next-line @silverhand/fp/no-mutation
SystemContext.shared.storageProviderConfig = storageProviderConfig;

const mockUploadFile = jest.fn(async () => ({ url: 'http://localhost:9000/test-bucket/key' }));

await mockEsmWithActual('#src/utils/storage/index.js', () => ({
  buildUploadFile: jest.fn(() => ({
    uploadFile: mockUploadFile,
  })),
}));

await mockEsmWithActual('@logto/shared', () => ({
  generateStandardId: jest.fn().mockReturnValue('testid12'),
}));

await mockEsmWithActual('#src/utils/tenant.js', () => ({
  getTenantId: jest.fn().mockResolvedValue(['default']),
}));

const customUiAssetsRoutes = await pickDefault(import('./index.js'));

const buildZipBuffer = (entries: Record<string, string>) => {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
};

describe('POST /sign-in-exp/default/custom-ui-assets', () => {
  const tenantContext = new MockTenant();
  const request = createRequester({ authedRoutes: customUiAssetsRoutes, tenantContext });

  beforeEach(() => {
    mockUploadFile.mockClear();
  });

  it('should upload each file extracted from the zip', async () => {
    const zipBuffer = buildZipBuffer({
      'index.html': '<html></html>',
      'scripts/main.js': 'console.log("hi")',
    });

    const response = await request
      .post('/sign-in-exp/default/custom-ui-assets')
      .attach('file', zipBuffer, { filename: 'ui.zip', contentType: 'application/zip' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('customUiAssetId');
    expect(mockUploadFile).toHaveBeenCalledTimes(2);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploadedKeys = mockUploadFile.mock.calls.map((args: any[]) => args[1]);
    expect(uploadedKeys).toContain('default/testid12/index.html');
    expect(uploadedKeys).toContain('default/testid12/scripts/main.js');
  });

  it('should reject non-zip files', async () => {
    const response = await request
      .post('/sign-in-exp/default/custom-ui-assets')
      .attach('file', Buffer.from('not a zip'), { filename: 'ui.txt', contentType: 'text/plain' });

    expect(response.status).toBe(400);
  });

  it('should reject files exceeding maxUploadFileSize', async () => {
    const largeBuffer = Buffer.alloc(1024 * 1024 * 21); // 21 MB (> 20 MB limit)
    const response = await request
      .post('/sign-in-exp/default/custom-ui-assets')
      .attach('file', largeBuffer, { filename: 'ui.zip', contentType: 'application/zip' });

    expect(response.status).toBe(400);
  });

  it('should return 500 if storage not configured', async () => {
    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = undefined;

    const zipBuffer = buildZipBuffer({ 'index.html': '<html></html>' });
    const response = await request
      .post('/sign-in-exp/default/custom-ui-assets')
      .attach('file', zipBuffer, { filename: 'ui.zip', contentType: 'application/zip' });

    expect(response.status).toBe(500);

    // eslint-disable-next-line @silverhand/fp/no-mutation
    SystemContext.shared.storageProviderConfig = storageProviderConfig;
  });
});
