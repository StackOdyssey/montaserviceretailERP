// Observabilité minimale (Phase 10) : journalisation structurée JSON.
// Aucune dépendance externe — exploitable par Cloud Logging / n'importe quel
// collecteur qui lit stdout. Remplaçable plus tard par OpenTelemetry.

export function logEvent(event: string, data: Record<string, unknown> = {}): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), severity: "INFO", event, ...data });
    console.log(line);
  } catch {
    // ne jamais faire échouer une action à cause de la journalisation
  }
}

export function logWarn(event: string, data: Record<string, unknown> = {}): void {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), severity: "WARNING", event, ...data });
    console.warn(line);
  } catch {
    // ignore
  }
}
