import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { strategiesApi } from "../lib/api";

// Popular series for quick selection
const POPULAR_SERIES = [
  { slug: "btc-updown-15m", name: "Bitcoin 15-minute", description: "BTC up/down every 15 min" },
  { slug: "eth-updown-15m", name: "Ethereum 15-minute", description: "ETH up/down every 15 min" },
];

export function NewStrategyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [error, setError] = useState("");

  // Form state - simplified!
  const [name, setName] = useState("");
  const [seriesSlug, setSeriesSlug] = useState("btc-updown-15m");
  const [limitPrice, setLimitPrice] = useState("0.49");
  const [positionSize, setPositionSize] = useState("50");
  const [maxRuns, setMaxRuns] = useState("10");
  const [frequency, setFrequency] = useState("1"); // minutes

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!seriesSlug.trim()) {
      setError("Please enter a market series");
      return;
    }

    const priceNum = parseFloat(limitPrice);
    if (priceNum * 2 >= 0.998) {
      setError("Limit price too high - need YES + NO < 0.998 for arbitrage edge");
      return;
    }

    createMutation.mutate({
      name: name || `${seriesSlug} Strategy`,
      seriesSlug: seriesSlug.trim(),
      limitPrice: priceNum,
      positionSizeUsdc: parseFloat(positionSize),
      frequencySeconds: parseInt(frequency) * 60,
      maxRuns: maxRuns ? parseInt(maxRuns) : null,
    });
  };

  // Calculate expected profit
  const priceNum = parseFloat(limitPrice) || 0;
  const sizeNum = parseFloat(positionSize) || 0;
  const edge = 1 - (priceNum * 2);
  const contractsPerSide = sizeNum / 2 / priceNum;
  const expectedProfit = edge * contractsPerSide;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <Link to="/strategies" className="text-surface-400 hover:text-surface-200 text-sm mb-2 inline-block">
          ← Back to strategies
        </Link>
        <h1 className="text-3xl font-display font-bold">New Strategy</h1>
        <p className="text-surface-400 mt-1">Create a dual-leg arbitrage strategy for a market series</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Market Series Selection */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Market Series</h2>
          <p className="text-surface-400 text-sm mb-4">
            Enter a market series (e.g., btc-updown-15m). The system will automatically find and trade the current active market.
          </p>

          {/* Quick select buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            {POPULAR_SERIES.map((series) => (
              <button
                key={series.slug}
                type="button"
                onClick={() => setSeriesSlug(series.slug)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  seriesSlug === series.slug
                    ? "border-primary-500 bg-primary-500/20 text-primary-300"
                    : "border-surface-700 hover:border-surface-500 text-surface-300"
                }`}
              >
                {series.name}
              </button>
            ))}
          </div>

          <div>
            <label className="label">Series Slug</label>
            <input
              type="text"
              value={seriesSlug}
              onChange={(e) => setSeriesSlug(e.target.value)}
              placeholder="btc-updown-15m"
              className="input font-mono"
              required
            />
            <p className="text-surface-500 text-xs mt-1">
              The system will search for active markets matching this pattern
            </p>
          </div>
        </div>

        {/* Strategy Configuration */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Strategy Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="label">Strategy Name (optional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${seriesSlug} Strategy`}
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Limit Price (for both YES & NO)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="0.49"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className="input pl-7"
                    required
                  />
                </div>
                <p className="text-surface-500 text-xs mt-1">
                  Max price for each side (YES + NO must be &lt; $1)
                </p>
              </div>
              <div>
                <label className="label">Position Size (USDC)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">$</span>
                  <input
                    type="number"
                    step="1"
                    min="10"
                    value={positionSize}
                    onChange={(e) => setPositionSize(e.target.value)}
                    className="input pl-7"
                    required
                  />
                </div>
                <p className="text-surface-500 text-xs mt-1">
                  Total amount to spend per trade (split 50/50)
                </p>
              </div>
            </div>

            {/* Profit Preview */}
            <div className="p-4 bg-surface-800 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Arbitrage Edge:</span>
                <span className={edge > 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                  {(edge * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-surface-400">Contracts per side:</span>
                <span className="text-surface-200">{contractsPerSide.toFixed(1)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-surface-700 pt-2 mt-2">
                <span className="text-surface-400">Expected Profit per Trade:</span>
                <span className={expectedProfit > 0 ? "text-green-400 font-bold" : "text-red-400"}>
                  ${expectedProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Schedule</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Check Frequency (minutes)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="input"
                required
              />
              <p className="text-surface-500 text-xs mt-1">
                How often to look for new markets
              </p>
            </div>
            <div>
              <label className="label">Max Trades</label>
              <input
                type="number"
                min="1"
                value={maxRuns}
                onChange={(e) => setMaxRuns(e.target.value)}
                className="input"
                placeholder="∞ Unlimited"
              />
              <p className="text-surface-500 text-xs mt-1">
                Leave empty for unlimited
              </p>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={createMutation.isPending || edge <= 0}
          className="btn-primary w-full"
        >
          {createMutation.isPending ? "Creating..." : "Create Strategy"}
        </button>
      </form>
    </div>
  );
}
