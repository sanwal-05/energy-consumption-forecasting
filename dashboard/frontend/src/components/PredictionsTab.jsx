import React, { useEffect, useState } from 'react';
import {
  ComposedChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { fetchPredictions, fetchModels } from '../api';
import { TOKENS } from '../tokens';
import { LoadingState, ErrorState, EmptyState } from './StatusViews';

function CustomPredictionTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const isHighErr = pt.high_error;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-md">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-1.5">
        <span className="font-bold text-gray-900">{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: isHighErr ? '#fde8ec' : TOKENS.green[100],
            color: isHighErr ? TOKENS.red[800] : TOKENS.green[900],
          }}
        >
          {isHighErr ? 'Large Error (> MAE)' : 'Low Error (≤ MAE)'}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Actual (Dark Green):</span>
          <span className="font-bold" style={{ color: TOKENS.green[900] }}>
            {pt.actual} kWh
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Predicted (Red):</span>
          <span className="font-bold" style={{ color: TOKENS.red[500] }}>
            {pt.predicted} kWh
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Residual (Actual − Pred):</span>
          <span
            className="font-semibold"
            style={{ color: isHighErr ? TOKENS.red[700] : TOKENS.green[700] }}
          >
            {pt.error > 0 ? `+${pt.error}` : pt.error} kWh ({pt.pct_error}%)
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PredictionsTab() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [predData, setPredData] = useState(null);
  const [modelsData, setModelsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, mRes] = await Promise.all([
        fetchPredictions({ start, end }),
        fetchModels(),
      ]);
      setPredData(pRes);
      setModelsData(mRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [start, end]);

  if (loading) return <LoadingState label="Loading test predictions and model comparison..." />;
  if (error) return <ErrorState error={error} onRetry={loadAll} />;
  if (!predData?.available && !modelsData?.available) {
    return <EmptyState message="Prediction or model comparison artifacts are missing." />;
  }

  const series = predData?.series || [];
  const comparison = modelsData?.comparison || [];
  const bestModelName = modelsData?.best_model || predData?.best_model || 'Gradient Boosting';
  const bestRow = comparison.find((r) => r.model === bestModelName) || comparison[0] || {};
  const highErrCount = series.filter((d) => d.high_error).length;

  return (
    <div className="space-y-6">
      {/* Top Row: Actual vs Predicted Overlay Chart + Best Model Metrics Side Panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Overlay Chart Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Test Set: Actual vs Predicted Overlay ({bestModelName})
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Actual = dark green ({TOKENS.green[900]}), Predicted = red ({TOKENS.red[500]}). Large-error days (|error| &gt; MAE) are highlighted with red markers.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="date"
                min="2023-11-08"
                max="2023-12-31"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                min="2023-11-08"
                max="2023-12-31"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs"
              />
              {(start || end) && (
                <button
                  onClick={() => {
                    setStart('');
                    setEnd('');
                  }}
                  className="rounded-lg border border-gray-300 px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {series.length === 0 ? (
            <EmptyState message="No test predictions in this date window." />
          ) : (
            <>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={series}
                    margin={{ top: 10, right: 20, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="timestamp" tick={{ fontSize: 11, fill: '#4b5563' }} minTickGap={20} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#4b5563' }} unit=" kWh" />
                    <Tooltip content={<CustomPredictionTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />

                    {/* Actual line = Dark Green (#204110), with large-error points highlighted in Red */}
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual Consumption (kWh)"
                      stroke={TOKENS.green[900]}
                      strokeWidth={2.2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (cx === undefined || cy === undefined) return null;
                        if (payload.high_error) {
                          return (
                            <circle
                              key={`act-${payload.timestamp}`}
                              cx={cx}
                              cy={cy}
                              r={5}
                              fill={TOKENS.red[500]}
                              stroke={TOKENS.red[900]}
                              strokeWidth={1.5}
                            />
                          );
                        }
                        return (
                          <circle
                            key={`act-${payload.timestamp}`}
                            cx={cx}
                            cy={cy}
                            r={3}
                            fill={TOKENS.green[900]}
                          />
                        );
                      }}
                    />

                    {/* Predicted line = Red (#e10531) */}
                    <Line
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted Consumption (kWh)"
                      stroke={TOKENS.red[500]}
                      strokeWidth={2.2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Residual Error Bar Chart */}
              <div className="mt-4 border-t border-gray-100 pt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700">
                    Point-by-Point Residual Error (Actual − Predicted)
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-medium" style={{ color: TOKENS.green[900] }}>
                      <span className="inline-block h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: TOKENS.green[500] }} />
                      Low Error ({series.length - highErrCount} days)
                    </span>
                    <span className="flex items-center gap-1 font-medium" style={{ color: TOKENS.red[800] }}>
                      <span className="inline-block h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: TOKENS.red[500] }} />
                      Large Error &gt; MAE ({highErrCount} days)
                    </span>
                  </div>
                </div>
                <div className="h-[130px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={series} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="timestamp" hide />
                      <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} unit=" kWh" />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Tooltip content={<CustomPredictionTooltip />} />
                      <Bar dataKey="error" name="Residual Error (kWh)">
                        {series.map((entry, idx) => (
                          <Cell
                            key={`err-${idx}`}
                            fill={entry.high_error ? TOKENS.red[500] : TOKENS.green[500]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Best Model Metrics Panel Beside Chart */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-xs lg:col-span-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Selected Model Metrics
              </span>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
              >
                Best by TimeSeriesSplit CV
              </span>
            </div>
            <h3 className="mt-2 text-xl font-bold text-gray-900">{bestModelName}</h3>
            <p className="mt-1 text-xs text-gray-500">
              Evaluated on {predData?.count ?? 54} untouched test days ({predData?.start} to {predData?.end})
            </p>

            {/* 4 Key Metrics Grid: MAE, RMSE, R², MAPE */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div
                className="rounded-xl border p-3.5"
                style={{ borderColor: TOKENS.green[300], backgroundColor: TOKENS.green[100] }}
              >
                <p className="text-xs font-semibold" style={{ color: TOKENS.green[700] }}>
                  Test MAE
                </p>
                <p className="mt-1 text-2xl font-bold" style={{ color: TOKENS.green[900] }}>
                  {bestRow.MAE} <span className="text-xs font-normal">kWh</span>
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: TOKENS.green[700] }}>
                  CV MAE: {bestRow.CV_MAE} kWh
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                <p className="text-xs font-semibold text-gray-500">Test RMSE</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {bestRow.RMSE} <span className="text-xs font-normal text-gray-500">kWh</span>
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Baseline RMSE: {modelsData?.baseline_metrics?.RMSE} kWh
                </p>
              </div>

              <div
                className="rounded-xl border p-3.5"
                style={{ borderColor: '#f5c2c7', backgroundColor: '#fde8ec' }}
              >
                <p className="text-xs font-semibold" style={{ color: TOKENS.red[800] }}>
                  Test R² Score
                </p>
                <p className="mt-1 text-2xl font-bold" style={{ color: TOKENS.red[700] }}>
                  {bestRow.R2}
                </p>
                <p className="mt-0.5 text-[11px]" style={{ color: TOKENS.red[800] }}>
                  ≈ 0 (matches mean baseline)
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-3.5">
                <p className="text-xs font-semibold text-gray-500">Test MAPE</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: TOKENS.green[900] }}>
                  {bestRow.MAPE}%
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Train MAE: {bestRow.Train_MAE} kWh
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-700">
            <p className="font-bold text-gray-900">Diagnostic Interpretation</p>
            <p className="mt-1 leading-relaxed">
              Regularised models (<span className="font-semibold">Gradient Boosting</span>, <span className="font-semibold">Lasso</span>, <span className="font-semibold">Ridge</span>) converge to predicting the historical average (<span className="font-semibold">~25.54 kWh</span>) because the underlying synthetic series has independent uniform values (theoretical ceiling <span className="font-semibold">R² = 0</span>).
            </p>
          </div>
        </div>
      </div>

      {/* Model Comparison Table */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Model Comparison Table (Sorted by TimeSeriesSplit CV MAE)
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Best model highlighted in green ({TOKENS.green[100]}). Models that overfit or degrade on test data are marked in red.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <th className="py-3 px-3">Rank</th>
                <th className="py-3 px-3">Model</th>
                <th className="py-3 px-3">CV MAE (kWh)</th>
                <th className="py-3 px-3">Train MAE (kWh)</th>
                <th className="py-3 px-3">Test MAE (kWh)</th>
                <th className="py-3 px-3">Test RMSE (kWh)</th>
                <th className="py-3 px-3">Test R²</th>
                <th className="py-3 px-3">Test MAPE (%)</th>
                <th className="py-3 px-3">Best Settings (CV)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {comparison.map((row, idx) => {
                const isBest = row.model === bestModelName;
                const isPoor = Number(row.R2) < -0.05;
                return (
                  <tr
                    key={row.model}
                    style={{
                      backgroundColor: isBest ? TOKENS.green[100] : '#ffffff',
                    }}
                  >
                    <td className="py-3 px-3 font-bold text-gray-700">#{idx + 1}</td>
                    <td className="py-3 px-3 font-bold text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{row.model}</span>
                        {isBest && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                            style={{ backgroundColor: TOKENS.green[900] }}
                          >
                            BEST MODEL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-semibold" style={{ color: isBest ? TOKENS.green[900] : '#1f2937' }}>
                      {row.CV_MAE}
                    </td>
                    <td className="py-3 px-3 text-gray-700">{row.Train_MAE}</td>
                    <td
                      className="py-3 px-3 font-bold"
                      style={{ color: isBest ? TOKENS.green[900] : isPoor ? TOKENS.red[700] : '#1f2937' }}
                    >
                      {row.MAE}
                    </td>
                    <td className="py-3 px-3 text-gray-700">{row.RMSE}</td>
                    <td
                      className="py-3 px-3 font-semibold"
                      style={{ color: isPoor ? TOKENS.red[600] : TOKENS.green[700] }}
                    >
                      {row.R2}
                    </td>
                    <td className="py-3 px-3 text-gray-700">{row.MAPE}%</td>
                    <td className="py-3 px-3 font-mono text-[11px] text-gray-600">
                      {row.best_settings}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
