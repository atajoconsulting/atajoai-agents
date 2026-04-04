import { chatwootRoutes } from './chatwoot';
import { configRoutes } from './config';
import { documentsRoutes } from './documents';

export const apiRoutes = [
  ...chatwootRoutes,
  ...configRoutes,
  ...documentsRoutes,
];
