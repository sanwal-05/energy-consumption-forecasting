import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { fetchSummary, fetchInsights } from '../api';
import { TOKENS } from '../tokens';
import SemicircleGauge from './SemicircleGauge';
import { LoadingState, ErrorState, EmptyState } from './StatusViews';

export default function DashboardTab() {
  const [summary, setSummary] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [breakdownMode, setBreakdownMode] = useState('device'); // 'device' | 'region'

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sData, iData] = await Promise.all([fetchSummary(), fetchInsights()]);
      setSummary(sData);
      setInsights(iData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) return <LoadingState label="Loading dashboard summary and breakdown..." />;
  if (error) return <ErrorState error={error} onRetry={loadData} />;
  if (!summary?.available) return <EmptyState message={summary?.message || 'Summary artifacts missing.'} />;

  // Prepare small bar chart data (Device or Region), with the highest bar colored in red
  const deviceList = (insights?.top_consuming_devices || []).map((d) => ({
    name: d.device,
    value: Number(d.energy_draw_kwh),
    sub: `${d.runtime_hours}h runtime | ${d.device_power_kw} kW`,
  }));

  const regionList = (insights?.consumption_by_region || []).map((r) => ({
    name: r.region,
    value: Number(r.mean_kwh),
    sub: `${r.readings_count.toLocaleString()} readings | Total ${r.total_kwh.toLocaleString()} kWh`,
  }));

  const chartData = breakdownMode === 'device' ? deviceList : regionList;
  const maxVal = chartData.length ? Math.max(...chartData.map((d) => d.value)) : 0;

  const shareAbove = Number(summary.share_above_typical_pct ?? 50);
  const isTypicalGood = shareAbove <= 50.5;

  return (
    <div className="space-y-6">
      {/* Top KPI Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Total Consumption
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {Number(summary.total_consumption_kwh).toLocaleString()} <span className="text-sm font-normal text-gray-500">kWh</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Across {Number(summary.total_readings).toLocaleString()} cleaned readings ({summary.total_households.toLocaleString()} households)
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Average Consumption
          </p>
          <p className="mt-2 text-2xl font-bold" style={{ color: TOKENS.green[900] }}>
            {summary.average_consumption_kwh} <span className="text-sm font-normal text-gray-500">kWh</span>
          </p>
          <span
            className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
          >
            Daily series mean: {summary.daily_average_consumption_kwh} kWh
          </span>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Peak Consumption Hour
          </p>
          <p className="mt-2 text-2xl font-bold" style={{ color: TOKENS.red[700] }}>
            {summary.peak_hour_label}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Mean <span className="font-semibold" style={{ color: TOKENS.red[800] }}>{summary.peak_hour_mean_kwh} kWh</span> (Lowest: {String(summary.lowest_hour).padStart(2, '0')}:00 at {summary.lowest_hour_mean_kwh} kWh)
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Best Forecasting Model
          </p>
          <p className="mt-2 text-lg font-bold text-gray-900">{summary.best_model}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span
              className="rounded px-2 py-0.5 font-semibold"
              style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
            >
              RMSE: {summary.best_model_rmse} kWh
            </span>
            <span
              className="rounded px-2 py-0.5 font-semibold"
              style={{ backgroundColor: '#fde8ec', color: TOKENS.red[800] }}
            >
              R²: {summary.best_model_r2}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Readings Above Typical
          </p>
          <p
            className="mt-2 text-2xl font-bold"
            style={{ color: shareAbove > 50 ? TOKENS.red[700] : TOKENS.green[900] }}
          >
            {summary.share_above_typical_pct}%
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {summary.share_days_above_typical_pct}% of daily averages exceed {summary.daily_average_consumption_kwh} kWh
          </p>
        </div>
      </div>

      {/* Middle Section: Semicircle Gauge + Consumption by Device/Region Bar Chart */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Semicircle Gauge Card */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-xs lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Consumption vs Typical</h2>
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
              >
                Baseline: {summary.average_consumption_kwh} kWh
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Share of household meter readings exceeding the typical household average ({summary.average_consumption_kwh} kWh)
            </p>
          </div>

          <div className="my-4">
            <SemicircleGauge
              value={shareAbove}
              min={0}
              max={100}
              centerText={`${shareAbove.toFixed(1)}%`}
              subText={`Mean ${summary.average_consumption_kwh} kWh | Peak Demand ${summary.mean_peak_demand_kw} kW vs Off-Peak ${summary.mean_offpeak_demand_kw} kW`}
              statusLabel={
                isTypicalGood
                  ? 'Balanced (~50% at or below typical)'
                  : 'Elevated Share Above Typical'
              }
              isGood={isTypicalGood}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs">
            <div className="rounded-lg p-2.5" style={{ backgroundColor: TOKENS.green[100] }}>
              <span className="font-semibold" style={{ color: TOKENS.green[900] }}>
                At / Below Typical: {(100 - shareAbove).toFixed(2)}%
              </span>
              <p className="mt-0.5 text-[11px]" style={{ color: TOKENS.green[700] }}>
                Off-peak mean demand: {summary.mean_offpeak_demand_kw} kW
              </p>
            </div>
            <div className="rounded-lg p-2.5" style={{ backgroundColor: '#fde8ec' }}>
              <span className="font-semibold" style={{ color: TOKENS.red[800] }}>
                Above Typical: {shareAbove.toFixed(2)}%
              </span>
              <p className="mt-0.5 text-[11px]" style={{ color: TOKENS.red[700] }}>
                Peak demand: {summary.mean_peak_demand_kw} kW (+52.7%)
              </p>
            </div>
          </div>
        </div>

        {/* Small Bar Chart of Consumption by Device or Region (highest bar in red) */}
        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-xs lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-gray-900">
                {breakdownMode === 'device'
                  ? 'Consumption by Appliance Category (Mean Energy Draw)'
                  : 'Consumption by Grid Region (Mean Reading kWh)'}
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Highest-consuming {breakdownMode} highlighted in red ({TOKENS.red[500]}); remaining categories in green
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 text-xs">
              <button
                onClick={() => setBreakdownMode('device')}
                className="rounded-md px-3 py-1 font-semibold transition"
                style={{
                  backgroundColor: breakdownMode === 'device' ? TOKENS.green[900] : 'transparent',
                  color: breakdownMode === 'device' ? '#ffffff' : '#374151',
                }}
              >
                By Device
              </button>
              <button
                onClick={() => setBreakdownMode('region')}
                className="rounded-md px-3 py-1 font-semibold transition"
                style={{
                  backgroundColor: breakdownMode === 'region' ? TOKENS.green[900] : 'transparent',
                  color: breakdownMode === 'region' ? '#ffffff' : '#374151',
                }}
              >
                By Region
              </button>
            </div>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 20, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#374151' }} />
                <YAxis
                  domain={breakdownMode === 'device' ? [19.5, 21.0] : [25.0, 26.0]}
                  tick={{ fontSize: 12, fill: '#374151' }}
                  unit=" kWh"
                />
                <Tooltip
                  formatter={(val) => [`${val} kWh`, 'Mean Consumption']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderColor: '#e5e7eb',
                    borderRadius: '0.5rem',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
                  {chartData.map((entry, idx) => {
                    const isHighest = entry.value === maxVal;
                    return (
                      <Cell
                        key={`cell-${idx}`}
                        fill={isHighest ? TOKENS.red[500] : TOKENS.green[500]}
                      />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 sm:grid-cols-4">
            {chartData.map((item) => {
              const isHighest = item.value === maxVal;
              return (
                <div
                  key={item.name}
                  className="rounded-lg border px-3 py-2 text-xs"
                  style={{
                    borderColor: isHighest ? TOKENS.red[500] : '#e5e7eb',
                    backgroundColor: isHighest ? '#fde8ec' : '#ffffff',
                  }}
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span style={{ color: isHighest ? TOKENS.red[800] : '#1f2937' }}>
                      {item.name}
                    </span>
                    <span style={{ color: isHighest ? TOKENS.red[600] : TOKENS.green[900] }}>
                      {item.value} kWh
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-gray-500">{item.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
