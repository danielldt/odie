import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import { strategiesApi, runsApi } from "../lib/api";

export function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["strategy", id],
    queryFn: () => strategiesApi.get(id!),
    enabled: !!id,
  });

  const { data: runsData } = useQuery({
    queryKey: ["runs", { strategyId: id }],
    queryFn: () => runsApi.list({ strategyId: id, limit: 20 }),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => strategiesApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["strategies"] });
      navigate("/strategies");
    },
  });

  const strategy = data?.strategy as any;
  const runs = runsData?.runs ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-surface-400">Loading strategy...</div>
      </div>
    );
  }

  if (error || !strategy) {
    return (
      <div className="card bg-red-500/10 border-red-500/30">
        <p className="text-red-400">Strategy not found</p>
        <Link to="/strategies" className="text-primary-400 mt-2 inline-block">
          ← Back to strategies
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/strategies" className="text-surface-400 hover:text-surface-200 text-sm mb-2 inline-block">
            ← Back to strategies
          </Link>
          <h1 className="text-3xl font-display font-bold">{strategy.name}</h1>
          <p className="text-surface-400 mt-1">
            {strategy.market?.question || strategy.marketId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`status-badge ${
              strategy.enabled ? "bg-green-500/20 text-green-400" : "bg-surface-700 text-surface-400"
            }`}
          >
            {strategy.enabled ? "Active" : "Paused"}
          </span>
          <button
            onClick={() => {
              if (confirm("Are you sure you want to delete this strategy?")) {
                deleteMutation.mutate();
              }
            }}
            className="btn-danger text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Strategy config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Order Configuration</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-surface-400">YES Token</span>
              <span className="font-mono text-sm">{strategy.yesTokenId?.slice(0, 16)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">YES Price</span>
              <span className="font-mono text-primary-400">${parseFloat(strategy.yesLimitPrice).toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">YES Size</span>
              <span className="font-mono">{parseFloat(strategy.yesSize).toFixed(2)}</span>
            </div>
            <hr className="border-surface-800" />
            <div className="flex justify-between">
              <span className="text-surface-400">NO Token</span>
              <span className="font-mono text-sm">{strategy.noTokenId?.slice(0, 16)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">NO Price</span>
              <span className="font-mono text-primary-400">${parseFloat(strategy.noLimitPrice).toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">NO Size</span>
              <span className="font-mono">{parseFloat(strategy.noSize).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-display font-semibold mb-4">Safety & Schedule</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-surface-400">Frequency</span>
              <span className="font-mono">{strategy.frequencySeconds / 60} minutes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Max Runs</span>
              <span className="font-mono">{strategy.maxRuns ?? "∞"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Runs Completed</span>
              <span className="font-mono">{strategy.runsCompleted}</span>
            </div>
            <hr className="border-surface-800" />
            <div className="flex justify-between">
              <span className="text-surface-400">Min Liquidity</span>
              <span className="font-mono">${parseFloat(strategy.minLiquidityUsdc).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Leg Timeout</span>
              <span className="font-mono">{strategy.legTimeoutMs / 1000}s</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-400">Auto Cash-Out</span>
              <span className={strategy.autoCashOut ? "text-green-400" : "text-surface-400"}>
                {strategy.autoCashOut ? "Yes" : "No"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Run history */}
      <div className="card">
        <h2 className="text-lg font-display font-semibold mb-4">Run History</h2>
        
        {runs.length === 0 ? (
          <p className="text-surface-500">No runs yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-surface-400 text-sm border-b border-surface-800">
                  <th className="pb-3 font-medium">Scheduled</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Entry Cost</th>
                  <th className="pb-3 font-medium">Exit Proceeds</th>
                  <th className="pb-3 font-medium">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {runs.map((run: any) => {
                  const entryCost = parseFloat(run.entryYesCost || 0) + parseFloat(run.entryNoCost || 0);
                  const exitProceeds = parseFloat(run.exitYesProceeds || 0) + parseFloat(run.exitNoProceeds || 0);
                  const pnl = run.exitYesProceeds !== null ? exitProceeds - entryCost : null;

                  return (
                    <tr key={run.id} className="hover:bg-surface-800/50">
                      <td className="py-3 text-sm text-surface-300">
                        {new Date(run.scheduledFor).toLocaleString()}
                      </td>
                      <td className="py-3">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="py-3 text-sm font-mono">
                        {run.entryYesCost !== null ? `$${entryCost.toFixed(2)}` : "-"}
                      </td>
                      <td className="py-3 text-sm font-mono">
                        {run.exitYesProceeds !== null ? `$${exitProceeds.toFixed(2)}` : "-"}
                      </td>
                      <td className={`py-3 text-sm font-mono ${
                        pnl === null ? "" : pnl >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {pnl !== null ? `$${pnl.toFixed(2)}` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusClasses: Record<string, string> = {
    pending: "status-pending",
    running: "status-running",
    filled: "status-filled",
    cancelled: "status-cancelled",
    failed: "status-failed",
    hedged: "status-hedged",
  };

  return (
    <span className={statusClasses[status] || "status-badge bg-surface-700 text-surface-300"}>
      {status}
    </span>
  );
}
