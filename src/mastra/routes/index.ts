import { chatwootConfigRoutes } from "./chatwoot-config";
import { chatwootDocumentRoutes } from "./chatwoot-documents";
import { chatwootGlobalRoutes } from "./chatwoot-global";
import { chatwootHealthRoutes } from "./chatwoot-health";
import { chatwootRoutes } from "./chatwoot";
import { chatwootTenantRoutes } from "./chatwoot-tenant";

export const apiRoutes = [
  ...chatwootRoutes,
  // Static /chatwoot/global/config must be registered before the dynamic
  // /chatwoot/:tenantId/config, otherwise "global" is captured as a tenantId
  // and the request hits the tenant config route (rejected as invalid payload).
  ...chatwootGlobalRoutes,
  ...chatwootConfigRoutes,
  ...chatwootDocumentRoutes,
  ...chatwootHealthRoutes,
  ...chatwootTenantRoutes,
];
