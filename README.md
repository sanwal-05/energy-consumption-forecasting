# Household Energy Consumption Forecasting & Efficiency Analytics

**Course Project:** Applied Use Case in Machine Learning (AUCML)  
**UN Sustainable Development Goals (SDGs):**
- **SDG 7 (Affordable and Clean Energy):** Optimising demand profiles and aligning flexible loads with high solar availability.
- **SDG 9 (Industry, Innovation, and Infrastructure):** Data-driven smart-grid analytics, leak-free time-series pipelines, and automated diagnostic rules.
- **SDG 12 (Responsible Consumption and Production):** Identifying appliance inefficiency, excessive runtimes, and peak-tariff waste at the household level.

> **Full Technical Documentation:** See [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md) for a complete walkthrough of every change made from the reference repository—covering the data audit, preprocessing fixes, feature engineering, chronological validation, hyperparameter tuning, evaluation changes, and rule-based decision logic.

---

## 1. Redefined Problem Statement
The original reference project attempted to predict individual smart-meter readings (`energy_usage_kwh`) directly from raw row-level records using a black-box pipeline (`Ridge`, `RandomForest`, `ExtraTrees`), achieving **$R^2 \approx -0.001$** while hiding the weak result behind a mislabelled baseline.

Our **redefined problem statement** addresses two linked questions:
1. **Forecasting Problem:** *Can we forecast next-day average household energy consumption ($\text{kWh}$) from historical consumption lags, rolling averages, calendar patterns, weather conditions, and tariff rates using a strictly chronological, leak-free machine-learning pipeline—and rigorously quantify whether learnable temporal signal exists in the supplied data?*
2. **Actionable Efficiency Problem:** *When predictive time-series signal is weak or absent, what concrete household consumption insights (across peak hours, device health, weather, and tariffs) and data-backed rule-based recommendations can directly reduce unnecessary energy use and electricity bills?*

---

## 2. Objectives
1. **Audit & Validate the 5 Data Streams:** Inspect schema, missing values, duplicates, outliers, timestamp regularity, physical laws (e.g., $P \approx V \times I$), and cross-stream join consistency across all 50,000 records.
2. **Build a Simple, Leak-Free Forecasting Pipeline:** Aggregate irregular multi-household readings into a clean daily time series (365 days), engineer past-only lag and rolling features alongside calendar, weather, and tariff inputs, and split strictly chronologically (`70%` train / `15%` validation / `15%` test).
3. **Compare & Tune Models Fairly:** Benchmark two naive baselines (`Train Mean` and `Yesterday / Persistence`) against five ML models (`Linear Regression`, `Ridge`, `Lasso`, `Random Forest`, and `Gradient Boosting`) tuned via 5-fold `TimeSeriesSplit` cross-validation.
4. **Explain Every Step & Result Honestly:** Provide plain-language explanations of ML concepts (data leakage, chronological splits, baselines, MAE/RMSE/$R^2$/MAPE, overfitting, cross-validation) and report why $R^2 \approx 0$ occurs on synthetic uniform data.
5. **Deliver Data-Backed Household Recommendations:** Extract operational insights across peak hours, appliances, weather, and tariffs, and implement a 5-rule recommendation engine targeting avoidable energy and billing waste.

---

