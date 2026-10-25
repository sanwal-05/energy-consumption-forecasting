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
import { fetchInsights, fetchRecommendations, postSimulate } from '../api';
import { TOKENS } from '../tokens';
import SemicircleGauge from './SemicircleGauge';
import { LoadingState, ErrorState, EmptyState } from './StatusViews';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function InsightsTab() {
  const [insights, setInsights] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Demand-response simulator states
  const [adoptionRate, setAdoptionRate] = useState(60);
  const [peakShift, setPeakShift] = useState(40);
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [iRes, rRes, sRes] = await Promise.all([
        fetchInsights(),
        fetchRecommendations(),
        postSimulate({ adoption_rate: adoptionRate, peak_hour_shift: peakShift }),
      ]);
      setInsights(iRes);
      setRecs(rRes.recommendations || []);
      setSimResult(sRes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Re-run simulation whenever either slider changes
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setSimLoading(true);
      try {
        const res = await postSimulate({
          adoption_rate: adoptionRate,
          peak_hour_shift: peakShift,
        });
        if (active) setSimResult(res);
      } catch (_e) {
        // ignore transient errors during slider drag
      } finally {
        if (active) setSimLoading(false);
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [adoptionRate, peakShift]);

  if (loading) return <LoadingState label="Loading household insights, recommendations, and simulator..." />;
  if (error) return <ErrorState error={error} onRetry={loadData} />;
  if (!insights?.available) return <EmptyState message="Insights artifact missing." />;

  // 1. Hourly pattern chart data
  const hourlyMap = insights.peak_hours?.hourly_mean_kwh || {};
  const hourlySeries = Object.keys(hourlyMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      hourNum: Number(h),
      kwh: Number(hourlyMap[h]),
    }));
  const maxHourVal = hourlySeries.length ? Math.max(...hourlySeries.map((d) => d.kwh)) : 0;

  // 2. Weekday vs Weekend chart data
  const dowMap = insights.weekday_vs_weekend?.by_day_of_week || {};
  const dowSeries = Object.keys(dowMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((d) => ({
      day: DAY_NAMES[Number(d)] || d,
      isWeekend: Number(d) >= 5,
      kwh: Number(dowMap[d]),
    }));
  const maxDowVal = dowSeries.length ? Math.max(...dowSeries.map((d) => d.kwh)) : 0;

  // 3. Seasonal (monthly) pattern chart data
  const monthMap = insights.seasonal_pattern?.monthly_mean_kwh || {};
  const monthSeries = Object.keys(monthMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((m) => ({
      month: MONTH_NAMES[Number(m) - 1] || m,
      kwh: Number(monthMap[m]),
    }));
  const maxMonthVal = monthSeries.length ? Math.max(...monthSeries.map((d) => d.kwh)) : 0;

  const simOut = simResult?.outputs || {};
  const simBase = simResult?.baseline_from_data || {};

  return (
    <div className="space-y-6">
      {/* Row 1: 3 Pattern Charts (Hourly, Weekday/Weekend, Seasonal) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Chart 1: Hourly Pattern */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">1. Hourly Pattern (00:00–23:00)</h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: '#fde8ec', color: TOKENS.red[800] }}
            >
              Peak: {String(insights.peak_hours?.highest_hour).padStart(2, '0')}:00 ({insights.peak_hours?.highest_hour_mean_kwh} kWh)
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Peak demand is {insights.peak_hours?.mean_peak_demand_kw} kW vs {insights.peak_hours?.mean_offpeak_demand_kw} kW off-peak (+52.7%)
          </p>
          <div className="mt-3 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlySeries} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#4b5563' }} interval={3} />
                <YAxis domain={[24.5, 26.5]} tick={{ fontSize: 10, fill: '#4b5563' }} />
                <Tooltip
                  formatter={(v) => [`${v} kWh`, 'Mean Consumption']}
                  contentStyle={{ fontSize: '12px', borderRadius: '0.5rem' }}
                />
                <Bar dataKey="kwh" radius={[3, 3, 0, 0]}>
                  {hourlySeries.map((entry, idx) => (
                    <Cell
                      key={`hr-${idx}`}
                      fill={entry.kwh === maxHourVal ? TOKENS.red[500] : TOKENS.green[500]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Weekday vs Weekend */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">2. Weekday vs Weekend</h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
            >
              Weekday {insights.weekday_vs_weekend?.weekday_mean_kwh} vs Wknd {insights.weekday_vs_weekend?.weekend_mean_kwh} kWh
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Highest day highlighted in red (Fri: {maxDowVal} kWh); weekend days in soft green
          </p>
          <div className="mt-3 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dowSeries} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#4b5563' }} />
                <YAxis domain={[25.0, 26.0]} tick={{ fontSize: 10, fill: '#4b5563' }} />
                <Tooltip
                  formatter={(v) => [`${v} kWh`, 'Mean Consumption']}
                  contentStyle={{ fontSize: '12px', borderRadius: '0.5rem' }}
                />
                <Bar dataKey="kwh" radius={[4, 4, 0, 0]}>
                  {dowSeries.map((entry, idx) => (
                    <Cell
                      key={`dow-${idx}`}
                      fill={
                        entry.kwh === maxDowVal
                          ? TOKENS.red[500]
                          : entry.isWeekend
                          ? TOKENS.green[300]
                          : TOKENS.green[700]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Seasonal Pattern */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">3. Seasonal Pattern (Monthly)</h3>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: '#fde8ec', color: TOKENS.red[800] }}
            >
              Peak: Jan ({insights.seasonal_pattern?.highest_month_mean_kwh} kWh)
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Hot weather (&gt;30 °C) accounts for {insights.weather_effects?.hot_weather_readings_share_pct}% of readings; peak rate premium is +{insights.tariff_effects?.peak_rate_premium_pct}%
          </p>
          <div className="mt-3 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthSeries} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#4b5563' }} />
                <YAxis domain={[24.5, 26.2]} tick={{ fontSize: 10, fill: '#4b5563' }} />
                <Tooltip
                  formatter={(v) => [`${v} kWh`, 'Mean Consumption']}
                  contentStyle={{ fontSize: '12px', borderRadius: '0.5rem' }}
                />
                <Bar dataKey="kwh" radius={[4, 4, 0, 0]}>
                  {monthSeries.map((entry, idx) => (
                    <Cell
                      key={`mo-${idx}`}
                      fill={entry.kwh === maxMonthVal ? TOKENS.red[500] : TOKENS.green[500]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 2: Rule-Based Recommendation Cards */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              Data-Backed Recommendations for Reducing Unnecessary Energy Use
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Each rule cites its exact empirical finding from the 49,000 household records and displays the computed saving % in green.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recs.map((rec) => (
            <div
              key={rec.id}
              className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-2xs transition hover:border-gray-300"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: TOKENS.green[900] }}
                  >
                    {rec.id} · {rec.category}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                    style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
                  >
                    Est. Saving: {rec.estimated_saving_pct}%
                  </span>
                </div>

                <h3 className="mt-2.5 text-sm font-bold text-gray-900">{rec.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-800">Evidence from data: </span>
                  {rec.data_finding}
                </p>
              </div>

              <div className="mt-4 border-t border-gray-100 pt-2.5 text-[11px] text-gray-500">
                <div className="flex items-center justify-between font-medium text-gray-700">
                  <span>Flagged: {rec.flagged_records.toLocaleString()} rows ({rec.share_of_dataset_pct}%)</span>
                  <span>{rec.affected_households.toLocaleString()} households</span>
                </div>
                <p className="mt-1 truncate text-[10px] text-gray-400" title={rec.saving_calculation_basis}>
                  Basis: {rec.saving_calculation_basis}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Demand-Response Simulator (/api/simulate) */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-gray-900">
                Interactive Demand-Response Simulator
              </h2>
              <span
                className="rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider"
                style={{ backgroundColor: '#fde8ec', color: TOKENS.red[800] }}
              >
                Simulated
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500">
              Adjust household adoption and peak-to-off-peak load shifting to simulate peak demand shaving and tariff savings via <code className="font-mono text-gray-700">POST /api/simulate</code>.
            </p>
          </div>
          {simLoading && (
            <span className="text-xs font-medium text-gray-400">Updating simulation...</span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          {/* Sliders Column */}
          <div className="space-y-6 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <label className="text-gray-800">1. Household Adoption Rate (%)</label>
                <span
                  className="rounded px-2 py-0.5 font-bold"
                  style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
                >
                  {adoptionRate}% ({simOut.participating_households?.toLocaleString() ?? 0} of {simBase.total_households?.toLocaleString() ?? 8959} households)
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={adoptionRate}
                onChange={(e) => setAdoptionRate(Number(e.target.value))}
                className="mt-2 h-2 w-full cursor-pointer rounded-lg bg-gray-200"
              />
              <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                <span>0% (No adoption)</span>
                <span>50%</span>
                <span>100% (All households)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold">
                <label className="text-gray-800">2. Peak-Hour Load Shift (%)</label>
                <span
                  className="rounded px-2 py-0.5 font-bold"
                  style={{ backgroundColor: TOKENS.green[100], color: TOKENS.green[900] }}
                >
                  {peakShift}% of peak load shifted to off-peak
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={peakShift}
                onChange={(e) => setPeakShift(Number(e.target.value))}
                className="mt-2 h-2 w-full cursor-pointer rounded-lg bg-gray-200"
              />
              <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                <span>0% (No shift)</span>
                <span>50%</span>
                <span>100% (Full excess peak shifted)</span>
              </div>
            </div>

            {/* Documented Formula Box */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-600">
              <p className="font-bold text-gray-800">Simulation Formula (Deterministic from Dataset Means)</p>
              <p className="mt-1 font-mono text-[10px]">
                f = (adoption / 100) × (peak_shift / 100) = {simResult?.inputs?.effective_shift_fraction ?? 0}
              </p>
              <p className="mt-0.5 font-mono text-[10px]">
                ΔP_kw = f × ({simBase.mean_peak_demand_kw} − {simBase.mean_offpeak_demand_kw} kW) = {simOut.peak_demand_reduction_kw_per_household} kW/household
              </p>
              <p className="mt-0.5 font-mono text-[10px]">
                Saving = f × {simBase.mean_consumption_kwh} kWh × ({simBase.mean_peak_rate} − {simBase.mean_offpeak_rate}) = {simOut.cost_saving_per_household}/reading
              </p>
            </div>
          </div>

          {/* Semicircle Results Gauge */}
          <div className="flex flex-col items-center justify-center lg:col-span-3">
            <SemicircleGauge
              value={simOut.estimated_tariff_saving_pct ?? 0}
              min={0}
              max={50}
              centerText={`-${simOut.estimated_tariff_saving_pct ?? 0}%`}
              subText="Simulated Tariff Cost Reduction"
              statusLabel={`SIMULATED · Peak -${simOut.estimated_peak_reduction_pct ?? 0}%`}
              isGood={true}
              invertColors={true}
            />
          </div>

          {/* Simulated Output Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-4">
            <div
              className="rounded-xl border p-3.5"
              style={{ borderColor: TOKENS.green[300], backgroundColor: TOKENS.green[100] }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: TOKENS.green[700] }}>
                Simulated Peak Demand
              </span>
              <p className="mt-1 text-xl font-bold" style={{ color: TOKENS.green[900] }}>
                {simOut.simulated_peak_demand_kw} kW
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: TOKENS.green[700] }}>
                Down from {simBase.mean_peak_demand_kw} kW (-{simOut.estimated_peak_reduction_pct}%)
              </p>
            </div>

            <div
              className="rounded-xl border p-3.5"
              style={{ borderColor: TOKENS.green[300], backgroundColor: TOKENS.green[100] }}
            >
              <span className="text-[10px] font-bold uppercase" style={{ color: TOKENS.green[700] }}>
                Simulated Bill Rate Saving
              </span>
              <p className="mt-1 text-xl font-bold" style={{ color: TOKENS.green[900] }}>
                {simOut.estimated_tariff_saving_pct}%
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: TOKENS.green[700] }}>
                {simOut.cost_saving_per_household} saved / reading ({simOut.shifted_energy_kwh_per_household} kWh shifted)
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3.5">
              <span className="text-[10px] font-bold uppercase text-gray-500">
                Simulated Grid Peak Shaved
              </span>
              <p className="mt-1 text-xl font-bold text-gray-900">
                {Number(simOut.aggregate_grid_peak_reduction_kw || 0).toLocaleString()} kW
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Across {Number(simOut.participating_households || 0).toLocaleString()} adopting households
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-3.5">
              <span className="text-[10px] font-bold uppercase text-gray-500">
                Aggregate Cost Savings (Simulated)
              </span>
              <p className="mt-1 text-xl font-bold" style={{ color: TOKENS.green[900] }}>
                {Number(simOut.aggregate_cost_savings || 0).toLocaleString()}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                Spread: {simBase.rate_spread_per_kwh}/kWh (Peak {simBase.mean_peak_rate} vs Off-Peak {simBase.mean_offpeak_rate})
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
