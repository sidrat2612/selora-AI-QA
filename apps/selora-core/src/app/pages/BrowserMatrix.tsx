import { useSearchParams } from "react-router";
import { Monitor, Tablet, Smartphone, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../lib/workspace-context";
import { browserMatrix, type BrowserMatrixResponse, type BrowserType, type DeviceProfile } from "../../lib/api-client";

const BROWSER_LABELS: Record<BrowserType, string> = {
  CHROMIUM: "Chrome",
  FIREFOX: "Firefox",
  WEBKIT: "Safari",
};

const DEVICE_ICONS: Record<DeviceProfile, typeof Monitor> = {
  DESKTOP: Monitor,
  TABLET: Tablet,
  MOBILE: Smartphone,
};

function statusIcon(status: string) {
  if (status === "PASSED") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "FAILED") return <XCircle className="h-4 w-4 text-red-500" />;
  if (status === "RUNNING") return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
}

export function BrowserMatrix() {
  const { activeWorkspaceId } = useWorkspace();
  const [searchParams] = useSearchParams();
  const runId = searchParams.get("runId") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["browser-matrix", activeWorkspaceId, runId],
    queryFn: () => browserMatrix.getRunMatrix(activeWorkspaceId!, runId),
    enabled: !!activeWorkspaceId && !!runId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Browser Matrix</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cross-browser test results across Chrome, Firefox, Safari & multiple devices
        </p>
      </div>

      {!runId && (
        <Card className="p-8 text-center text-slate-500">
          <p>Provide a <code className="text-sm bg-slate-100 px-1 rounded">?runId=...</code> parameter to view the browser matrix for a run.</p>
        </Card>
      )}

      {isLoading && (
        <div className="p-8 text-center text-slate-500">Loading matrix...</div>
      )}

      {data && <MatrixGrid data={data} />}
    </div>
  );
}

function MatrixGrid({ data }: { data: BrowserMatrixResponse }) {
  const { columns, rows } = data;

  if (columns.length === 0) {
    return (
      <Card className="p-8 text-center text-slate-500">
        No browser matrix data for this run. Browser matrix results are created when a run uses multi-browser configuration.
      </Card>
    );
  }

  // Summary stats
  const allResults = rows.flatMap((r) => r.results);
  const passed = allResults.filter((r) => r.status === "PASSED").length;
  const failed = allResults.filter((r) => r.status === "FAILED").length;
  const total = allResults.length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-900">{total}</div>
          <p className="text-xs text-slate-500">Total Cells</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">{passed}</div>
          <p className="text-xs text-slate-500">Passed</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{failed}</div>
          <p className="text-xs text-slate-500">Failed</p>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">
            {total > 0 ? `${Math.round((passed / total) * 100)}%` : "—"}
          </div>
          <p className="text-xs text-slate-500">Pass Rate</p>
        </Card>
      </div>

      {/* Matrix Grid */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50">
              <th className="text-left p-3 font-medium text-slate-600 min-w-[200px]">Test</th>
              {columns.map((col, i) => {
                const DevIcon = DEVICE_ICONS[col.device];
                return (
                  <th key={i} className="text-center p-3 font-medium text-slate-600 min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <DevIcon className="h-4 w-4" />
                      <span className="text-xs">{BROWSER_LABELS[col.browserType]}</span>
                      <span className="text-[10px] text-slate-400">{col.device.toLowerCase()}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.testRunItemId} className="border-b hover:bg-slate-50">
                <td className="p-3">
                  <div className="font-medium text-slate-800 truncate max-w-[250px]">{row.testName}</div>
                  <span className="text-xs text-slate-400">#{row.sequence}</span>
                </td>
                {columns.map((col, ci) => {
                  const result = row.results.find(
                    (r) => r.browserType === col.browserType && r.device === col.device,
                  );
                  return (
                    <td key={ci} className="p-3 text-center">
                      {result ? (
                        <div className="flex flex-col items-center gap-1">
                          {statusIcon(result.status)}
                          {result.durationMs != null && (
                            <span className="text-[10px] text-slate-400">{result.durationMs}ms</span>
                          )}
                          {result.failureSummary && (
                            <span className="text-[10px] text-red-400 truncate max-w-[80px]" title={result.failureSummary}>
                              {result.failureSummary.slice(0, 20)}...
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
