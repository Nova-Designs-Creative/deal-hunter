"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import type { ShoppingLocation } from "@/lib/schemas";

type CountryOption = {
  code: string;
  name: string;
  emoji?: string | null;
};

type StateOption = {
  code: string;
  name: string;
};

type LocationSelectorProps = {
  value: ShoppingLocation;
  onChange: (loc: ShoppingLocation) => void;
  disabled?: boolean;
};

export function LocationSelector({
  value,
  onChange,
  disabled,
}: LocationSelectorProps) {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingStates, setLoadingStates] = useState(false);
  const [geoWarning, setGeoWarning] = useState<string | null>(null);

  const countrySelected = Boolean(value.countryCode);
  const regionSelected = Boolean(value.region);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCountries(true);
      try {
        const res = await fetch("/api/geo/countries");
        const data = (await res.json()) as {
          countries: CountryOption[];
          warning?: string;
          error?: string;
        };
        if (cancelled) return;
        setCountries(data.countries ?? []);
        setGeoWarning(data.warning ?? data.error ?? null);

        const match = data.countries?.find((c) => c.code === value.countryCode);
        if (match && match.name !== value.country) {
          onChange({ ...value, country: match.name });
        }
      } catch {
        if (!cancelled) setGeoWarning("Could not load country list.");
      } finally {
        if (!cancelled) setLoadingCountries(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const code = value.countryCode;
    if (!code) {
      setStates([]);
      return;
    }

    (async () => {
      setLoadingStates(true);
      setStates([]);
      try {
        const res = await fetch(
          `/api/geo/states?country=${encodeURIComponent(code)}`,
        );
        const data = (await res.json()) as { states: StateOption[] };
        if (cancelled) return;
        setStates(data.states ?? []);
      } catch {
        if (!cancelled) setStates([]);
      } finally {
        if (!cancelled) setLoadingStates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value.countryCode]);

  return (
    <div className="space-y-3 rounded-xl border border-stone-200/80 bg-white/70 p-4">
      <div>
        <p className="text-sm font-semibold text-stone-900">
          Where are you shopping from?
        </p>
        <p className="text-xs text-stone-500">
          Pick country first, then region/state, then postal code.
          {countries.length > 0 && (
            <span className="ml-1 text-stone-400">
              ({countries.length} countries)
            </span>
          )}
        </p>
      </div>

      {geoWarning && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {geoWarning}
        </p>
      )}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <select
            id="country"
            disabled={disabled || loadingCountries}
            className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"
            size={1}
            value={value.countryCode}
            onChange={(e) => {
              const opt = countries.find((c) => c.code === e.target.value);
              onChange({
                countryCode: e.target.value,
                country: opt?.name ?? e.target.value,
                region: null,
                postalCode: null,
              });
            }}
          >
            {loadingCountries && <option>Loading countries…</option>}
            {!loadingCountries &&
              countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.emoji ? `${c.emoji} ` : ""}
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        {countrySelected && (
          <div className="space-y-1.5 animate-in fade-in duration-300">
            <Label htmlFor="region">Region / state</Label>
            {loadingStates ? (
              <p className="text-sm text-stone-500">Loading regions…</p>
            ) : states.length > 0 ? (
              <select
                id="region"
                disabled={disabled}
                className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"
                value={value.region ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    region: e.target.value || null,
                    postalCode: null,
                  })
                }
              >
                <option value="">Select region / state</option>
                {states.map((s) => (
                  <option key={`${s.code}-${s.name}`} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="region"
                disabled={disabled}
                className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"
                value={value.region ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    region: e.target.value || null,
                    postalCode: null,
                  })
                }
                placeholder="Type your region / state"
              />
            )}
          </div>
        )}

        {countrySelected && regionSelected && (
          <div className="space-y-1.5 animate-in fade-in duration-300">
            <Label htmlFor="postal">Postal code (optional)</Label>
            <input
              id="postal"
              disabled={disabled}
              className="h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"
              value={value.postalCode ?? ""}
              onChange={(e) =>
                onChange({ ...value, postalCode: e.target.value || null })
              }
              placeholder="Enter postal / ZIP code"
            />
          </div>
        )}
      </div>
    </div>
  );
}
