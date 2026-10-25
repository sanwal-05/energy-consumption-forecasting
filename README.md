# Household Energy Consumption Forecasting & Efficiency Analytics

**Course Project:** Applied Use Case in Machine Learning (AUCML)  
**UN Sustainable Development Goals (SDGs):**
- **SDG 7 (Affordable and Clean Energy):** Optimising demand profiles and aligning flexible loads with high solar availability.
- **SDG 9 (Industry, Innovation, and Infrastructure):** Data-driven smart-grid analytics, leak-free time-series pipelines, and automated diagnostic rules.
- **SDG 12 (Responsible Consumption and Production):** Identifying appliance inefficiency, excessive runtimes, and peak-tariff waste at the household level.

> **Technical Documentation:** See [docs/PROJECT_DOCUMENTATION.md](docs/PROJECT_DOCUMENTATION.md) for a comprehensive walkthrough of the end-to-end implementation—covering data validation, preprocessing, leak-free feature engineering, chronological validation, hyperparameter tuning, evaluation diagnostics, and rule-based decision logic.

---

## 1. Problem
Household energy forecasting plays a critical role in modern electrical grids, demand-response planning, and renewable integration. This project investigates two core questions:

1. **Forecasting Problem:** Can next-day average household energy consumption ($\text{kWh}$) be reliably predicted from historical consumption lags, rolling averages, calendar patterns, meteorological indicators, and electricity tariff structures using a strictly chronological, leakage-safe machine learning pipeline?
2. **Actionable Efficiency Problem:** When empirical forecasting signals are weak or uninformative, what operational insights across diurnal demand patterns, appliance telemetry, weather factors, and billing rates can be extracted to support data-backed energy conservation and bill reduction?

---

## 2. Objectives
1. **Audit & Validate Multi-Stream Data:** Inspect schema consistency, missingness patterns, duplicate records, outliers, physical consistency (e.g., $P \approx V \times I$), and cross-stream alignment across 50,000 multi-source records.
2. **Construct a Leakage-Safe Time-Series Pipeline:** Aggregate irregular multi-household observations into an aligned daily time-series (365 calendar days), derive strictly past-facing lag and rolling features, and enforce a chronological split (`70%` train / `15%` validation / `15%` test).
3. **Benchmark Predictive Models Fairly:** Benchmark naive statistical baselines (`Train Mean` and `Yesterday / Persistence`) against regularised linear models (`Ridge`, `Lasso`), tree ensembles (`Random Forest`), and boosting (`Gradient Boosting`) tuned using 5-fold `TimeSeriesSplit` cross-validation.
4. **Evaluate Diagnostics and Overfitting:** Quantify performance across standard regression metrics ($\text{MAE}$, $\text{RMSE}$, $R^2$, $\text{MAPE}$), inspect residual distributions, and test feature attribution significance using an injected random-noise control feature.
5. **Formulate Rule-Based Interventions:** Translate empirical findings from appliance runtime, degradation metrics, solar irradiance, and peak tariff differentials into actionable heuristic rules that drive measurable efficiency gains.

---

## 3. Dataset Description

The study evaluates five CSV data streams (50,000 observations each, spanning `2023-01-01` to `2023-12-31` across 8,964 distinct `household_id` identifiers):

### Data Streams and Analytical Relevance

1. **`raw_energy_usage.csv` (Smart Meter Readings):**
   - *Contents:* Electrical parameters including voltage (`voltage_reading`), current (`current_reading`), active power (`active_power_kw`), reactive power (`reactive_power_kvar`), power factor metrics (`load_factor`), peak/off-peak demand, and the primary target: `energy_usage_kwh`.
   - *Role:* Provides the ground-truth consumption signals and foundational telemetry required to establish baseline demand profiles and examine power-flow relationships.
