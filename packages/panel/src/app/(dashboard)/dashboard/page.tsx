import { prisma } from "@atajoai/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const [totalDocuments, indexedDocuments, errorDocuments, pendingDocuments, recentDocuments, config] =
    await Promise.all([
      prisma.indexedDocument.count(),
      prisma.indexedDocument.count({ where: { status: "indexed" } }),
      prisma.indexedDocument.count({ where: { status: "error" } }),
      prisma.indexedDocument.count({
        where: { status: { in: ["pending", "indexing", "deleting"] } },
      }),
      prisma.indexedDocument.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      prisma.appConfig.findUnique({ where: { id: 1 } }),
    ]);

  const cards = [
    { label: "Documentos totales", value: totalDocuments },
    { label: "Indexados", value: indexedDocuments },
    { label: "Con error", value: errorDocuments },
    { label: "En proceso", value: pendingDocuments },
  ];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Estado del sistema</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Configuración principal cargada desde base de datos.</p>
            <p>Chatwoot: {config?.chatwootBaseUrl ? "configurado" : "pendiente"}</p>
            <p>RAG: {config?.embedModel ? "modelo configurado" : "sin modelo configurado"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimos documentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            {recentDocuments.map((document) => (
              <div className="flex items-center justify-between" key={document.id}>
                <div>
                  <p className="font-medium text-foreground">{document.title ?? document.source}</p>
                  <p>{document.sourceType}</p>
                </div>
                <p className="uppercase tracking-[0.16em]">{document.status}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
