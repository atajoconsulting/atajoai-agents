"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Loader2, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DocumentRecord = {
  id: string;
  source: string;
  sourceType: string;
  title: string | null;
  status: string;
  chunkCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "indexed") {
    return "default";
  }

  if (status === "error") {
    return "destructive";
  }

  if (status === "deleting") {
    return "outline";
  }

  return "secondary";
}

type ClientProps = {
  canWrite: boolean;
};

export function DocumentsClient({ canWrite }: ClientProps) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUrlDialogOpen, setIsUrlDialogOpen] = useState(false);

  async function loadDocuments() {
    const response = await fetch("/api/documents", {
      cache: "no-store",
    });
    const payload = (await response.json()) as { documents: DocumentRecord[] };
    setDocuments(payload.documents);
    setIsLoading(false);
  }

  useEffect(() => {
    void loadDocuments();
    const interval = window.setInterval(() => {
      void loadDocuments();
    }, 5000);

    return () => window.clearInterval(interval);
  }, []);

  const columns = useMemo<ColumnDef<DocumentRecord>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Documento",
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.title ?? "Sin título"}</p>
            <p className="text-xs text-muted-foreground">{row.original.source}</p>
          </div>
        ),
      },
      {
        accessorKey: "sourceType",
        header: "Tipo",
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => <Badge variant={statusVariant(row.original.status)}>{row.original.status}</Badge>,
      },
      {
        accessorKey: "chunkCount",
        header: "Chunks",
      },
      ...(canWrite
        ? [
            {
              id: "actions",
              header: "",
              cell: ({ row }: { row: { original: DocumentRecord } }) => (
                <Button
                  disabled={row.original.status === "deleting"}
                  onClick={() => void handleDelete(row.original.id)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ),
            } satisfies ColumnDef<DocumentRecord>,
          ]
        : []),
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: documents,
    getCoreRowModel: getCoreRowModel(),
  });

  async function handleUrlSubmit(formData: FormData) {
    setIsSubmittingUrl(true);
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: String(formData.get("title") ?? "").trim() || undefined,
        url: String(formData.get("url") ?? ""),
      }),
    });

    setIsSubmittingUrl(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "No se pudo encolar la URL");
      return;
    }

    toast.success("Indexación URL encolada");
    setIsUrlDialogOpen(false);
    await loadDocuments();
  }

  async function handleUpload(formData: FormData) {
    setIsUploading(true);
    const response = await fetch("/api/documents/upload", {
      method: "POST",
      body: formData,
    });

    setIsUploading(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "No se pudo subir el documento");
      return;
    }

    toast.success("Documento subido e indexación encolada");
    await loadDocuments();
  }

  async function handleDelete(documentId: string) {
    const response = await fetch(`/api/documents/${documentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "No se pudo encolar el borrado");
      return;
    }

    toast.success("Borrado encolado");
    await loadDocuments();
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Documentos indexados</CardTitle>
            <CardDescription>
              La tabla se refresca automáticamente para reflejar `pending`, `indexing`, `indexed`,
              `deleting` y `error`.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => void loadDocuments()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refrescar
            </Button>
            {canWrite && <Dialog onOpenChange={setIsUrlDialogOpen} open={isUrlDialogOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Indexar URL
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Indexar URL</DialogTitle>
                  <DialogDescription>
                    Crea el registro y encola el crawl/indexado en Mastra.
                  </DialogDescription>
                </DialogHeader>
                <form action={handleUrlSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Título</Label>
                    <Input id="title" name="title" placeholder="Opcional" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="url">URL</Label>
                    <Input id="url" name="url" placeholder="https://..." required />
                  </div>
                  <DialogFooter>
                    <Button disabled={isSubmittingUrl} type="submit">
                      {isSubmittingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encolar"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>}
          </div>
        </CardHeader>
        <CardContent>
          {canWrite && (
            <form action={handleUpload} className="mb-6 grid gap-4 rounded-xl border border-dashed p-4 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="file">Subir archivo</Label>
                <Input id="file" name="file" required type="file" />
              </div>
              <Button disabled={isUploading} type="submit">
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Subir e indexar
              </Button>
            </form>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando documentos...
            </div>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell className="py-10 text-center text-muted-foreground" colSpan={columns.length}>
                      No hay documentos todavía.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
