"use client";

import { useState } from "react";
import type { AppConfig } from "@atajoai/db";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { configFormSchema, type ConfigFormValues } from "@/features/config/schema";

function emptyToNull(value?: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type Props = {
  config: AppConfig;
  hasExistingToken: boolean;
};

export function ConfigForm({ config, hasExistingToken }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [tokenExists, setTokenExists] = useState(hasExistingToken);
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      orgName: config.orgName,
      orgPhone: config.orgPhone,
      orgSchedule: config.orgSchedule,
      orgAddress: config.orgAddress,
      orgWebsite: config.orgWebsite,
      orgEOffice: config.orgEOffice,
      preferredLang: config.preferredLang,
      channel: config.channel,
      responseStyle: config.responseStyle,
      customInstructions: config.customInstructions,
      greetingMessage: config.greetingMessage,
      outOfScopeMessage: config.outOfScopeMessage,
      llmModel: config.llmModel,
      llmModelMedium: config.llmModelMedium,
      llmModelSmall: config.llmModelSmall,
      embedModel: config.embedModel,
      retrievalTopK: config.retrievalTopK,
      retrievalFinalK: config.retrievalFinalK,
      chatwootBaseUrl: config.chatwootBaseUrl,
      chatwootApiToken: config.chatwootApiToken,
      enableHandoff: config.enableHandoff,
      handoffTeamId: config.handoffTeamId,
      handoffAssigneeId: config.handoffAssigneeId,
    },
  });

  async function onSubmit(values: ConfigFormValues) {
    setIsSaving(true);

    const response = await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...values,
        orgPhone: emptyToNull(values.orgPhone),
        orgSchedule: emptyToNull(values.orgSchedule),
        orgAddress: emptyToNull(values.orgAddress),
        orgWebsite: emptyToNull(values.orgWebsite),
        orgEOffice: emptyToNull(values.orgEOffice),
        customInstructions: emptyToNull(values.customInstructions),
        greetingMessage: emptyToNull(values.greetingMessage),
        outOfScopeMessage: emptyToNull(values.outOfScopeMessage),
        llmModel: emptyToNull(values.llmModel),
        llmModelMedium: emptyToNull(values.llmModelMedium),
        llmModelSmall: emptyToNull(values.llmModelSmall),
        embedModel: emptyToNull(values.embedModel),
        chatwootBaseUrl: emptyToNull(values.chatwootBaseUrl),
        chatwootApiToken: values.chatwootApiToken?.trim() ? values.chatwootApiToken.trim() : undefined,
        handoffTeamId: values.enableHandoff ? values.handoffTeamId : null,
        handoffAssigneeId: values.enableHandoff ? values.handoffAssigneeId : null,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      toast.error(payload?.error ?? "No se pudo guardar la configuración");
      return;
    }

    toast.success("Configuración guardada");
  }

  async function handleClearToken() {
    setIsSaving(true);
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatwootApiToken: null }),
    });
    setIsSaving(false);

    if (!response.ok) {
      toast.error("No se pudo borrar el token");
      return;
    }

    setTokenExists(false);
    toast.success("Token eliminado");
  }

  async function handleChatwootTest() {
    setIsTesting(true);
    const response = await fetch("/api/config/test-chatwoot", {
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setIsTesting(false);

    if (!response.ok || !payload?.ok) {
      toast.error(payload?.error ?? "No se pudo probar la conexión con Chatwoot");
      return;
    }

    toast.success("Conexión con Chatwoot verificada");
  }

  return (
    <form className="grid gap-6" onSubmit={form.handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Identidad institucional</CardTitle>
          <CardDescription>Datos que usan el agente y los mensajes de fallback.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="orgName">Organización</Label>
            <Input id="orgName" {...form.register("orgName")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgPhone">Teléfono</Label>
            <Input id="orgPhone" {...form.register("orgPhone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferredLang">Idioma preferido</Label>
            <Input id="preferredLang" {...form.register("preferredLang")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgSchedule">Horario</Label>
            <Input id="orgSchedule" {...form.register("orgSchedule")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="channel">Canal principal</Label>
            <Select
              defaultValue={config.channel}
              onValueChange={(value) => form.setValue("channel", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="web">Web</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="orgAddress">Dirección</Label>
            <Input id="orgAddress" {...form.register("orgAddress")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgWebsite">Web</Label>
            <Input id="orgWebsite" {...form.register("orgWebsite")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="orgEOffice">Sede electrónica</Label>
            <Input id="orgEOffice" {...form.register("orgEOffice")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comportamiento del agente</CardTitle>
          <CardDescription>Modelos, estilo de respuesta y recuperación documental.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="responseStyle">Estilo de respuesta</Label>
            <Select
              defaultValue={config.responseStyle}
              onValueChange={(value) => form.setValue("responseStyle", value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="brief_structured">Brief structured</SelectItem>
                <SelectItem value="brief_plain">Brief plain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="embedModel">Modelo embeddings</Label>
            <Input id="embedModel" {...form.register("embedModel")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llmModel">Modelo principal</Label>
            <Input id="llmModel" {...form.register("llmModel")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llmModelMedium">Modelo medio</Label>
            <Input id="llmModelMedium" {...form.register("llmModelMedium")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llmModelSmall">Modelo pequeño</Label>
            <Input id="llmModelSmall" {...form.register("llmModelSmall")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retrievalTopK">Retrieval top K</Label>
            <Input id="retrievalTopK" type="number" {...form.register("retrievalTopK")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retrievalFinalK">Retrieval final K</Label>
            <Input id="retrievalFinalK" type="number" {...form.register("retrievalFinalK")} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="customInstructions">Instrucciones personalizadas</Label>
            <Textarea id="customInstructions" rows={5} {...form.register("customInstructions")} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="greetingMessage">Mensaje de bienvenida</Label>
            <Textarea id="greetingMessage" rows={3} {...form.register("greetingMessage")} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="outOfScopeMessage">Mensaje fuera de alcance</Label>
            <Textarea id="outOfScopeMessage" rows={3} {...form.register("outOfScopeMessage")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chatwoot y handoff</CardTitle>
          <CardDescription>Credenciales operativas y reglas de derivación.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="chatwootBaseUrl">Base URL Chatwoot</Label>
            <Input id="chatwootBaseUrl" {...form.register("chatwootBaseUrl")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chatwootApiToken">API token Chatwoot</Label>
            <Input
              id="chatwootApiToken"
              type="password"
              placeholder={hasExistingToken ? "Token configurado (dejar vacío para no cambiar)" : "Sin token configurado"}
              {...form.register("chatwootApiToken")}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4 md:col-span-2">
            <div>
              <p className="font-medium">Activar derivación a humano</p>
              <p className="text-sm text-muted-foreground">
                Permite asignar la conversación a equipo o agente cuando aplique.
              </p>
            </div>
            <Switch
              checked={form.watch("enableHandoff")}
              onCheckedChange={(checked) => form.setValue("enableHandoff", checked)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="handoffTeamId">Team ID</Label>
            <Input id="handoffTeamId" type="number" {...form.register("handoffTeamId")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="handoffAssigneeId">Assignee ID</Label>
            <Input id="handoffAssigneeId" type="number" {...form.register("handoffAssigneeId")} />
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            {tokenExists && (
              <Button disabled={isSaving} onClick={handleClearToken} type="button" variant="destructive">
                Borrar token
              </Button>
            )}
            <Button disabled={isTesting} onClick={handleChatwootTest} type="button" variant="outline">
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Probar Chatwoot"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}