2. **`weather_enrichment.csv` (Meteorological Conditions):**
   - *Contents:* Ambient temperature (`temperature_celsius`), relative humidity, wind speed, precipitation (`rainfall_mm`), solar radiation (`solar_radiation`), dew point, and qualitative condition flags.
   - *Role:* Informs weather-dependent consumption dynamics, particularly heating/cooling degree impacts and solar-load alignment opportunities.
3. **`device_metrics.csv` (Appliance Telemetry):**
   - *Contents:* Major appliance categories (`HVAC`, `Refrigerator`, `Washer`, `Dryer`), operational runtime (`runtime_hours`), nominal power, mechanical/electrical efficiency (`efficiency_ratio`), thermal output, cooling load, and operational status (`maintenance_status`).
   - *Role:* Captures end-use appliance performance, degradation, and operational cycles to evaluate non-intrusive load characteristics and conservation opportunities.
4. **`region_consumption.csv` (Grid and Substation Metrics):**
   - *Contents:* Substation identifiers, feeder lines, transformer loading, line loss percentages, frequency variation, and regional demand forecasts.
   - *Role:* Situates household-level behaviour within local electrical distribution network conditions and reserve constraints.
5. **`tariff_metrics.csv` (Rate Structures and Billing):**
   - *Contents:* Rate plan categories (`Residential`, `Commercial`, `Industrial`), base unit rates (`unit_rate`), time-of-use rates (`peak_rate`, `offpeak_rate`), fixed charges, taxes, subsidies, and late fees.
   - *Role:* Enables analysis of price elasticity, financial incentives for load shifting, and avoidable billing overheads.

| File | Dimensions | Primary Attributes | Missing Values | Structural Characteristics |
|---|---|---|---|---|
| `raw_energy_usage.csv` | `50,000 × 17` | `household_id`, `timestamp`, `voltage_reading`, `current_reading`, `active_power_kw`, `energy_usage_kwh`, `load_factor` | 1,000 rows (all numerical columns `NaN`, including 5 duplicate rows) | Multiple simultaneous readings per timestamp; unique household histories are not tracked longitudinally. |
| `weather_enrichment.csv` | `50,000 × 17` | `temperature_celsius`, `humidity_percent`, `wind_speed_kmh`, `rainfall_mm`, `solar_radiation`, `condition_type` | 1,000 rows (`NaN` in all numeric fields) | Exactly matches `raw_energy_usage.csv` on household, city, region, and date coordinates. |
| `device_metrics.csv` | `50,000 × 16` | `device_category`, `maintenance_status`, `runtime_hours`, `device_power_kw`, `efficiency_ratio`, `energy_draw_kwh` | 0 | Identical row ordering of `household_id`; installation regions match usage at chance level (25.4%). |
| `region_consumption.csv` | `50,000 × 16` | `grid_region`, `substation_name`, `grid_load_kw`, `transformer_load`, `line_loss_percent` | 0 | Aligned by row position; grid regions correspond to usage at chance level (25.5%). |
| `tariff_metrics.csv` | `50,000 × 16` | `tariff_plan_type`, `unit_rate`, `peak_rate`, `offpeak_rate`, `monthly_bill`, `late_fee` | 0 | Aligned by row position; tariff regions match usage at chance level (24.5%). |

### Empirical Characteristics Identified During EDA

Exploratory data analysis revealed specific synthetic-like properties across the numerical distributions:
- **Uniformity Across Variables:** Numeric variables across all tables exhibit approximately uniform distributions between rounded bounds (Kolmogorov–Smirnov uniformity test $p > 0.10$, skewness $\approx 0$).
- **Decoupled Physical Relationships:** Fundamental electrical and physical laws are absent; for example, active power and the product of voltage and current display no meaningful correlation ($\text{corr}(\text{active\_power\_kw}, V \times I) = -0.0016$). Similarly, dew point exceeds dry-bulb temperature in $13.1\%$ of observations.
- **Absence of Cross-Feature Correlation:** Cross-table feature correlations with the target variable do not exceed random noise thresholds ($\max |r| = 0.0129$ at the individual row level, compared against a theoretical null noise threshold $\approx 2/\sqrt{49,000} \approx 0.009$).
- **Temporal Discontinuity:** Consumption exhibits near-zero autocorrelation across successive time intervals and lack diurnal, weekly, or seasonal cyclicality.

