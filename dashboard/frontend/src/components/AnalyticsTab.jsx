import React, { useEffect, useState } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from 'recharts';
import { fetchTrends } from '../api';
import { TOKENS } from '../tokens';
import { LoadingState, ErrorState, EmptyState } from './StatusViews';

function CustomTrendTooltip({ active, payload, label, typical }) {
  if (!active || !payload || !payload.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  const isHigh = pt.above_typical;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-md">
      <div className="flex items-center justify-between gap-4 border-b border-gray-100 pb-1.5">
        <span className="font-bold text-gray-900">{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: isHigh ? '#fde8ec' : TOKENS.green[100],
            color: isHigh ? TOKENS.red[800] : TOKENS.green[900],
          }}
        >
          {isHigh ? 'Above Typical' : 'At / Below Typical'}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Consumption:</span>
          <span
            className="font-bold"
            style={{ color: isHigh ? TOKENS.red[600] : TOKENS.green[900] }}
          >
            {pt.consumption} kWh
          </span>
        </div>
        {pt.rolling_7 !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">7-Day Rolling Mean:</span>
            <span className="font-semibold" style={{ color: TOKENS.red[500] }}>
              {pt.rolling_7} kWh
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-gray-600">Typical Threshold:</span>
          <span className="font-medium text-gray-800">{typical} kWh</span>
        </div>
        {pt.temperature !== undefined && pt.temperature !== null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Temperature:</span>
            <span className="font-medium text-gray-800">{pt.temperature} °C</span>
          </div>
        )}
        {pt.unit_rate !== undefined && pt.unit_rate !== null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Unit Tariff Rate:</span>
            <span className="font-medium text-gray-800">{pt.unit_rate}/kWh</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  const [granularity, setGranularity] = useState('day');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [household, setHousehold] = useState('');
  const [sampleHouseholds, setSampleHouseholds] = useState([]);
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTrends = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTrends({ granularity, start, end, household });
      setTrendData(res);
      if (res.sample_households?.length && !sampleHouseholds.length) {
        setSampleHouseholds(res.sample_households);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrends();
  }, [granularity, start, end, household]);

  const handleResetFilters = () => {
    setGranularity('day');
    setStart('');
    setEnd('');
    setHousehold('');
  };

  const series = trendData?.series || [];
  const typical = trendData?.typical_consumption_kwh ?? 25.54;
  const aboveCount = series.filter((d) => d.above_typical).length;

  return (
    <div className="space-y-6">
      {/* Filter & Controls Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {/* Granularity Toggle */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
              Granularity
            </label>
            <div className="mt-1.5 inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
              {['hour', 'day', 'week', 'month'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className="rounded-md px-3.5 py-1.5 font-semibold capitalize transition"
                  style={{
                    backgroundColor: granularity === g ? TOKENS.green[900] : 'transparent',
                    color: granularity === g ? '#ffffff' : '#374151',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Start Date (2023)
              </label>
              <input
                type="date"
                min="2023-01-01"
                max="2023-12-31"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                End Date (2023)
              </label>
              <input
                type="date"
                min="2023-01-01"
                max="2023-12-31"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800"
              />
            </div>

            {/* Household Filter */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Household Filter
              </label>
              <select
                value={household}
                onChange={(e) => setHousehold(e.target.value)}
                className="mt-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-800"
              >
                <option value="">All Households (8,964)</option>
                {sampleHouseholds.map((hh) => (
                  <option key={hh} value={hh}>
                    Household #{hh}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleResetFilters}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Main Trend Chart */}
      {loading ? (
        <LoadingState label="Fetching consumption trends..." />
      ) : error ? (
        <ErrorState error={error} onRetry={loadTrends} />
      ) : !trendData?.available || !series.length ? (
        <EmptyState message={trendData?.message || 'No trend data found for this filter combination.'} />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                Consumption Trend ({granularity.toUpperCase()} View
                {household ? ` — Household #${household}` : ' — All Households'})
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Drag the bottom brush slider to zoom into any time window. Points above typical ({typical} kWh) are flagged in red.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className="rounded-full px-3 py-1 font-semibold"
                style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
              >
                At / Below Typical: {series.length - aboveCount} pts
              </span>
              <span
                className="rounded-full px-3 py-1 font-semibold"
                style={{ backgroundColor: '#fde8ec', color: TOKENS.red[800] }}
              >
                Above Typical: {aboveCount} pts
              </span>
            </div>
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={series}
                margin={{ top: 10, right: 24, left: 0, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="timestamp"
                  tick={{ fontSize: 11, fill: '#4b5563' }}
                  minTickGap={24}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#4b5563' }}
                  unit=" kWh"
                />
                <Tooltip content={<CustomTrendTooltip typical={typical} />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />

                <ReferenceLine
                  y={typical}
                  stroke={TOKENS.green[700]}
                  strokeDasharray="4 4"
                  label={{
                    value: `Typical (${typical} kWh)`,
                    position: 'insideTopRight',
                    fill: TOKENS.green[900],
                    fontSize: 11,
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="consumption"
                  name="Consumption (kWh)"
                  stroke={TOKENS.green[900]}
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    if (cx === undefined || cy === undefined) return null;
                    if (series.length > 90 && !payload.above_typical) return null;
                    return (
                      <circle
                        key={`dot-${payload.timestamp}`}
                        cx={cx}
                        cy={cy}
                        r={payload.above_typical ? 3.5 : 2.5}
                        fill={payload.above_typical ? TOKENS.red[500] : TOKENS.green[700]}
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                    );
                  }}
                  activeDot={{ r: 5, fill: TOKENS.red[500] }}
                />

                {granularity === 'day' && !household && (
                  <Line
                    type="monotone"
                    dataKey="rolling_7"
                    name="7-Day Rolling Mean (kWh)"
                    stroke={TOKENS.red[500]}
                    strokeWidth={2}
                    dot={false}
                  />
                )}

                <Brush
                  dataKey="timestamp"
                  height={28}
                  stroke={TOKENS.green[700]}
                  fill="#f9fafb"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
