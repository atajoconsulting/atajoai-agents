import { chatwootConfigRoutes } from "./chatwoot-config";
import { chatwootDocumentRoutes } from "./chatwoot-documents";
import { chatwootHealthRoutes } from "./chatwoot-health";
import { chatwootRoutes } from "./chatwoot";

export const apiRoutes = [
  ...chatwootRoutes,
  ...chatwootConfigRoutes,
  ...chatwootDocumentRoutes,
  ...chatwootHealthRoutes,
];
