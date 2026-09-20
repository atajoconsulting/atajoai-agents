const DEFAULT_ORG_NAME = "Ayuntamiento";

export const DEFAULT_CONFIG = {
  orgName: DEFAULT_ORG_NAME,
  orgPhone: "010",
  orgSchedule: "lunes a viernes de 9:00 a 14:00",
  orgAddress: "Plaza Mayor, 1",
  orgWebsite: "https://www.ayuntamiento.es",
  orgEOffice: "https://sede.ayuntamiento.es",
  preferredLang: "Español",
  responseStyle: "brief_structured" as const,
  llmModel: "mistral/mistral-medium-3-5",
  llmModelSmall: "mistral/mistral-small-2603",
  embedModel: "mistral/mistral-embed",
  retrievalTopK: 12,
  retrievalMinScore: 0.35,
  retrievalFinalK: 4,
  greetingMessage: [
    `Hola, soy el asistente virtual de información local del ${DEFAULT_ORG_NAME}.`,
    "Puedo ayudarle con trámites, servicios, instalaciones, eventos y recursos del municipio.",
    "La información proporcionada está sujeta a posibles cambios o incidencias de última hora.",
    "¿En qué puedo ayudarle?",
  ].join(" "),
  outOfScopeMessage: `Disculpe, solo puedo ayudarle con información factual del ${DEFAULT_ORG_NAME} y de la vida local del municipio. Si lo desea, puedo orientarle sobre servicios, instalaciones, eventos o recursos locales.`,
  enableHandoff: false,
  handoffTeamId: null as number | null,
  handoffAssigneeId: null as number | null,
};
