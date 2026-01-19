import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { strategiesApi, runsApi, pnlApi } from "../lib/api";

export function DashboardPage() {
  const { data: strategiesData } = useQuery({
    queryKey: ["strategies"],
    queryFn: strategiesApi.list,
  });

  const { data: runsData } = useQuery({
    queryKey: ["runs", { limit: 10 }],
    queryFn: () => runsApi.list({ limit: 10 }),
  });

  const { data: pnlData } = useQuery({
    queryKey: ["pnl-summary"],
    queryFn: () => pnlApi.summary(),
  });

  const strategies = strategiesData?.strategies ?? [];
  const runs = runsData?.runs ?? [];
  const pnlSummary = pnlData?.summary as { totalPnl?: number; totalVolume?: number; totalTrades?: number } | undefined;

  const activeStrategies = strategies.filter((s: any) => s.enabled).length;
  const totalPnl = Number(pnlSummary?.totalPnl) || 0;
  const totalVolume = Number(pnlSummary?.totalVolume) || 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold mb-2">Dashboard</h1>
        <p className="text-surface-400">Overview of your trading activity</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-surface-400 text-sm mb-1">Active Strategies</p>
          <p className="text-3xl font-display font-bold text-primary-400">{activeStrategies}</p>
        </div>
        <div className="card">
          <p className="text-surface-400 text-sm mb-1">Total PnL</p>
          <p className={`text-3xl font-display font-bold ${totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            ${totalPnl.toFixed(2)}
          </p>
        </div>
        <div className="card">
          <p className="text-surface-400 text-sm mb-1">Total Volume</p>
          <p className="text-3xl font-display font-bold text-surface-200">${totalVolume.toFixed(2)}</p>
        </div>
        <div className="card">
          <p className="text-surface-400 text-sm mb-1">Total Trades</p>
          <p className="text-3xl font-display font-bold text-surface-200">{pnlSummary?.totalTrades ?? 0}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-4">
        <Link to="/strategies/new" className="btn-primary">
          + New Strategy
        </Link>
        <Link to="/strategies" className="btn-secondary">
          View All Strategies
        </Link>
      </div>

      {/* Recent runs */}
      <div className="card">
        <h2 className="text-xl font-display font-semibold mb-4">Recent Runs</h2>
        
        {runs.length === 0 ? (
          <p className="text-surface-500">No runs yet. Create a strategy to get started.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-surface-400 text-sm border-b border-surface-800">
                  <th className="pb-3 font-medium">Time</th>
                  <th className="pb-3 font-medium">Strategy</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">PnL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {runs.map((run: any) => (
                  <tr key={run.id} className="hover:bg-surface-800/50">
                    <td className="py-3 text-sm text-surface-300">
                      {new Date(run.scheduledFor).toLocaleString()}
                    </td>
                    <td className="py-3 text-sm">{run.strategyId?.slice(0, 8)}...</td>
                    <td className="py-3">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3 text-sm">
                      {run.exitYesProceeds !== null
                        ? `$${(
                            parseFloat(run.exitYesProceeds || 0) +
                            parseFloat(run.exitNoProceeds || 0) -
                            parseFloat(run.entryYesCost || 0) -
                            parseFloat(run.entryNoCost || 0)
                          ).toFixed(2)}`
                        : "-"}
                    </td>
                  </tr>
                ))}
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
