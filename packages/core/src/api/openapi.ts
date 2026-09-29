const success = { description: 'Successful ICRLogin local API response' } as const;
const operation = (summary: string) => ({ summary, responses: { '200': success } });

export const LOCAL_API_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'ICRLogin Local API',
    version: '1.0.0',
    description: 'Localhost-only API for ICRLogin profile and Chromium automation.'
  },
  servers: [{ url: 'http://127.0.0.1:9495' }],
  security: [{ bearerAuth: [] }, {}],
  paths: {
    '/api/v1/health': { get: { ...operation('Health'), security: [] } },
    '/api/v1/profiles': { get: operation('List profiles'), post: operation('Create profile') },
    '/api/v1/profiles/{id}': { get: operation('Get profile'), patch: operation('Update profile'), delete: operation('Soft delete profile') },
    '/api/v1/profiles/{id}/start': { post: operation('Start profile Chromium') },
    '/api/v1/profiles/{id}/stop': { post: operation('Stop profile Chromium') },
    '/api/v1/profiles/{id}/restart': { post: operation('Restart profile Chromium') },
    '/api/v1/processes': { get: operation('List managed Chromium processes') },
    '/api/v1/groups': { get: operation('List groups'), post: operation('Create group') },
    '/api/v1/groups/{id}': { patch: operation('Rename group'), delete: operation('Delete group') },
    '/api/v1/proxies': { get: operation('List proxies'), post: operation('Create proxy') },
    '/api/v1/proxies/{id}': { patch: operation('Update proxy'), delete: operation('Delete proxy') },
    '/api/v1/proxies/{id}/test': { post: operation('Test proxy TCP reachability') },
    '/api/v1/browsers': { get: operation('List managed browser versions') },
    '/api/v1/browsers/{version}/download': { post: operation('Download managed browser version') },
    '/api/v1/browsers/{version}': { delete: operation('Remove unused browser version') },
    '/api/v1/openapi.json': { get: { ...operation('OpenAPI document'), security: [] } }
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'Optional when a local API token is configured.' }
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } }
      },
      ProcessRecord: {
        type: 'object',
        required: ['profileId', 'state', 'pid', 'browserVersion', 'remoteDebuggingPort', 'cdpHttpUrl', 'webSocketDebuggerUrl', 'startedAt'],
        properties: {
          profileId: { type: 'string', format: 'uuid' }, state: { type: 'string' }, pid: { type: 'integer' },
          browserVersion: { type: 'string' }, remoteDebuggingPort: { type: 'integer' }, cdpHttpUrl: { type: 'string' },
          webSocketDebuggerUrl: { type: 'string' }, startedAt: { type: 'string' }
        }
      }
    }
  }
} as const;
