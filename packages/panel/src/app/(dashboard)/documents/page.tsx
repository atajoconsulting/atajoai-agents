import { DocumentsClient } from "@/components/app/documents-client";
import { requireSession } from "@/lib/auth-helpers";

export default async function DocumentsPage() {
  const session = await requireSession();
  const canWrite =
    session.user.role === "admin" || session.user.role === "editor";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Documentos</h1>
        <p className="text-sm text-muted-foreground">
          Gestiona URLs y archivos que alimentan el conocimiento del agente.
        </p>
      </div>
      <DocumentsClient canWrite={canWrite} />
    </div>
  );
}
