// Résultat d'action : en production, Next masque les erreurs jetées par les
// Server Actions ("Minified React error #441"). Les règles de gestion doivent
// donc être RETOURNÉES, pas jetées, pour rester visibles côté UI.
//
// Usage serveur : return actionResult(async () => { ...corps inchangé... });
// Usage client  : const doc = unwrap(await monAction(args)); — les callers
// existants (catch → toast) fonctionnent sans modification de structure.

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Erreur métier : son message est SAFE à renvoyer au client (règles de gestion). */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessError";
  }
}

/** Renvoie le message si l'erreur est métier/affichable, sinon null (→ masquée). */
export function businessMessage(err: unknown): string | null {
  if (err instanceof BusinessError) return err.message;
  if (!(err instanceof Error)) return null;
  const m = err.message;
  // CODE: prefixe (ENTREE_INVALIDE:, CLIENT_REQUIS:, NON_AUTORISE:, …)
  if (/^[A-Z][A-Z0-9_]{2,}:/.test(m)) return m;
  // Phrase métier en français (contient un accent) ou sujet courant
  if (/[àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/.test(m)) return m;
  if (
    /^(Le |La |Les |L'|Un |Une |Des |Ce |Cette |Aucun|Aucune|Veuillez|Impossible|Accès|Client|Fournisseur|Document|Règlement|Inventaire|Pièce|Taux|Montant|ICE|Statut|Quantité|Motif|Date|Article|Caisse|Bon |Utilisateur|Numéro|Opération|Action|Déjà|Sélection|Format|Valeur|Total|Stock|Prix|Produit|Fiche|Banque|Chèque|Effet|Virement|Espèces)\b/i.test(
      m
    )
  )
    return m;
  return null;
}

/** Exécute une action : erreurs métier → {ok:false,error}, erreurs internes → re-jet (masqué prod). */
export async function actionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const msg = businessMessage(err);
    if (msg) return { ok: false, error: msg };
    throw err;
  }
}

/**
 * Côté client : déballe un ActionResult. Erreur métier → vraie Error
 * (les catch existants affichent err.message). À utiliser autour de l'appel :
 *   const doc = unwrap(await createSalesDocument(data));
 */
export function unwrap<T>(res: ActionResult<T>): T {
  if (!res.ok) throw new BusinessError(res.error);
  return res.value;
}
