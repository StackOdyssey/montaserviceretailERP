"use client";

import { useEffect, useRef, useState } from "react";
import { getCustomers } from "@/lib/actions/customers";

export type CustomerMatch = Awaited<ReturnType<typeof getCustomers>>[number];

interface UseCustomerSearchOptions {
  /** nombre max de suggestions */
  limit?: number;
  /** longueur min du terme avant recherche */
  minLength?: number;
  debounceMs?: number;
  /** terme à ne jamais rechercher (ex : "Client Comptoir Particulier") */
  ignoreTerm?: string;
}

/**
 * Recherche client debouncée partagée entre /ventes/nouveau (saisie inline)
 * et le sélecteur client du POS.
 */
export function useCustomerSearch(term: string, options: UseCustomerSearchOptions = {}) {
  const { limit = 6, minLength = 2, debounceMs = 250, ignoreTerm } = options;
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suppressNext = useRef(false);

  /** Ignore la prochaine exécution (appelé juste après une sélection). */
  const suppress = () => {
    suppressNext.current = true;
    setMatches([]);
    setHasSearched(false);
    setError(null);
  };

  const clear = () => {
    setMatches([]);
    setHasSearched(false);
    setError(null);
  };

  useEffect(() => {
    if (suppressNext.current) {
      suppressNext.current = false;
      return;
    }
    const q = term.trim();
    const timer = setTimeout(async () => {
      if (q.length < minLength || q === ignoreTerm) {
        setMatches([]);
        setHasSearched(false);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        setError(null);
        const results = await getCustomers(q);
        setMatches(results.slice(0, limit));
        setHasSearched(true);
      } catch (err) {
        setMatches([]);
        setError(err instanceof Error ? err.message : "Recherche impossible");
      } finally {
        setIsSearching(false);
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [term, limit, minLength, debounceMs, ignoreTerm]);

  return { matches, hasSearched, isSearching, error, suppress, clear };
}
