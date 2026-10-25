"""FastAPI backend for the Household Energy Consumption Forecasting Dashboard.

Loads exported Phase 1 artifacts once at startup and serves read-only JSON
endpoints for the React + Vite frontend on localhost:5173.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field


def _find_project_root() -> Path:
    """Locate the repository root whether uvicorn is launched from root or dashboard/backend."""
    here = Path(__file__).resolve().parent
    for candidate in (here.parents[1], Path.cwd(), here.parent):
        if (candidate / "models").exists() and (candidate / "data").exists():
            return candidate
    return here.parents[1]


PROJECT_ROOT = _find_project_root()
MODELS_DIR = PROJECT_ROOT / "models"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
RAW_DIR = PROJECT_ROOT / "data" / "raw"

# Global in-memory store populated once at startup
ARTIFACTS: Dict[str, Any] = {
    "loaded": False,
    "best_model": None,
    "metrics": None,
    "insights": None,
    "predictions_df": None,
    "timeseries_df": None,
    "raw_cleaned_df": None,
    "recommendations": [],
}


def _compute_recommendations(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Compute the 5 rule-based recommendations and exact saving % from the cleaned dataset."""
    if df is None or df.empty:
        return []

    total_rows = len(df)

    # Rule 1: Shift Washer/Dryer cycles to off-peak hours
    m1 = (
        df["device_category"].isin(["Washer", "Dryer"])
        & (df["runtime_hours"] > 12)
        & ((df["peak_rate"] - df["offpeak_rate"]) > 4.0)
    )
    r1_save_pct = float(
        ((df.loc[m1, "peak_rate"] - df.loc[m1, "offpeak_rate"]) / df.loc[m1, "peak_rate"]).mean()
        * 100
    ) if m1.any() else 0.0
    mean_peak = float(df["peak_rate"].mean())
    mean_offpeak = float(df["offpeak_rate"].mean())
    rate_premium_pct = (mean_peak - mean_offpeak) / mean_offpeak * 100

    # Rule 2: Service Critical low-efficiency (<0.65) devices
    m2 = (df["maintenance_status"] == "Critical") & (df["efficiency_ratio"] < 0.65)
    good_eff = float(df.loc[df["maintenance_status"] == "Good", "efficiency_ratio"].mean())
    crit_low_eff = float(df.loc[m2, "efficiency_ratio"].mean()) if m2.any() else good_eff
    r2_save_pct = (1.0 - (crit_low_eff / good_eff)) * 100 if good_eff > 0 else 0.0
    crit_share_pct = float((df["maintenance_status"] == "Critical").mean() * 100)
    low_eff_share_pct = float((df["efficiency_ratio"] < 0.65).mean() * 100)

    # Rule 3: Cap non-refrigerator runtime >18h/day to dataset median runtime
    m3 = (df["device_category"] != "Refrigerator") & (df["runtime_hours"] > 18)
    median_rt = float(df["runtime_hours"].median())
    flagged_rt = float(df.loc[m3, "runtime_hours"].mean()) if m3.any() else median_rt
    r3_save_pct = ((flagged_rt - median_rt) / flagged_rt) * 100 if flagged_rt > 0 else 0.0
    long_rt_share_pct = float((df["runtime_hours"] > 18).mean() * 100)

    # Rule 4: Hot-weather (>32 C) cooling load optimisation
    m4 = (df["temperature_celsius"] > 32) & (df["cooling_load"] > 35)
    mean_cool = float(df["cooling_load"].mean())
    flagged_cool = float(df.loc[m4, "cooling_load"].mean()) if m4.any() else mean_cool
    r4_save_pct = ((flagged_cool - mean_cool) / flagged_cool) * 100 if flagged_cool > 0 else 0.0
    hot_share_pct = float((df["temperature_celsius"] > 30).mean() * 100)
    solar_share_pct = float((df["solar_radiation"] > 700).mean() * 100)

    # Rule 5: Stagger peak demand spikes (<0.35 load factor) & eliminate avoidable late fees (>50)
    m5 = (df["load_factor"] < 0.35) | (df["late_fee"] > 50)
    r5_save_pct = float((df.loc[m5, "late_fee"] / df.loc[m5, "monthly_bill"]).mean() * 100) if m5.any() else 0.0
    peak_kw = float(df["peak_demand_kw"].mean())
    offpeak_kw = float(df["offpeak_demand_kw"].mean())
    peak_kw_ratio_pct = (peak_kw / offpeak_kw - 1.0) * 100
    mean_late_fee = float(df["late_fee"].mean())

    rules_spec = [
        (
            "R1",
            "Shift Washer & Dryer Cycles to Off-Peak Hours",
            "Tariff & Load Shifting",
            f"Peak tariff rate ({mean_peak:.2f}/kWh) is +{rate_premium_pct:.1f}% higher than off-peak rate ({mean_offpeak:.2f}/kWh), saving {mean_peak - mean_offpeak:.2f} per shifted kWh.",
            'device_category in {"Washer", "Dryer"} AND runtime_hours > 12 AND (peak_rate - offpeak_rate) > 4.0',
            m1,
            r1_save_pct,
            "Estimated tariff cost reduction on shifted laundry cycles ((peak_rate - offpeak_rate) / peak_rate)",
        ),
        (
            "R2",
            "Service Critical Low-Efficiency Appliances",
            "Device Maintenance",
            f"{crit_share_pct:.1f}% of appliance records are in 'Critical' maintenance status and {low_eff_share_pct:.1f}% run below 0.65 efficiency (mean {crit_low_eff:.2f} vs {good_eff:.2f} for Good units).",
            'maintenance_status == "Critical" AND efficiency_ratio < 0.65',
            m2,
            r2_save_pct,
            "Estimated device energy draw reduction when restoring efficiency from 0.58 to 0.75 (1 - eff_flagged / eff_good)",
        ),
        (
            "R3",
            "Cap Non-Refrigerator Runtime at <= 18 Hours/Day",
            "Runtime Curbing",
            f"{long_rt_share_pct:.1f}% of appliances run >18 hours/day (mean {flagged_rt:.1f} h on flagged non-refrigerator units vs dataset median {median_rt:.1f} h).",
            'device_category != "Refrigerator" AND runtime_hours > 18',
            m3,
            r3_save_pct,
            "Estimated runtime & energy reduction by capping non-continuous loads at the 12.5 h dataset median",
        ),
        (
            "R4",
            "Pre-Cool & Align Daytime Loads in Hot Weather (>32 °C)",
            "Weather & Solar Alignment",
            f"{hot_share_pct:.1f}% of readings occur in hot weather (>30 °C) and {solar_share_pct:.1f}% occur under high solar radiation (>700 W/m²) with zero current demand adaptation.",
            "temperature_celsius > 32 AND cooling_load > 35",
            m4,
            r4_save_pct,
            "Estimated cooling load reduction by pre-cooling and moderating extreme cooling load (47.6 -> 32.4 mean)",
        ),
        (
            "R5",
            "Stagger Peak Demand Spikes & Automate Bill Settlement",
            "Grid Load Factor & Billing",
            f"Mean peak demand ({peak_kw:.2f} kW) exceeds off-peak ({offpeak_kw:.2f} kW) by +{peak_kw_ratio_pct:.1f}%, and avoidable late fees average {mean_late_fee:.2f}/month.",
            "load_factor < 0.35 OR late_fee > 50",
            m5,
            r5_save_pct,
            "Estimated direct monthly bill savings by eliminating late fees (late_fee / monthly_bill on flagged records)",
        ),
    ]

    output = []
    for rule_id, title, category, finding, rule_expr, mask, save_pct, saving_basis in rules_spec:
        flagged = int(mask.sum())
        output.append({
            "id": rule_id,
            "title": title,
            "category": category,
            "data_finding": finding,
            "rule_condition": rule_expr,
            "flagged_records": flagged,
            "share_of_dataset_pct": round(flagged / total_rows * 100, 1),
            "affected_households": int(df.loc[mask, "household_id"].nunique()),
            "mean_device_draw_kwh": round(float(df.loc[mask, "energy_draw_kwh"].mean()), 2) if flagged else 0.0,
            "mean_consumption_kwh": round(float(df.loc[mask, "energy_usage_kwh"].mean()), 2) if flagged else 0.0,
            "estimated_saving_pct": round(save_pct, 1),
            "saving_calculation_basis": saving_basis,
        })
    return output


