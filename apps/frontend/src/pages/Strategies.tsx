import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { strategiesApi } from "../lib/api";

export function StrategiesPage() {
  const queryClient = useQueryClient();
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["strategies"],
    queryFn: strategiesApi.list,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      strategiesApi.update(id, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: (id: string) => strategiesApi.runNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });

  const strategies = data?.strategies ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-surface-400">Loading strategies...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card bg-red-500/10 border-red-500/30">
        <p className="text-red-400">Failed to load strategies: {(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Strategies</h1>
          <p className="text-surface-400">Manage your trading strategies</p>
        </div>
        <Link to="/strategies/new" className="btn-primary">
          + New Strategy
        </Link>
      </div>

      {strategies.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-surface-400 mb-4">No strategies yet</p>
          <Link to="/strategies/new" className="btn-primary">
            Create your first strategy
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {strategies.map((strategy: any) => (
            <div key={strategy.id} className="card hover:border-surface-700 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Link
                      to={`/strategies/${strategy.id}`}
                      className="text-lg font-display font-semibold hover:text-primary-400 transition-colors"
                    >
                      {strategy.name}
                    </Link>
                    <span
                      className={`status-badge ${
                        strategy.enabled ? "bg-green-500/20 text-green-400" : "bg-surface-700 text-surface-400"
                      }`}
                    >
                      {strategy.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                  
                  <p className="text-surface-400 text-sm mb-4 font-mono">
                    {strategy.seriesSlug || strategy.marketId || "No market configured"}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-surface-500">Limit Price</p>
                      <p className="font-mono text-primary-400">
                        ${strategy.limitPrice ? parseFloat(strategy.limitPrice).toFixed(2) : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-surface-500">Position Size</p>
                      <p className="font-mono">
                        ${strategy.positionSizeUsdc ? parseFloat(strategy.positionSizeUsdc).toFixed(0) : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-surface-500">Check Every</p>
                      <p className="font-mono">{Math.round((strategy.frequencySeconds || 60) / 60)}m</p>
                    </div>
                    <div>
                      <p className="text-surface-500">Trades</p>
                      <p className="font-mono">
                        {strategy.runsCompleted ?? 0}
                        {strategy.maxRuns ? ` / ${strategy.maxRuns}` : " / ∞"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => runNowMutation.mutate(strategy.id)}
                    disabled={!strategy.enabled || runNowMutation.isPending}
                    className="btn-secondary text-sm disabled:opacity-50"
                  >
                    ▶ Run Now
                  </button>
                  <button
                    onClick={() =>
                      toggleMutation.mutate({
                        id: strategy.id,
                        enabled: !strategy.enabled,
                      })
                    }
                    disabled={toggleMutation.isPending}
                    className={`btn text-sm ${
                      strategy.enabled
                        ? "bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                        : "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    }`}
                  >
                    {strategy.enabled ? "⏸ Pause" : "▶ Enable"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