## 3. Scope (Phase 1)
### In Scope (Current Deliverable)
- Single, self-contained, fully executed notebook: [`notebooks/energy-forcast.ipynb`](notebooks/energy-forcast.ipynb).
- End-to-end data loading, positional stream alignment verification, cleaning (missing values, duplicates, IQR outlier checks), and exploratory visualisations.
- Daily aggregation and leak-free feature engineering (`lag_1`, `lag_7`, shifted `rolling_7`, calendar, weather, and tariff features).
- Chronological `70/15/15` train/validation/test split and `TimeSeriesSplit` hyperparameter tuning across 5 ML models + 2 baselines.
- Diagnostic evaluation: metrics table (`MAE`, `RMSE`, `R²`, `MAPE%`), predicted-vs-actual plots, residual diagnostics, and feature importance with a random-noise control test.
- Operational household insights and a 5-rule energy-saving recommendation engine backed by dataset statistics.
- Reproducible macOS environment setup ([`requirements.txt`](requirements.txt)) and technical documentation ([`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md)).

### Out of Scope for Phase 1 (Listed under Future Work)
- Interactive Streamlit web application (`app.py`), live file-upload UI, and serialized model deployment (`models/*.pkl`).

---

## 4. Target Users & Stakeholders
| Stakeholder | How They Use This Project |
|---|---|
| **Households & Residential Consumers** | Understand which appliances (`HVAC`, `Washer`, `Dryer`, `Refrigerator`), runtime habits, and tariff windows drive their bills, and apply simple rules (off-peak shifting, filter servicing, runtime caps) to cut waste. |
| **Utility Providers & Grid Operators** | Diagnose peak vs. off-peak demand imbalances (`peak_demand_kw` is `+52.7%` above off-peak), poor load factors (`< 0.40`), and price inelasticity across tariff plans. |
| **Energy Auditors & Smart-Home Engineers** | Use the data-quality audit checklist and rule-based engine to flag degraded appliances (`Critical` maintenance + `efficiency_ratio < 0.65`) before deploying complex ML models. |
| **ML Students & Educators** | Follow a transparent, step-by-step case study showing how to prevent data leakage, tune time-series models properly, and diagnose synthetic/noisy data honestly. |

---

## 5. Real-World Relevance
Residential and commercial buildings account for roughly one-third of global electricity demand. In real smart-grid deployments:
- **Forecasting prevents over-generation and blackouts:** Accurate day-ahead demand forecasts allow utilities to dispatch cleaner baseload and renewable power rather than firing expensive peaker plants (**SDG 7 & SDG 9**).
- **Data quality precedes model complexity:** In industry, sensor streams frequently suffer from misaligned joins, missing telemetry, or synthetic test fills. Blindly training complex ensembles without verifying physical relationships wastes engineering effort and produces misleading dashboards.
- **Rule-based guardrails deliver immediate savings:** Even before a utility has multi-year per-household history for deep forecasting, rule-based triggers on smart-meter and appliance telemetry (curbing `>18 h/day` runtimes, servicing `<65%` efficiency units, and shifting laundry out of `2×` peak-rate windows) immediately reduce household consumption and carbon footprint (**SDG 12**).

---

## 6. Dataset Description
The raw data in `data/raw/` consists of **5 CSV streams** with **50,000 rows each**, spanning **2023-01-01 to 2023-12-31** across **8,964 unique `household_id` values**:

| File | Shape | Key Columns | Missing Values | Audit Notes |
|---|---|---|---|---|
| `raw_energy_usage.csv` | `50,000 × 17` | `household_id`, `timestamp`, `region_name`, `city_name`, `meter_type`, `customer_category`, `voltage_reading`, `current_reading`, `active_power_kw`, `reactive_power_kvar`, **`energy_usage_kwh`** (target), `load_factor`, `peak_demand_kw`, `offpeak_demand_kw`, `daily_consumption_kwh` | `1,000` rows (all numeric columns `NaN`, incl. 5 exact duplicates) | Each household has only 1 distinct timestamp repeated ~5.6× with different readings. |
| `weather_enrichment.csv` | `50,000 × 17` | `temperature_celsius` (`15–40 °C`), `humidity_percent`, `wind_speed_kmh`, `rainfall_mm`, `solar_radiation`, `dew_point`, `condition_type` | `1,000` rows (all numeric columns `NaN`) | 100% row-aligned with `raw_energy_usage.csv` on household, region, city, and date. |
| `device_metrics.csv` | `50,000 × 16` | `device_category` (`HVAC`, `Refrigerator`, `Washer`, `Dryer`), `device_brand`, `maintenance_status` (`Good`, `Average`, `Critical`), `runtime_hours` (`1–24 h`), `device_power_kw`, `efficiency_ratio` (`0.50–1.00`), `energy_draw_kwh`, `cooling_load` | `0` | Same `household_id` row order; region matches usage 25.4% of the time (random assignment). |
| `region_consumption.csv` | `50,000 × 16` | `grid_region`, `substation_name`, `grid_load_kw`, `transformer_load`, `line_loss_percent`, `demand_forecast_kw`, `reserve_margin` | `0` | Same `household_id` row order; region matches usage 25.5% of the time. |
| `tariff_metrics.csv` | `50,000 × 16` | `tariff_plan_type` (`Residential`, `Commercial`, `Industrial`), `billing_cycle`, `unit_rate` (`3–10`), `peak_rate` (`5–15`), `offpeak_rate` (`2–8`), `monthly_bill`, `late_fee` | `0` | Same `household_id` row order; region matches usage 24.5% of the time. |

**Data Audit Finding:** Every numeric column across all 5 files is uniformly distributed between round bounds (Kolmogorov–Smirnov $p > 0.10$, skewness $\approx 0$) and statistically independent of all other columns ($\max |r| = 0.013$ at the row level). Physical laws such as $\text{Active Power} \propto V \times I$ ($r = -0.002$) do not hold. We report this transparently as a core empirical finding.

---

## 7. Pipeline Architecture
All steps are implemented cleanly in [`notebooks/energy-forcast.ipynb`](notebooks/energy-forcast.ipynb) using `pandas`, `numpy`, `matplotlib`, `seaborn`, and `scikit-learn`:

```
1. Load & Verify 5 CSVs  --> Assert identical household_id order across all 5 files; join positionally (50,000 × 75)
2. Validate & Clean      --> Drop 1,000 empty target rows (49,000 left); verify 0 remaining exact duplicates & 0 IQR outliers
3. Exploratory Analysis  --> Plot hourly, weekday, and monthly patterns + customer/city breakdowns
4. Daily Aggregation     --> Resample to 365 regular calendar days (daily mean consumption, weather, and tariff rates)
5. Feature Engineering   --> Create 14 leak-free features:
                             - Calendar: day_of_week, month, is_weekend
                             - Past Lags: lag_1 (t-1), lag_7 (t-7)
                             - Past Rolling: rolling_7 (7-day mean shifted by 1 day; drops first 7 days -> 358 days)
                             - Weather (5): temperature, humidity, wind_speed, solar_radiation, rainfall
                             - Tariff (3): unit_rate, peak_rate, offpeak_rate
6. Chronological Split   --> Train: 250 days (Jan 8 – Sep 14) | Validation: 54 days (Sep 15 – Nov 7) | Test: 54 days (Nov 8 – Dec 31)
7. Model Tuning (CV)     --> 5-fold TimeSeriesSplit on Development set (Train + Val = 304 days); StandardScaler inside Pipeline
8. Final Evaluation      --> Score once on untouched Test set (MAE, RMSE, R², MAPE%) + residual & noise-feature diagnostics
9. Insights & Rules      --> Analyse 49,000 records across 4 dimensions & execute 5 data-backed energy-saving rules
```

---

## 8. Results

### 8.1 Model Comparison Table (Sorted by Cross-Validation MAE)
| Rank | Model | CV MAE (kWh) | Train MAE (kWh) | Test MAE (kWh) | Test RMSE (kWh) | Test $R^2$ | Test MAPE (%) | Best Hyperparameters (TimeSeriesSplit CV) |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | **Gradient Boosting** | **0.956** | 0.939 | **0.976** | 1.237 | -0.016 | **3.848** | `learning_rate=0.01, max_depth=1, n_estimators=50` |
| 2 | **Baseline: Mean** | 0.957 | 0.951 | 0.981 | **1.230** | **-0.003** | 3.863 | *(predicts development-set mean)* |
| 3 | **Lasso Regression** | 0.957 | 0.951 | 0.981 | **1.230** | **-0.003** | 3.863 | `alpha=0.5` *(all 14 coefficients shrunk to 0)* |
| 4 | **Ridge Regression** | 0.958 | 0.942 | 0.980 | 1.236 | -0.013 | 3.858 | `alpha=1000` *(maximum regularisation in grid)* |
| 5 | **Random Forest** | 0.962 | 0.833 | 1.026 | 1.298 | -0.118 | 4.050 | `max_depth=10, min_samples_leaf=20, n_estimators=100` |
| 6 | **Linear Regression** | 1.054 | 0.922 | 1.014 | 1.298 | -0.118 | 3.988 | *(unregularised OLS)* |
| 7 | **Baseline: Yesterday** | 1.367 | 1.356 | 1.368 | 1.693 | -0.902 | 5.366 | *(persistence: $\hat{y}_t = y_{t-1}$)* |

**Why did the reference repo's Ridge get $R^2 \approx -0.001$, and what do our results show?**
- By our pre-declared selection rule (lowest `CV MAE`), **Gradient Boosting** is the formal winner (`CV MAE = 0.956 kWh`, `Test MAE = 0.976 kWh`), edging out the mean baseline by `0.001 kWh` on CV.
- However, **all regularised models converge to predicting the mean ($R^2 \approx 0$):** Lasso sets all 14 feature weights to `0.0`, Ridge picks the highest penalty (`alpha=1000`), and Gradient Boosting picks the weakest possible learner (`max_depth=1, learning_rate=0.01, n_estimators=50`). Unregularised `Linear Regression` and `Random Forest` overfit training noise (`Test R² = -0.118`), and a synthetic `RANDOM_NOISE` column ranks **3rd out of 15 features** in Random Forest importance.
- This proves that the reference repo's `R² ≈ -0.001` was **not a bug in Ridge**, but the mathematical consequence of independent uniform synthetic data.

### 8.2 Data-Backed Rule-Based Energy Recommendations (on 49,000 Cleaned Records)
| Rule | Actionable Recommendation | Supporting Finding in the Dataset | Flagged Records | Share of Data | Unique Households |
|---|---|---|---:|---:|---:|
| **R1** | **Shift Washer/Dryer cycles to off-peak hours** | `peak_rate` (`9.98`) is **+99.4% higher** than `offpeak_rate` (`5.01`), saving `4.97` per shifted kWh | `7,660` | `15.6%` | `5,148` |
| **R2** | **Service `Critical` low-efficiency (`<0.65`) devices** | **33.0%** of records are `Critical` maintenance and **30.1%** run at `efficiency_ratio < 0.65` | `4,781` | `9.8%` | `3,704` |
| **R3** | **Cap non-refrigerator runtime at $\le 18\text{ h/day}$** | **26.2%** of appliances run `>18 h/day` (mean `21.0 h`) despite being non-continuous loads | `9,554` | `19.5%` | `5,914` |
| **R4** | **Pre-cool & align daytime loads in hot weather (`>32 °C`)** | **39.1%** of readings occur above `30 °C` (mean `cooling_load = 32.4`) with zero thermal adaptation | `7,079` | `14.4%` | `4,877` |
| **R5** | **Stagger peak spikes (`load_factor < 0.35`) & enable auto-pay** | `peak_demand_kw` (`8.01 kW`) is **+52.7%** above off-peak; `late_fee` averages `50.09` (`6.4%` of bill) | `29,055` | `59.3%` | `8,615` |

---

## 9. How to Run on macOS

### Prerequisites
- macOS with Python `3.10+` (tested with Homebrew Python `3.11`).

### Step-by-Step Setup
```bash
# 1. Navigate to the project folder
cd /path/to/energy-consumption-forecasting-main

# 2. Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Register the Jupyter kernel so VS Code / JupyterLab can find it
python -m ipykernel install --user --name energy-forecasting --display-name "Python (energy-forecasting)"

# 5. Launch JupyterLab and open notebooks/energy-forcast.ipynb
jupyter lab
```
*(Optional)* To re-execute the entire notebook from the terminal and verify all outputs:
```bash
.venv/bin/jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=600 notebooks/energy-forcast.ipynb
```

### Project Structure
```text
energy-consumption-forecasting-main/
├── data/
│   └── raw/                          # 5 raw CSV streams (50,000 rows each)
│       ├── raw_energy_usage.csv
│       ├── device_metrics.csv
│       ├── weather_enrichment.csv
│       ├── region_consumption.csv
│       └── tariff_metrics.csv
├── docs/
│   └── PROJECT_DOCUMENTATION.md      # Detailed documentation of pipeline & changes vs reference repo
├── notebooks/
│   └── energy-forcast.ipynb          # Main self-contained ML & insights notebook (executed)
├── AGENTS.md                         # Project guidelines and constraints
├── README.md                         # Project overview, pipeline, results, and setup instructions
└── requirements.txt                  # Python dependencies for macOS
```

---

## 10. Future Work (Phase 2 & Beyond)
1. **Interactive Streamlit Dashboard (Phase 2):** Build a lightweight user interface (`app.py`) allowing homeowners and energy auditors to filter by city/tariff plan, inspect daily forecasts, and view personalised rule-based energy-saving alerts.
2. **Real Smart-Meter Benchmark Integration:** Connect the exact same leak-free pipeline to continuous single-household smart-meter telemetry (such as the UCI Individual Household Electric Power Consumption dataset) to demonstrate high-accuracy hourly/daily forecasting where physical autocorrelation and weather coupling exist.
3. **Automated Demand-Response Simulation:** Quantify the grid-level peak-shaving impact (in $\text{MW}$ and $\text{tCO}_2\text{e}$) when a configurable percentage of flagged households follow Rules R1–R5.
