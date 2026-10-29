import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react"

import {
  api,
  type PaperRebalancePreview,
  type PaperRiskAnalysis,
} from "../../lib/api"
import { useDataProfile } from "../../lib/data-profile"

function checkIcon(check: { passed: boolean; severity?: string }) {
  if (check.passed) return <CheckCircle2 size={16} className="ok" />
  if (check.severity === "warning") return <AlertTriangle size={16} className="warn" />
  return <AlertTriangle size={16} className="invalid" />
}

function percent(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "n/a"
}

export function RiskConsoleWidget() {
  const [profile] = useDataProfile()
  const [strategies, setStrategies] = useState<Array<{ id: string; name: string }>>([])
  const [strategyId, setStrategyId] = useState("sdk-v1-default")
  const [preview, setPreview] = useState<PaperRebalancePreview | null>(null)
  const [analysis, setAnalysis] = useState<PaperRiskAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [analysing, setAnalysing] = useState(false)

  useEffect(() => {
    api.get<Array<{ id: string; name: string }>>("/strategy/projects")
      .then((items) => {
        setStrategies(items)
        setStrategyId((current) => (
          items.some((item) => item.id === current)
            ? current
            : items[0]?.id ?? ""
        ))
      })
      .catch((loadError: Error) => setError(loadError.message))
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      setPreview(await api.post<PaperRebalancePreview>("/paper/rebalance/preview", {
        strategy_id: strategyId,
        profile,
        account_id: "paper",
      }))
    } catch (loadError) {
      setPreview(null)
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setLoading(false)
    }
  }, [profile, strategyId])

  const analyseHoldings = useCallback(async () => {
    setAnalysing(true)
    setAnalysisError("")
    try {
      setAnalysis(await api.post<PaperRiskAnalysis>("/paper/risk/analysis", {
        account_id: "paper",
        profile,
      }))
    } catch (loadError) {
      setAnalysis(null)
      setAnalysisError(loadError instanceof Error ? loadError.message : String(loadError))
    } finally {
      setAnalysing(false)
    }
  }, [profile])

  useEffect(() => {
    if (strategyId) void refresh()
  }, [refresh, strategyId])

  const findings = preview?.findings ?? []
  const warnings = findings.filter((item) => item.severity === "warning")
  const info = findings.filter((item) => item.severity === "info")

  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>Risk Console</h2>
          <p>Live checks against the selected signal and current paper account.</p>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="risk-toolbar">
        <select value={strategyId} onChange={(event) => setStrategyId(event.target.value)}>
          {strategies.map((strategy) => (
            <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
          ))}
        </select>
        <span className={`research-status ${preview?.allowed ? "research_candidate" : "invalid"}`}>
          {preview?.risk_status ?? profile}
        </span>
        <button type="button" className="icon-command" title="Refresh risk checks" onClick={refresh} disabled={loading}>
          <RefreshCw aria-hidden="true" />
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {preview?.policy && (
        <p className="hint">
          Rules: <strong>{preview.policy.label}</strong> — {preview.policy.reason}
          {preview.policy.resume_condition ? ` · ${preview.policy.resume_condition}` : ""}
        </p>
      )}
      {preview?.metrics && (
        <p className="hint">
          Drawdown {percent(preview.metrics.drawdown)} · last day {percent(preview.metrics.daily_return)}
        </p>
      )}
      <div className="risk-list">
        {(preview?.checks ?? []).map((check) => (
          <div className="risk-row" key={check.name}>
            {checkIcon(check)}
            <strong>{check.name.replace(/_/g, " ")}</strong>
            <span>{check.detail}</span>
          </div>
        ))}
      </div>
      {warnings.length > 0 && (
        <div className="risk-list">
          {warnings.map((item) => (
            <div className="risk-row" key={`warning-${item.rule}-${item.symbol ?? ""}`}>
              <AlertTriangle size={16} className="warn" />
              <strong>{item.rule.replace(/_/g, " ")}</strong>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      )}
      {info.length > 0 && (
        <details className="risk-details">
          <summary>{info.length} research notes</summary>
          {info.map((item) => (
            <p className="hint" key={`info-${item.rule}`}>{item.message}</p>
          ))}
        </details>
      )}

      <div className="panel-heading">
        <div>
          <h3>Holdings risk</h3>
          <p>Risk of the positions the account actually holds, from frozen price history.</p>
        </div>
        <button type="button" className="icon-command" title="Analyse holdings" onClick={analyseHoldings} disabled={analysing}>
          <RefreshCw aria-hidden="true" />
        </button>
      </div>
      {analysisError && <p className="error">{analysisError}</p>}
      {analysis && (
        <div>
          <div className="risk-list">
            <div className="risk-row">
              <CheckCircle2 size={16} className="ok" />
              <strong>annualised volatility</strong>
              <span>{percent(analysis.portfolio.annualized_volatility)}</span>
            </div>
            <div className="risk-row">
              <CheckCircle2 size={16} className="ok" />
              <strong>largest position</strong>
              <span>{percent(analysis.concentration.top1_weight)} ({analysis.concentration.largest ?? "n/a"})</span>
            </div>
            <div className="risk-row">
              <CheckCircle2 size={16} className="ok" />
              <strong>effective positions</strong>
              <span>
                {analysis.concentration.effective_positions === null
                  ? "n/a"
                  : analysis.concentration.effective_positions.toFixed(2)}
              </span>
            </div>
            {analysis.scenarios.items.map((scenario) => (
              <div className="risk-row" key={`scenario-${scenario.start}`}>
                <AlertTriangle size={16} className="warn" />
                <strong>{scenario.start} → {scenario.end}</strong>
                <span>{percent(scenario.portfolio_return)}</span>
              </div>
            ))}
          </div>
          {analysis.unevaluated.symbols.length > 0 && (
            <p className="hint">
              Not evaluated: {analysis.unevaluated.symbols.join(", ")} (
              {percent(analysis.unevaluated.weight_share)} of the account).
            </p>
          )}
          <p className="hint">{analysis.disclaimer}</p>
          <p className="hint">Inputs {analysis.input_hash.slice(0, 12)}{analysis.cached ? " (replayed)" : ""}</p>
        </div>
      )}
    </div>
  )
}
