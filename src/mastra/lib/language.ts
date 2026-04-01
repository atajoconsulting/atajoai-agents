import { loadModule } from "cld3-asm";

const SUPPORTED_LANGS = new Set([
  "es", // Spanish / Castellano
  "ca", // Catalan / Valencian
  "gl", // Galician
  "eu", // Basque / Euskera
  "en", // English
  "fr", // French
  "de", // German
  "pt", // Portuguese
  "it", // Italian
  "ro", // Romanian
  "nl", // Dutch
  "ar", // Arabic
  "zh", // Chinese
]);

const cldPromise = loadModule();

export async function detectLang(text: string): Promise<string | null> {
  if (!text.trim()) return null;

  const cld = await cldPromise;
  const identifier = cld.create();

  const result = identifier.findLanguage(text);
  identifier.dispose();

  if (!result.is_reliable) return null;

  const lang = result.language;
  return SUPPORTED_LANGS.has(lang) ? lang : null;
}
