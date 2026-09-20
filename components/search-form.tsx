"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EXAMPLES = [
  "Find the cheapest MacBook Air M4",
  "Find me the best deal on Sony WH-1000XM6",
  "Find a good leather work bag",
  "Find Nike running shoes under $150",
  "Find the cheapest RTX 5070",
];

type SearchFormProps = {
  onSubmit: (query: string) => void;
  loading: boolean;
};

export function SearchForm({ onSubmit, loading }: SearchFormProps) {
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-3">
      <form
        className="flex w-full flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!query.trim() || loading) return;
          onSubmit(query.trim());
        }}
      >
        <label className="sr-only" htmlFor="deal-query">
          What do you want to buy?
        </label>
        <Input
          id="deal-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What do you want to buy?"
          disabled={loading}
          className="h-12 flex-1 border-stone-300/80 bg-white/80 text-base shadow-sm backdrop-blur"
        />
        <Button
          type="submit"
          disabled={loading || !query.trim()}
          className="h-12 gap-2 bg-teal-700 px-6 text-base font-medium text-white hover:bg-teal-800"
        >
          <Search className="size-4" />
          {loading ? "Researching…" : "Find Better Deals"}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={loading}
            onClick={() => {
              setQuery(ex);
              onSubmit(ex);
            }}
            className="rounded-full border border-stone-200 bg-white/60 px-3 py-1 text-xs text-stone-600 transition hover:border-teal-600/40 hover:text-teal-900"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