Documenting these characteristics is critical: models trained on independent noise cannot extract authentic predictive patterns, making disciplined evaluation and baseline benchmarking paramount.

---

## 4. Scope

### In Scope
- Single, fully reproducible execution notebook: [`notebooks/energy-forcast.ipynb`](notebooks/energy-forcast.ipynb).
- End-to-end data ingestion, positional stream integrity checks, data cleaning (handling null blocks, duplicate identification, and IQR outlier bounds).
- Aggregation to regular daily time-series intervals and strictly past-looking feature engineering (`lag_1`, `lag_7`, past 7-day rolling mean, calendar, weather, and tariff variables).
- Strict chronological data partition (`70%` train, `15%` validation, `15%` test) paired with forward-chaining `TimeSeriesSplit` cross-validation on the development set.
- Empirical evaluation across regression benchmarks ($\text{MAE}$, $\text{RMSE}$, $R^2$, $\text{MAPE}$), prediction-vs-actual scatter analyses, residual diagnostics, and a noise-injection control experiment.
- Rule-based efficiency recommendations grounded in dataset-derived distributions.
- Environment configuration files ([`requirements.txt`](requirements.txt)) and technical methodology documentation ([`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md)).

### Out of Scope (Future Work)
- End-user deployment interfaces (e.g., interactive web dashboards) and online model serving endpoints.

---

## 5. Target Users & Stakeholders

| Stakeholder | Practical Utility |
|---|---|
| **Residential & Commercial Consumers** | Identify high-impact consumption factors (sub-optimal appliance maintenance, uncurbed operating hours, off-peak tariff opportunities) to reduce utility bills. |
| **Grid Utilities & Demand Planners** | Analyse peak-to-off-peak demand ratios ($+52.7\%$ peak premium), assess load factors ($<0.40$ in $24.6\%$ of profiles), and measure price responsiveness across consumer tiers. |
| **Energy Auditors & Facilities Managers** | Deploy deterministic diagnostic checks to isolate underperforming equipment (`Critical` maintenance with `efficiency_ratio < 0.65`) without relying on opaque forecasting heuristics. |
| **Data Science & ML Researchers** | Reference an end-to-end methodology illustrating time-series leakage prevention, proper cross-validation design, and empirical diagnosis of uninformative feature spaces. |

---

## 6. Real-World Relevance

Residential and commercial buildings consume roughly one-third of global electrical energy. In operational power systems:
- **Balancing and Grid Stability:** Day-ahead demand estimates allow system operators to schedule baseload generation efficiently, reduce reliance on carbon-intensive peaker plants, and integrate intermittent renewable generation (**SDG 7 & SDG 9**).
- **Integrity Precedes Complexity:** Real-world IoT meter data frequently exhibits telemetry gaps, sensor desynchronisation, or synthetic backfills. Rigorous verification of physical laws and temporal structure prevents deploying fragile models into critical infrastructure.
- **Actionable Heuristics Deliver Immediate Impact:** When predictive uncertainty is high, deterministic operational rules (such as shifting high-draw laundry out of peak tariff windows or servicing degraded compressor units) provide direct, measurable energy and emissions reductions (**SDG 12**).

---

## 7. Pipeline Architecture

The pipeline executes sequentially in [`notebooks/energy-forcast.ipynb`](notebooks/energy-forcast.ipynb) using standard scientific computing libraries (`pandas`, `numpy`, `matplotlib`, `seaborn`, `scikit-learn`):

```
1. Ingestion & Alignment --> Verify row-by-row household_id sequence across all 5 streams; merge horizontally (50,000 × 75)
2. Quality Control       --> Remove 1,000 unmeasured null records (49,000 remaining); verify zero duplicate records and zero IQR outliers
3. Exploratory Analysis  --> Examine consumption distributions across hours, weekdays, months, cities, and customer classes
4. Daily Resampling      --> Resample irregular observations to 365 uniform calendar days (mean daily consumption, weather, and tariffs)
5. Feature Engineering   --> Construct 14 leakage-free predictors:
                             - Temporal: day_of_week, month, is_weekend
                             - Autoregressive Lags: lag_1 (t-1), lag_7 (t-7)
                             - Rolling Statistics: rolling_7 (shifted by 1 day to strictly exclude day t; yields 358 usable days)
                             - Exogenous Weather (5): temperature, humidity, wind_speed, solar_radiation, rainfall
                             - Rate Parameters (3): unit_rate, peak_rate, offpeak_rate
6. Chronological Split   --> Train: 250 days (Jan 8 – Sep 14) | Validation: 54 days (Sep 15 – Nov 7) | Test: 54 days (Nov 8 – Dec 31)
7. Hyperparameter Tuning --> 5-fold TimeSeriesSplit on Development Set (Train + Val = 304 days); StandardScaler enclosed within Pipeline
8. Out-of-Sample Testing --> Score final models on untouched Test Set (MAE, RMSE, R², MAPE) alongside residual and noise feature checks
9. Efficiency Engine     --> Execute 5 data-backed decision rules across 49,000 household observations to quantify conservation opportunities
```

---

## 8. Results

### 8.1 Model Performance Comparison (Ranked by Cross-Validation MAE)

| Rank | Model | CV MAE (kWh) | Train MAE (kWh) | Test MAE (kWh) | Test RMSE (kWh) | Test $R^2$ | Test MAPE (%) | Optimal Hyperparameters (`TimeSeriesSplit` CV) |
|---:|---|---:|---:|---:|---:|---:|---:|---|
| 1 | **Gradient Boosting** | **0.956** | 0.939 | **0.976** | 1.237 | -0.016 | **3.848** | `learning_rate=0.01, max_depth=1, n_estimators=50` |
| 2 | **Baseline: Mean** | 0.957 | 0.951 | 0.981 | **1.230** | **-0.003** | 3.863 | *(Predicts development set central tendency)* |
| 3 | **Lasso Regression** | 0.957 | 0.951 | 0.981 | **1.230** | **-0.003** | 3.863 | `alpha=0.5` *(All 14 coefficients penalised to zero)* |
| 4 | **Ridge Regression** | 0.958 | 0.942 | 0.980 | 1.236 | -0.013 | 3.858 | `alpha=1000` *(Maximum regularisation penalty in search grid)* |
| 5 | **Random Forest** | 0.962 | 0.833 | 1.026 | 1.298 | -0.118 | 4.050 | `max_depth=10, min_samples_leaf=20, n_estimators=100` |
| 6 | **Linear Regression** | 1.054 | 0.922 | 1.014 | 1.298 | -0.118 | 3.988 | *(Unregularised OLS; fits in-sample training noise)* |
| 7 | **Baseline: Yesterday** | 1.367 | 1.356 | 1.368 | 1.693 | -0.902 | 5.366 | *(Naive lag-1 persistence: $\hat{y}_t = y_{t-1}$)* |

#### Key Modelling Insights

- **Convergence Toward the Historical Mean:** Under disciplined time-series cross-validation, optimal model regularisation converges to the dataset mean ($R^2 \approx 0$). Lasso sets all regression coefficients to zero, Ridge selects the highest penalisation parameter (`alpha=1000`), and Gradient Boosting adopts minimal tree complexity (`max_depth=1, n_estimators=50, learning_rate=0.01`).
- **Persistence Failure on Noise:** The lag-1 persistence baseline yields $R^2 \approx -0.90$, illustrating the mathematical consequence of independent identically distributed observations: predicting using the prior noise draw doubles variance ($Var(y_t - y_{t-1}) \approx 2 Var(y)$).
- **Overfitting in Unconstrained Estimators:** Unregularised Linear Regression and Random Forest memorise in-sample noise, resulting in degraded out-of-sample performance ($R^2 = -0.118$).
- **Validation via Control Feature:** When a synthetic `RANDOM_NOISE` column was injected into the feature space, it achieved the **3rd highest feature importance rank out of 15** in Random Forest, demonstrating that feature attributions reflect spurious variance fitting rather than true physical relationships.

---

### 8.2 Data-Backed Energy Efficiency Recommendations (Evaluated on 49,000 Records)

Because the data lacks predictive forecasting signal, operational decision rules derived from physical indicators and tariff tiers offer immediate practical value:

| Rule | Operational Intervention | Empirical Finding in Dataset | Flagged Observations | Population Share | Impacted Households |
|---|---|---|---:|---:|---:|
| **R1** | **Shift laundry loads (Washer/Dryer) to off-peak periods** | `peak_rate` ($9.98$) is **$+99.4\%$ higher** than `offpeak_rate` ($5.01$), yielding a saving of $4.97/\text{kWh}$ shifted | `7,660` | `15.6%` | `5,148` |
| **R2** | **Service degraded units with critical maintenance status** | **$33.0\%$** of records are tagged `Critical` and **$30.1\%$** operate at $\text{efficiency\_ratio} < 0.65$ | `4,781` | `9.8%` | `3,704` |
| **R3** | **Enforce automated runtime caps on non-continuous loads** | **$26.2\%$** of devices run $>18\text{ h/day}$ (mean $21.0\text{ h}$) despite intermittent operational needs | `9,554` | `19.5%` | `5,914` |
| **R4** | **Pre-cool structures and align diurnal loads during heat events** | **$39.1\%$** of intervals exceed $30\text{ °C}$ with mean cooling load $32.4$, displaying zero price/weather adaptation | `7,079` | `14.4%` | `4,877` |
| **R5** | **Mitigate spiky demand profiles and automate bill settlement** | `peak_demand_kw` exceeds off-peak by **$+52.7\%$**; late fees average $50.09$ ($6.4\%$ of total bill) | `29,055` | `59.3%` | `8,615` |

---

## 9. Execution Instructions (macOS Environment)

### Prerequisites
- macOS system with Python `3.10` or higher (validated on Python `3.11`).

### Environment Setup & Execution

```bash
# 1. Access project directory
cd energy-consumption-forecasting-main

# 2. Initialize and activate isolated virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 3. Install core dependencies
pip install -r requirements.txt

# 4. Register project kernel for Jupyter
python -m ipykernel install --user --name energy-forecasting --display-name "Python (energy-forecasting)"

# 5. Launch interactive analysis environment
jupyter lab
```

To execute the entire notebook programmatically from the terminal and update all cell outputs:
```bash
.venv/bin/jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=600 notebooks/energy_forecasting.ipynb
```

### Running the Full-Stack Dashboard (`dashboard/backend` + `dashboard/frontend`)

The dashboard runs on macOS with two commands—one for the FastAPI backend (`port 8000`) and one for the React + Vite frontend (`port 5173`):

```bash
# Terminal 1: Start the FastAPI backend on http://127.0.0.1:8000
source .venv/bin/activate
uvicorn dashboard.backend.main:app --reload --port 8000

# Terminal 2: Start the React + Vite frontend on http://localhost:5173
cd dashboard/frontend
npm install   # first time only
npm run dev
```

Open **`http://localhost:5173`** in your browser to explore the 4 tabs (**1. Dashboard**, **2. Interactive Analytics**, **3. Predictions**, and **4. Insights & Recommendations**).

#### Available REST Endpoints
| Method & Endpoint | Description |
|---|---|
| `GET /api/summary` | Top-level KPIs: total & average consumption, peak hour, best model (`R²`, `RMSE`, `MAE`), and share of readings above typical. |
| `GET /api/trends?granularity=hour\|day\|week\|month&start=&end=&household=` | Consumption trend series grouped by `hour`, `day`, `week`, or `month` with optional date range and `household_id` filter. |
| `GET /api/predictions?start=&end=` | Test-period actual vs. predicted consumption with signed error, absolute error, and percentage error per point. |
| `GET /api/models` | Full 7-model comparison table (`MAE`, `RMSE`, `R²`, `MAPE`, `CV_MAE`, `Train_MAE`, `overfit_gap`) and baseline metrics from `models/metrics.json`. |
| `GET /api/insights` | Computed findings from `models/insights.json` (peak hours, weekday vs. weekend, seasonal pattern, weather/tariff effects, top-consuming devices, regional breakdown). |
| `GET /api/recommendations` | 5 rule-based energy-saving recommendations citing exact dataset findings and computed saving `%` from the data. |
| `POST /api/simulate` | Deterministic demand-response simulation accepting `adoption_rate` (`0–100%`) and `peak_hour_shift` (`0–100%`) and returning estimated peak reduction and tariff savings. |

### Directory Structure

```text
energy-consumption-forecasting-main/
├── dashboard/
│   ├── backend/
│   │   ├── main.py                   # FastAPI backend serving exported Phase 1 artifacts
│   │   └── requirements.txt          # Backend dependencies
│   └── frontend/
│       ├── index.html
│       ├── package.json              # React, Recharts, Tailwind CSS, Vite
│       ├── vite.config.js
│       └── src/
│           ├── App.jsx               # Top navbar & 4-tab layout
│           ├── api.js                # API client for /api/*
│           ├── tokens.js             # Semantic green/red design tokens
│           └── components/
│               ├── DashboardTab.jsx  # Tab 1: KPI cards, SVG semicircle gauge, device/region bar chart
│               ├── AnalyticsTab.jsx  # Tab 2: Granularity toggle, date/household filters, zoom brush
│               ├── PredictionsTab.jsx# Tab 3: Actual vs Predicted overlay, residual bars, model table
│               ├── InsightsTab.jsx   # Tab 4: Pattern charts, recommendation cards, DR simulator
│               ├── SemicircleGauge.jsx
│               └── StatusViews.jsx
├── data/
│   ├── processed/                    # Exported daily series & test-set predictions
│   │   ├── predictions.csv
│   │   └── timeseries.csv
│   └── raw/                          # 5 primary CSV streams (50,000 rows each)
│       ├── raw_energy_usage.csv
│       ├── device_metrics.csv
│       ├── weather_enrichment.csv
│       ├── region_consumption.csv
│       └── tariff_metrics.csv
├── docs/
│   └── PROJECT_DOCUMENTATION.md      # Detailed technical methodology and validation documentation
├── models/                           # Exported model pipeline, metrics, and insights JSON
│   ├── best_model.joblib
│   ├── insights.json
│   └── metrics.json
├── notebooks/
│   ├── energy_forecasting.ipynb      # Executed primary analysis, modelling, and export notebook
│   └── energy-forcast.ipynb
├── AGENTS.md                         # Project specifications and analytical guidelines
├── Agents2.md                        # Phase 2 dashboard specifications
├── README.md                         # Academic project documentation
└── requirements.txt                  # Python dependencies
```

---

## 10. Future Work

1. **Deployment of Interactive Analytics Interface:** Implement a web-based dashboard allowing energy auditors and facility managers to inspect regional load distributions, simulate tariff adjustments, and monitor automated rule flags.
2. **Benchmark on Longitudinal Smart-Meter Datasets:** Apply the established leakage-free feature pipeline to continuous single-facility smart meter recordings (such as the UCI Household Electric Power Consumption dataset) to validate predictive performance on genuine autocorrelated demand profiles.
3. **Simulated Demand-Response Modelling:** Quantify aggregate grid-level peak shaving potential (in $\text{MW}$ and avoided generation emissions) under varying household adoption rates of Rules R1–R5.
