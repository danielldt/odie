import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { marketsApi, strategiesApi } from "../lib/api";

export function NewStrategyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState("");
  const [selectedMarket, setSelectedMarket] = useState<any>(null);
  const [error, setError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [yesPrice, setYesPrice] = useState("0.45");
  const [noPrice, setNoPrice] = useState("0.45");
  const [yesSize, setYesSize] = useState("10");
  const [noSize, setNoSize] = useState("10");
  const [frequency, setFrequency] = useState("5");
  const [maxRuns, setMaxRuns] = useState("");
  const [autoCashOut, setAutoCashOut] = useState(true);

  const { data: marketsData, isLoading: marketsLoading } = useQuery({
    queryKey: ["markets", search],
    queryFn: () => marketsApi.list({ search, active: true, limit: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: strategiesApi.create,
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
      navigate(`/strategies/${data.strategy.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const markets = marketsData?.markets ?? [];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!selectedMarket) {
      setError("Please select a market");
      return;
    }

    // Tokens can be directly on market or nested in metadataJson (depending on source)
    const tokens = selectedMarket.tokens || selectedMarket.metadataJson?.tokens;
    const yesToken = tokens?.find((t: any) => t.outcome?.toLowerCase() === "yes");
    const noToken = tokens?.find((t: any) => t.outcome?.toLowerCase() === "no");

    if (!yesToken || !noToken) {
      setError("Market does not have YES/NO tokens");
      return;
    }

    const yesPriceNum = parseFloat(yesPrice);
    const noPriceNum = parseFloat(noPrice);

    if (yesPriceNum + noPriceNum >= 0.998) {
      setError("YES + NO prices must be less than 0.998 for arbitrage edge");
      return;
    }

    createMutation.mutate({
      name: name || `Strategy for ${selectedMarket.question?.slice(0, 30)}...`,
      marketId: selectedMarket.id,
      yesTokenId: yesToken.token_id,
      noTokenId: noToken.token_id,
      yesLimitPrice: yesPriceNum,
      noLimitPrice: noPriceNum,
      yesSize: parseFloat(yesSize),
      noSize: parseFloat(noSize),
      frequencySeconds: parseInt(frequency) * 60,
      maxRuns: maxRuns ? parseInt(maxRuns) : null,
      autoCashOut,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link to="/strategies" className="text-surface-400 hover:text-surface-200 text-sm mb-2 inline-block">
          ← Back to strategies
        </Link>
        <h1 className="text-3xl font-display font-bold">New Strategy</h1>
        <p className="text-surface-400 mt-1">Create a dual-leg arbitrage strategy</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Market selection */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Select Market</h2>
          
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets..."
            className="input mb-4"
          />

          {marketsLoading ? (
            <p className="text-surface-500">Loading markets...</p>
          ) : markets.length === 0 ? (
            <p className="text-surface-500">No markets found</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {markets.map((market: any) => (
                <button
                  key={market.id}
                  type="button"
                  onClick={() => setSelectedMarket(market)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    selectedMarket?.id === market.id
                      ? "border-primary-500 bg-primary-500/10"
                      : "border-surface-700 hover:border-surface-600 bg-surface-800/50"
                  }`}
                >
                  <p className="font-medium text-sm">{market.question}</p>
                  <p className="text-surface-500 text-xs mt-1">{market.slug}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Strategy config */}
        {selectedMarket && (
          <>
            <div className="card">
              <h2 className="text-lg font-display font-semibold mb-4">Strategy Configuration</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="label">Strategy Name (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={`Strategy for ${selectedMarket.question?.slice(0, 30)}...`}
                    className="input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">YES Limit Price</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="0.999"
                      value={yesPrice}
                      onChange={(e) => setYesPrice(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">NO Limit Price</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="0.999"
                      value={noPrice}
                      onChange={(e) => setNoPrice(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">YES Size (contracts)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={yesSize}
                      onChange={(e) => setYesSize(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">NO Size (contracts)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={noSize}
                      onChange={(e) => setNoSize(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                </div>

                {/* Arb edge preview */}
                <div className="p-3 bg-surface-800 rounded-lg">
                  <p className="text-surface-400 text-sm">
                    Implied Edge:{" "}
                    <span className={
                      1 - parseFloat(yesPrice) - parseFloat(noPrice) > 0
                        ? "text-green-400"
                        : "text-red-400"
                    }>
                      {((1 - parseFloat(yesPrice) - parseFloat(noPrice)) * 100).toFixed(2)}%
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 className="text-lg font-display font-semibold mb-4">Schedule & Safety</h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Frequency (minutes)</label>
                    <input
                      type="number"
                      min="1"
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value)}
                      className="input"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Max Runs (empty = unlimited)</label>
                    <input
                      type="number"
                      min="1"
                      value={maxRuns}
                      onChange={(e) => setMaxRuns(e.target.value)}
                      className="input"
                      placeholder="∞"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="autoCashOut"
                    checked={autoCashOut}
                    onChange={(e) => setAutoCashOut(e.target.checked)}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500"
                  />
                  <label htmlFor="autoCashOut" className="text-sm text-surface-300">
                    Auto cash-out after both legs fill (recommended)
                  </label>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn-primary w-full"
            >
              {createMutation.isPending ? "Creating..." : "Create Strategy"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
