import { getEurMadRate } from "@/lib/actions/fx-monitor";

export const dynamic = "force-dynamic";

/**
 * Route protégée : elle déclenche un appel Browserbase Fetch facturé.
 * Exige l'en-tête `Authorization: Bearer <FX_MONITOR_TOKEN>`.
 * Échoue en refus si le jeton n'est pas configuré (fail-closed).
 */
function isAuthorized(request: Request): boolean {
  const token = process.env.FX_MONITOR_TOKEN;
  if (!token) return false;
  return request.headers.get("authorization") === `Bearer ${token}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const result = await getEurMadRate();
    return Response.json(result);
  } catch (error) {
    console.error("fx-monitor: échec de récupération du taux", error);
    return Response.json({ error: "Taux indisponible" }, { status: 502 });
  }
}