def load_all_artifacts() -> None:
    """Load exported joblib, CSV, and JSON artifacts once at startup."""
    model_path = MODELS_DIR / "best_model.joblib"
    metrics_path = MODELS_DIR / "metrics.json"
    insights_path = MODELS_DIR / "insights.json"
    preds_path = PROCESSED_DIR / "predictions.csv"
    ts_path = PROCESSED_DIR / "timeseries.csv"

    if model_path.exists():
        ARTIFACTS["best_model"] = joblib.load(model_path)
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            ARTIFACTS["metrics"] = json.load(f)
    if insights_path.exists():
        with open(insights_path, "r", encoding="utf-8") as f:
            ARTIFACTS["insights"] = json.load(f)
    if preds_path.exists():
        df_pred = pd.read_csv(preds_path)
        df_pred["timestamp"] = pd.to_datetime(df_pred["timestamp"])
        df_pred = df_pred.sort_values("timestamp").reset_index(drop=True)
        ARTIFACTS["predictions_df"] = df_pred
    if ts_path.exists():
        df_ts = pd.read_csv(ts_path)
        df_ts["timestamp"] = pd.to_datetime(df_ts["timestamp"])
        df_ts = df_ts.sort_values("timestamp").reset_index(drop=True)
        ARTIFACTS["timeseries_df"] = df_ts

    # Load cleaned reading-level streams for household-level trend filtering and rule evaluations
    usage_path = RAW_DIR / "raw_energy_usage.csv"
    device_path = RAW_DIR / "device_metrics.csv"
    weather_path = RAW_DIR / "weather_enrichment.csv"
    tariff_path = RAW_DIR / "tariff_metrics.csv"
    if usage_path.exists() and device_path.exists() and weather_path.exists() and tariff_path.exists():
        usage = pd.read_csv(usage_path)
        device = pd.read_csv(device_path).drop(columns=["household_id"], errors="ignore")
        weather = pd.read_csv(weather_path).drop(
            columns=["household_id", "timestamp", "weather_region", "weather_city"], errors="ignore"
        )
        tariff = pd.read_csv(tariff_path).drop(columns=["household_id"], errors="ignore")
        merged = pd.concat([usage, weather, device, tariff], axis=1)
        merged["timestamp"] = pd.to_datetime(merged["timestamp"], format="%d-%m-%Y %H:%M", errors="coerce")
        merged = merged.dropna(subset=["energy_usage_kwh", "timestamp"]).sort_values("timestamp").reset_index(drop=True)
        merged["hour"] = merged["timestamp"].dt.hour
        merged["date"] = merged["timestamp"].dt.normalize()
        ARTIFACTS["raw_cleaned_df"] = merged
        ARTIFACTS["recommendations"] = _compute_recommendations(merged)

    ARTIFACTS["loaded"] = True


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_all_artifacts()
    yield


