// Montant en toutes lettres (français, orthographe traditionnelle avec traits d'union)
// pour la mention « Arrêtée la présente facture à la somme de … ».

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

function below100(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    const base = t === 7 ? "soixante" : "quatre-vingt";
    if (t === 7 && u === 1) return "soixante et onze";
    return `${base}-${UNITS[10 + u]}`;
  }
  if (t === 8) return u === 0 ? "quatre-vingts" : `quatre-vingt-${UNITS[u]}`;
  if (u === 0) return TENS[t];
  if (u === 1) return `${TENS[t]} et un`;
  return `${TENS[t]}-${UNITS[u]}`;
}

/** 0..999 ; `final` = le groupe termine le nombre (accord de « cents » / « quatre-vingts »). */
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let rest = r ? below100(r) : "";
  if (!final && rest === "quatre-vingts") rest = "quatre-vingt";
  if (h === 0) return rest;
  const hundred = h === 1 ? "cent" : `${UNITS[h]} cent${r === 0 && final ? "s" : ""}`;
  return rest ? `${hundred} ${rest}` : hundred;
}

export function integerToFrenchWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const scales: Array<[number, string, string]> = [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ];
  for (const [value, one, many] of scales) {
    const q = Math.floor(n / value);
    if (q > 0) {
      parts.push(`${below1000(q, true)} ${q > 1 ? many : one}`);
      n %= value;
    }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands > 0) {
    parts.push(thousands === 1 ? "mille" : `${below1000(thousands, false)} mille`);
    n %= 1000;
  }
  if (n > 0) parts.push(below1000(n, true));
  return parts.join(" ");
}

/** Ex. 1234567 cents → « douze mille trois cent quarante-cinq dirhams et soixante-sept centimes ». */
export function amountInWordsMAD(cents: number): string {
  const abs = Math.round(Math.abs(cents));
  const dh = Math.floor(abs / 100);
  const c = abs % 100;
  const dhWords = `${integerToFrenchWords(dh)} dirham${dh > 1 ? "s" : ""}`;
  const text = c > 0 ? `${dhWords} et ${integerToFrenchWords(c)} centime${c > 1 ? "s" : ""}` : dhWords;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
