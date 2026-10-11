// Validation stricte de la configuration d'environnement (fail-fast à l'exécution).
// Volontairement paresseux (getEnv) pour ne pas casser le build Docker (qui n'a pas d'env).
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET doit comporter au moins 32 caractères."),
  ADMIN_PIN: z.string().min(4, "ADMIN_PIN doit comporter au moins 4 caractères."),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Valide et renvoie l'environnement. Lève une erreur si un secret requis manque ou est trop faible. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" ; ");
      throw new Error(`Configuration d'environnement invalide — ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
