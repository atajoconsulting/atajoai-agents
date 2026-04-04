import { getAppConfig } from "@atajoai/db";
import { ConfigForm } from "@/components/app/config-form";

export default async function ConfigPage() {
  const config = await getAppConfig();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Ajusta identidad, comportamiento del agente y credenciales operativas.
        </p>
      </div>
      <ConfigForm
        config={{ ...config, chatwootApiToken: null }}
        hasExistingToken={Boolean(config.chatwootApiToken)}
      />
    </div>
  );
}