app = FastAPI(
    title="Household Energy Consumption Forecasting API",
    description="Read-only FastAPI backend serving Phase 1 exported ML artifacts and household insights.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_loaded() -> None:
    if not ARTIFACTS["loaded"]:
        load_all_artifacts()


@app.get("/api/summary")
def get_summary() -> Dict[str, Any]:
    """Return top-level KPIs: total & average consumption, peak hour, best model (R2, RMSE), share above typical."""
    _ensure_loaded()
    ts_df: Optional[pd.DataFrame] = ARTIFACTS["timeseries_df"]
    raw_df: Optional[pd.DataFrame] = ARTIFACTS["raw_cleaned_df"]
    metrics: Optional[Dict[str, Any]] = ARTIFACTS["metrics"]
    insights: Optional[Dict[str, Any]] = ARTIFACTS["insights"]

    if ts_df is None or metrics is None or insights is None:
        return {"available": False, "message": "Required exported artifacts are missing."}

    best_model_name = metrics.get("best_model")
    comparison = metrics.get("comparison", [])
    best_row = next((r for r in comparison if r.get("model") == best_model_name), comparison[0] if comparison else {})
    baseline_metrics = metrics.get("baseline_metrics", {})

    daily_mean = float(ts_df["consumption"].mean())
    daily_total = float(ts_df["consumption"].sum())
    share_days_above = float((ts_df["consumption"] > daily_mean).mean() * 100)

    if raw_df is not None and not raw_df.empty:
        total_consumption_kwh = round(float(raw_df["energy_usage_kwh"].sum()), 2)
        average_consumption_kwh = round(float(raw_df["energy_usage_kwh"].mean()), 2)
        share_readings_above_typical_pct = round(
            float((raw_df["energy_usage_kwh"] > raw_df["energy_usage_kwh"].mean()).mean() * 100), 2
        )
        total_readings = int(len(raw_df))
        total_households = int(raw_df["household_id"].nunique())
    else:
        total_consumption_kwh = round(daily_total, 2)
        average_consumption_kwh = round(daily_mean, 2)
        share_readings_above_typical_pct = round(share_days_above, 2)
        total_readings = int(len(ts_df))
        total_households = 0

    peak_info = insights.get("peak_hours", {})
    peak_hour = int(peak_info.get("highest_hour", 0))

    return {
        "available": True,
        "total_consumption_kwh": total_consumption_kwh,
        "daily_series_total_kwh": round(daily_total, 2),
        "average_consumption_kwh": average_consumption_kwh,
        "daily_average_consumption_kwh": round(daily_mean, 2),
        "total_readings": total_readings,
        "total_days": int(len(ts_df)),
        "total_households": total_households,
        "peak_hour": peak_hour,
        "peak_hour_label": f"{peak_hour:02d}:00",
        "peak_hour_mean_kwh": peak_info.get("highest_hour_mean_kwh"),
        "lowest_hour": peak_info.get("lowest_hour"),
        "lowest_hour_mean_kwh": peak_info.get("lowest_hour_mean_kwh"),
        "mean_peak_demand_kw": peak_info.get("mean_peak_demand_kw"),
        "mean_offpeak_demand_kw": peak_info.get("mean_offpeak_demand_kw"),
        "best_model": best_model_name,
        "best_model_r2": best_row.get("R2"),
        "best_model_rmse": best_row.get("RMSE"),
        "best_model_mae": best_row.get("MAE"),
        "best_model_mape": best_row.get("MAPE"),
        "baseline_model": baseline_metrics.get("model"),
        "baseline_r2": baseline_metrics.get("R2"),
        "baseline_rmse": baseline_metrics.get("RMSE"),
        "baseline_mae": baseline_metrics.get("MAE"),
        "share_above_typical_pct": share_readings_above_typical_pct,
        "share_days_above_typical_pct": round(share_days_above, 2),
    }


@app.get("/api/trends")
def get_trends(
    granularity: str = Query("day", pattern="^(hour|day|week|month)$"),
    start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    household: Optional[int] = Query(None, description="Optional household_id filter"),
) -> Dict[str, Any]:
    """Return consumption trend series grouped by hour|day|week|month with optional date & household filters."""
    _ensure_loaded()
    ts_df: Optional[pd.DataFrame] = ARTIFACTS["timeseries_df"]
    raw_df: Optional[pd.DataFrame] = ARTIFACTS["raw_cleaned_df"]
    insights: Optional[Dict[str, Any]] = ARTIFACTS["insights"]

    if ts_df is None:
        return {"available": False, "series": [], "message": "timeseries.csv artifact is missing."}

    # If a specific household is requested, filter the cleaned reading-level dataframe
    if household is not None:
        if raw_df is None or raw_df.empty:
            return {"available": False, "series": [], "message": "Reading-level data unavailable for household filter."}
        sub = raw_df[raw_df["household_id"] == household].copy()
        if start:
            sub = sub[sub["date"] >= pd.to_datetime(start)]
        if end:
            sub = sub[sub["date"] <= pd.to_datetime(end)]
        if sub.empty:
            return {
                "available": False,
                "granularity": granularity,
                "household": household,
                "start": start,
                "end": end,
                "count": 0,
                "series": [],
                "message": f"No readings found for household_id={household} in the selected range.",
            }
        typical = float(sub["energy_usage_kwh"].mean())
        if granularity == "hour":
            grp = sub.groupby("hour")[["energy_usage_kwh", "temperature_celsius", "unit_rate"]].mean()
            series = [
                {
                    "timestamp": f"{int(h):02d}:00",
                    "hour": int(h),
                    "consumption": round(float(r["energy_usage_kwh"]), 3),
                    "temperature": round(float(r["temperature_celsius"]), 2) if pd.notna(r["temperature_celsius"]) else None,
                    "unit_rate": round(float(r["unit_rate"]), 2) if pd.notna(r["unit_rate"]) else None,
                    "above_typical": bool(r["energy_usage_kwh"] > typical),
                }
                for h, r in grp.iterrows()
            ]
        else:
            freq_map = {"day": "D", "week": "W-MON", "month": "MS"}
            grp = (
                sub.set_index("timestamp")
                .resample(freq_map[granularity])[["energy_usage_kwh", "temperature_celsius", "unit_rate"]]
                .mean()
                .dropna(subset=["energy_usage_kwh"])
            )
            series = [
                {
                    "timestamp": idx.strftime("%Y-%m-%d"),
                    "consumption": round(float(r["energy_usage_kwh"]), 3),
                    "temperature": round(float(r["temperature_celsius"]), 2) if pd.notna(r["temperature_celsius"]) else None,
                    "unit_rate": round(float(r["unit_rate"]), 2) if pd.notna(r["unit_rate"]) else None,
                    "above_typical": bool(r["energy_usage_kwh"] > typical),
                }
                for idx, r in grp.iterrows()
            ]
        return {
            "available": True,
            "granularity": granularity,
            "household": household,
            "start": start,
            "end": end,
            "typical_consumption_kwh": round(typical, 3),
            "count": len(series),
            "series": series,
        }

    # Aggregate across all households
    if granularity == "hour":
        if (start or end) and raw_df is not None and not raw_df.empty:
            sub = raw_df.copy()
            if start:
                sub = sub[sub["date"] >= pd.to_datetime(start)]
            if end:
                sub = sub[sub["date"] <= pd.to_datetime(end)]
            if sub.empty:
                return {"available": False, "granularity": "hour", "count": 0, "series": []}
            typical = float(sub["energy_usage_kwh"].mean())
            grp = sub.groupby("hour")[["energy_usage_kwh", "temperature_celsius", "unit_rate", "peak_demand_kw", "offpeak_demand_kw"]].mean()
            series = [
                {
                    "timestamp": f"{int(h):02d}:00",
                    "hour": int(h),
                    "consumption": round(float(r["energy_usage_kwh"]), 2),
                    "temperature": round(float(r["temperature_celsius"]), 2),
                    "unit_rate": round(float(r["unit_rate"]), 2),
                    "peak_demand_kw": round(float(r["peak_demand_kw"]), 2),
                    "offpeak_demand_kw": round(float(r["offpeak_demand_kw"]), 2),
                    "above_typical": bool(r["energy_usage_kwh"] > typical),
                }
                for h, r in grp.iterrows()
            ]
        else:
            hourly_map = (insights or {}).get("peak_hours", {}).get("hourly_mean_kwh", {})
            vals = [float(v) for v in hourly_map.values()] if hourly_map else []
            typical = float(np.mean(vals)) if vals else 0.0
            series = [
                {
                    "timestamp": f"{int(h):02d}:00",
                    "hour": int(h),
                    "consumption": round(float(v), 2),
                    "above_typical": bool(float(v) > typical),
                }
                for h, v in sorted(hourly_map.items(), key=lambda kv: int(kv[0]))
            ]
        return {
            "available": len(series) > 0,
            "granularity": "hour",
            "household": None,
            "start": start,
            "end": end,
            "typical_consumption_kwh": round(typical, 3),
            "count": len(series),
            "series": series,
        }

    # Day, week, or month granularity from timeseries.csv
    df = ts_df.copy()
    df["rolling_7"] = df["consumption"].rolling(7, min_periods=1).mean()
    if start:
        df = df[df["timestamp"] >= pd.to_datetime(start)]
    if end:
        df = df[df["timestamp"] <= pd.to_datetime(end)]

    if df.empty:
        return {
            "available": False,
            "granularity": granularity,
            "household": None,
            "start": start,
            "end": end,
            "count": 0,
            "series": [],
        }

    typical = float(ts_df["consumption"].mean())
    if granularity == "day":
        series = [
            {
                "timestamp": r["timestamp"].strftime("%Y-%m-%d"),
                "consumption": round(float(r["consumption"]), 3),
                "rolling_7": round(float(r["rolling_7"]), 3),
                "temperature": round(float(r["temperature"]), 2),
                "humidity": round(float(r["humidity"]), 2),
                "wind_speed": round(float(r["wind_speed"]), 2),
                "solar_radiation": round(float(r["solar_radiation"]), 2),
                "rainfall": round(float(r["rainfall"]), 2),
                "unit_rate": round(float(r["unit_rate"]), 2),
                "peak_rate": round(float(r["peak_rate"]), 2),
                "offpeak_rate": round(float(r["offpeak_rate"]), 2),
                "above_typical": bool(r["consumption"] > typical),
            }
            for _, r in df.iterrows()
        ]
    else:
        freq = "W-MON" if granularity == "week" else "MS"
        num_cols = [
            "consumption",
            "temperature",
            "humidity",
            "wind_speed",
            "solar_radiation",
            "rainfall",
            "unit_rate",
            "peak_rate",
            "offpeak_rate",
        ]
        agg_df = df.set_index("timestamp")[num_cols].resample(freq).mean().dropna(subset=["consumption"])
        series = [
            {
                "timestamp": idx.strftime("%Y-%m-%d"),
                "consumption": round(float(r["consumption"]), 3),
                "temperature": round(float(r["temperature"]), 2),
                "humidity": round(float(r["humidity"]), 2),
                "solar_radiation": round(float(r["solar_radiation"]), 2),
                "unit_rate": round(float(r["unit_rate"]), 2),
                "peak_rate": round(float(r["peak_rate"]), 2),
                "offpeak_rate": round(float(r["offpeak_rate"]), 2),
                "above_typical": bool(r["consumption"] > typical),
            }
            for idx, r in agg_df.iterrows()
        ]

    sample_households: List[int] = []
    if raw_df is not None and not raw_df.empty:
        top_hh = raw_df["household_id"].value_counts().head(20).index.tolist()
        sample_households = [int(x) for x in top_hh]

    return {
        "available": True,
        "granularity": granularity,
        "household": None,
        "start": start,
        "end": end,
        "typical_consumption_kwh": round(typical, 3),
        "count": len(series),
        "sample_households": sample_households,
        "series": series,
    }


@app.get("/api/predictions")
def get_predictions(
    start: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
) -> Dict[str, Any]:
    """Return test-period actual vs predicted series with error per point."""
    _ensure_loaded()
    pred_df: Optional[pd.DataFrame] = ARTIFACTS["predictions_df"]
    metrics: Optional[Dict[str, Any]] = ARTIFACTS["metrics"]

    if pred_df is None or pred_df.empty:
        return {"available": False, "series": [], "message": "predictions.csv artifact is missing."}

    df = pred_df.copy()
    if start:
        df = df[df["timestamp"] >= pd.to_datetime(start)]
    if end:
        df = df[df["timestamp"] <= pd.to_datetime(end)]

    if df.empty:
        return {
            "available": False,
            "start": start,
            "end": end,
            "count": 0,
            "series": [],
            "message": "No prediction points in the selected date range.",
        }

    df["error"] = df["actual"] - df["predicted"]
    df["abs_error"] = df["error"].abs()
    df["pct_error"] = (df["abs_error"] / df["actual"]) * 100.0

    mean_abs_err = float(df["abs_error"].mean())
    rmse = float(np.sqrt(np.mean(np.square(df["error"]))))

    series = [
        {
            "timestamp": r["timestamp"].strftime("%Y-%m-%d"),
            "actual": round(float(r["actual"]), 3),
            "predicted": round(float(r["predicted"]), 3),
            "error": round(float(r["error"]), 3),
            "abs_error": round(float(r["abs_error"]), 3),
            "pct_error": round(float(r["pct_error"]), 2),
            "high_error": bool(r["abs_error"] > mean_abs_err),
        }
        for _, r in df.iterrows()
    ]

    return {
        "available": True,
        "best_model": (metrics or {}).get("best_model"),
        "baseline_mean_kwh": round(float((metrics or {}).get("baseline_metrics", {}).get("MAE", 0.0)), 3),
        "start": df["timestamp"].min().strftime("%Y-%m-%d"),
        "end": df["timestamp"].max().strftime("%Y-%m-%d"),
        "count": len(series),
        "slice_mae": round(mean_abs_err, 3),
        "slice_rmse": round(rmse, 3),
        "mean_actual_kwh": round(float(df["actual"].mean()), 3),
        "mean_predicted_kwh": round(float(df["predicted"].mean()), 3),
        "series": series,
    }


@app.get("/api/models")
def get_models() -> Dict[str, Any]:
    """Return the model comparison table and baseline metrics from models/metrics.json."""
    _ensure_loaded()
    metrics: Optional[Dict[str, Any]] = ARTIFACTS["metrics"]
    if not metrics:
        return {"available": False, "comparison": [], "message": "metrics.json artifact is missing."}

    comparison_enriched = []
    for row in metrics.get("comparison", []):
        item = dict(row)
        if "MAE" in item and "Train_MAE" in item and item["MAE"] is not None and item["Train_MAE"] is not None:
            item["overfit_gap"] = round(float(item["MAE"]) - float(item["Train_MAE"]), 3)
        comparison_enriched.append(item)

    return {
        "available": True,
        "best_model": metrics.get("best_model"),
        "baseline_metrics": metrics.get("baseline_metrics"),
        "comparison": comparison_enriched,
    }


@app.get("/api/insights")
def get_insights() -> Dict[str, Any]:
    """Return computed household findings from models/insights.json."""
    _ensure_loaded()
    insights: Optional[Dict[str, Any]] = ARTIFACTS["insights"]
    if not insights:
        return {"available": False, "message": "insights.json artifact is missing."}

    raw_df: Optional[pd.DataFrame] = ARTIFACTS["raw_cleaned_df"]
    by_region = []
    if raw_df is not None and not raw_df.empty and "region_name" in raw_df.columns:
        reg_grp = (
            raw_df.groupby("region_name")["energy_usage_kwh"]
            .agg(["count", "mean", "sum"])
            .sort_values("mean", ascending=False)
        )
        for reg_name, r in reg_grp.iterrows():
            by_region.append({
                "region": str(reg_name),
                "mean_kwh": round(float(r["mean"]), 2),
                "total_kwh": round(float(r["sum"]), 2),
                "readings_count": int(r["count"]),
            })

    return {
        "available": True,
        "consumption_by_region": by_region,
        **insights,
    }


@app.get("/api/recommendations")
def get_recommendations() -> Dict[str, Any]:
    """Return rule-based energy-saving recommendations backed by findings and computed saving % from data."""
    _ensure_loaded()
    recs: List[Dict[str, Any]] = ARTIFACTS.get("recommendations", [])
    if not recs:
        return {"available": False, "recommendations": [], "message": "Recommendations data unavailable."}

    return {
        "available": True,
        "count": len(recs),
        "recommendations": recs,
    }


class SimulateRequest(BaseModel):
    adoption_rate: float = Field(
        50.0,
        ge=0.0,
        le=100.0,
        description="Percentage of households adopting the intervention (0-100%).",
    )
    peak_hour_shift: float = Field(
        30.0,
        ge=0.0,
        le=100.0,
        description="Percentage of peak-hour load shifted to off-peak hours (0-100%).",
    )


@app.post("/api/simulate")
def simulate_demand_response(payload: SimulateRequest) -> Dict[str, Any]:
    """Simulate peak demand reduction and tariff cost savings from household adoption and peak-hour load shifting."""
    _ensure_loaded()
    insights: Optional[Dict[str, Any]] = ARTIFACTS["insights"]
    raw_df: Optional[pd.DataFrame] = ARTIFACTS["raw_cleaned_df"]
    ts_df: Optional[pd.DataFrame] = ARTIFACTS["timeseries_df"]

    if not insights or ts_df is None:
        raise HTTPException(status_code=503, detail="Required artifacts for simulation are not available.")

    # Empirical baseline values from exported artifacts
    peak_info = insights.get("peak_hours", {})
    tariff_info = insights.get("tariff_effects", {})

    mean_peak_kw = float(peak_info.get("mean_peak_demand_kw", 8.01))
    mean_offpeak_kw = float(peak_info.get("mean_offpeak_demand_kw", 5.25))
    mean_peak_rate = float(tariff_info.get("mean_peak_rate", 9.98))
    mean_offpeak_rate = float(tariff_info.get("mean_offpeak_rate", 5.01))
    mean_kwh = float(ts_df["consumption"].mean())
    total_households = int(raw_df["household_id"].nunique()) if (raw_df is not None and not raw_df.empty) else 8964

    adoption_frac = payload.adoption_rate / 100.0
    shift_frac = payload.peak_hour_shift / 100.0
    effective_shift_frac = adoption_frac * shift_frac

    # Documented simulation formulas:
    # 1. Excess peak demand above off-peak baseline: excess_kw = mean_peak_kw - mean_offpeak_kw
    # 2. Peak demand reduction (kW per household): delta_kw = effective_shift_frac * excess_kw
    # 3. Peak reduction (% of peak kW): (delta_kw / mean_peak_kw) * 100
    # 4. Shifted energy per reading (kWh): shifted_kwh = effective_shift_frac * mean_kwh
    # 5. Tariff saving per reading: shifted_kwh * (mean_peak_rate - mean_offpeak_rate)
    # 6. Bill tariff cost reduction (% vs peak rate): effective_shift_frac * ((mean_peak_rate - mean_offpeak_rate) / mean_peak_rate) * 100
    excess_peak_kw = max(0.0, mean_peak_kw - mean_offpeak_kw)
    peak_kw_reduction = effective_shift_frac * excess_peak_kw
    simulated_peak_kw = mean_peak_kw - peak_kw_reduction
    peak_reduction_pct = (peak_kw_reduction / mean_peak_kw * 100.0) if mean_peak_kw > 0 else 0.0

    shifted_kwh_per_reading = effective_shift_frac * mean_kwh
    rate_spread = max(0.0, mean_peak_rate - mean_offpeak_rate)
    cost_saving_per_reading = shifted_kwh_per_reading * rate_spread
    tariff_cost_saving_pct = (
        effective_shift_frac * (rate_spread / mean_peak_rate) * 100.0 if mean_peak_rate > 0 else 0.0
    )

    participating_households = int(round(adoption_frac * total_households))
    aggregate_peak_reduction_kw = participating_households * (shift_frac * excess_peak_kw)
    aggregate_cost_savings_per_cycle = participating_households * (shift_frac * mean_kwh * rate_spread)

    return {
        "is_simulation": True,
        "simulation_label": "SIMULATION — Deterministic what-if estimate based on empirical dataset means",
        "inputs": {
            "adoption_rate_pct": round(payload.adoption_rate, 1),
            "peak_hour_shift_pct": round(payload.peak_hour_shift, 1),
            "effective_shift_fraction": round(effective_shift_frac, 4),
        },
        "baseline_from_data": {
            "total_households": total_households,
            "mean_consumption_kwh": round(mean_kwh, 2),
            "mean_peak_demand_kw": round(mean_peak_kw, 2),
            "mean_offpeak_demand_kw": round(mean_offpeak_kw, 2),
            "excess_peak_demand_kw": round(excess_peak_kw, 2),
            "mean_peak_rate": round(mean_peak_rate, 2),
            "mean_offpeak_rate": round(mean_offpeak_rate, 2),
            "rate_spread_per_kwh": round(rate_spread, 2),
        },
        "outputs": {
            "participating_households": participating_households,
            "simulated_peak_demand_kw": round(simulated_peak_kw, 3),
            "peak_demand_reduction_kw_per_household": round(peak_kw_reduction, 3),
            "peak_demand_reduction_kw_per_adopting_household": round(shift_frac * excess_peak_kw, 3),
            "estimated_peak_reduction_pct": round(peak_reduction_pct, 2),
            "shifted_energy_kwh_per_household": round(shifted_kwh_per_reading, 2),
            "cost_saving_per_household": round(cost_saving_per_reading, 2),
            "estimated_tariff_saving_pct": round(tariff_cost_saving_pct, 2),
            "aggregate_grid_peak_reduction_kw": round(aggregate_peak_reduction_kw, 2),
            "aggregate_cost_savings": round(aggregate_cost_savings_per_cycle, 2),
        },
        "formulas": {
            "effective_shift": "f = (adoption_rate / 100) * (peak_hour_shift / 100)",
            "peak_demand_reduction_kw": "delta_P_kw = f * (mean_peak_demand_kw - mean_offpeak_demand_kw)",
            "estimated_peak_reduction_pct": "peak_reduction_% = (delta_P_kw / mean_peak_demand_kw) * 100",
            "shifted_energy_kwh": "E_shifted = f * mean_consumption_kwh",
            "cost_saving_per_household": "saving = E_shifted * (mean_peak_rate - mean_offpeak_rate)",
            "estimated_tariff_saving_pct": "saving_% = f * ((mean_peak_rate - mean_offpeak_rate) / mean_peak_rate) * 100",
        },
    }
