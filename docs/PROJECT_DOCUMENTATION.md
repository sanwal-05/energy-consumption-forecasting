# Project Documentation: End-to-End Pipeline, Audit Findings & Improvements over Reference Repository

This document records everything performed in **Phase 1** of the Household Energy Consumption Forecasting project—from the forensic audit of the 5 raw CSV files and the redesign of the preprocessing pipeline to leak-free feature engineering, `TimeSeriesSplit` hyperparameter tuning, diagnostic evaluation, household consumption insights, and data-backed rule-based recommendations.

---

## 1. Executive Summary of Changes vs. Reference Repository

The original reference repository (`energy-consumption-forecasting`) spread its logic across five fragmented notebooks (`01`–`05`) and six Python modules (`src/`, `utils/`, `app.py`), yet achieved **$R^2 = -0.0011$** with Ridge Regression and **$R^2 = -0.0072$** with Random Forest. Worse, it masked those weak results behind a mislabelled baseline and silent model-selection overrides.

We replaced the entire reference codebase with a **single, transparent, step-by-step notebook ([`notebooks/energy-forcast.ipynb`](../notebooks/energy-forcast.ipynb))** designed for live presentation and student readability.

| Stage | Reference Repository (Before) | Our Redesigned Project (After) | Why This Change Improved the Project |
|---|---|---|---|
| **Code Organisation** | 5 separate notebooks + 6 scripts (`src/*.py`, `utils/*.py`, `app.py`) + pickled artifacts (`models/*.pkl`). | Single self-contained notebook (`notebooks/energy-forcast.ipynb`) + `README.md` + `requirements.txt` + `docs/PROJECT_DOCUMENTATION.md`. | Eliminates hidden helper abstractions; every step is visible, explained in markdown, and easy to present live. |
| **Data Merging** | Blind `pd.concat(axis=1)` across only 4 files (`tariff_metrics.csv` was left out of `SUPPORTED_RAW_NAMES` in `utils/config.py`) without checking cross-file geographic consistency. | Explicitly verifies `household_id` sequence equality across **all 5 CSVs** (`assert`), merges all 5 streams (`50,000 × 75`), and documents the cross-file region mismatch (`~25%` match on device/grid/tariff vs `100%` on weather). | Incorporates the missing tariff stream while honestly documenting synthetic cross-file limitations. |
| **Missing Value Handling** | Used `.ffill().bfill()` across rows sorted by timestamp (`src/preprocessing.py`), copying values from **different households** and from **future timestamps** (data leakage), followed by median imputation on targets/features. | Drops the `1,000` rows where `energy_usage_kwh` (and all other usage columns) are `100% NaN`. Never fabricates target values and never fills across different households or future rows. | Eliminates cross-household contamination and backward-in-time target leakage. |
| **Duplicate & Outlier Analysis** | Called `.drop_duplicates()` silently without inspecting duplicate timestamps or outliers. | Distinguishes exact row duplicates (`5` empty rows removed during NaN cleaning) from shared `(household_id, timestamp)` pairs (`98%` of rows, proving each household has only 1 timestamp), and runs a formal `1.5 × IQR` outlier test (`0` outliers found). | Justifies why row-level per-household lag features are impossible and why no outlier clipping is needed. |
| **Time-Series Structure & Target** | Treated `50,000` irregular multi-household rows (up to 18 readings at the exact same minute) as a single sequential time series. | Aggregates the cleaned readings to a regular **daily time series (`365` calendar days, `0` missing days)** predicting daily average household `consumption` ($\text{kWh}$). | Makes "yesterday" (`lag_1`) and "last week" (`lag_7`) mathematically well-defined and removes multi-household timestamp collisions. |
| **Feature Engineering & Leakage Prevention** | Included same-timestamp meter readings (`active_power_kw`, `reactive_power_kvar`, `load_factor`, `peak_demand_kw`, `offpeak_demand_kw`) as predictors of `energy_usage_kwh`—variables measured *simultaneously* with the target (severe operational leakage in real meters)—and built **zero lag or rolling features**. | Removes all simultaneous power/demand columns from the feature set. Builds **14 leak-free features**: calendar (`day_of_week`, `month`, `is_weekend`), past lags (`lag_1`, `lag_7`), past-only 7-day rolling mean (`shift(1).rolling(7).mean()`), daily weather (`5` cols), and daily tariffs (`3` cols). | Prevents simultaneous-measurement leakage and introduces true time-series memory features (`lag_1`, `lag_7`, `rolling_7`). |
| **Train / Val / Test Split** | Simple `80/20` split with no validation set and no cross-validation. | Strict chronological **`70%` Train (`250` days) / `15%` Validation (`54` days) / `15%` Test (`54` days)** split; `304`-day development set (`Train + Val`) used with 5-fold `TimeSeriesSplit` CV. | Respects temporal ordering, tunes hyperparameters across 5 forward validation windows, and keeps the 54-day test set untouched until final evaluation. |
| **Naive Baselines** | Mislabelled `y_train.mean()` as `"Previous Observation"` (`src/train.py#L56-L57`) and silently overwrote `"Previous Observation"` with `"Ridge Regression"` whenever the baseline won (`src/train.py#L60-L61`). | Evaluates **both** honest baselines separately: `Baseline: mean` ($\hat{y} = \bar{y}_{\text{train}}$) and `Baseline: yesterday` ($\hat{y}_t = y_{t-1}$). Never overrides or hides baseline wins. | Fixes a major reporting flaw in the reference code and shows clearly why persistence gets $R^2 \approx -0.90$ on independent noise. |
| **Models & Hyperparameter Tuning** | Hardcoded `Ridge(alpha=10.0)`, `RandomForest(n_estimators=250)`, `ExtraTrees(n_estimators=250)` with zero hyperparameter tuning and no explanation of parameter choices. | Compares **5 ML models** (`Linear Regression`, `Ridge`, `Lasso`, `Random Forest`, `Gradient Boosting`) + **2 baselines**, tunes every hyperparameter grid with `TimeSeriesSplit` `GridSearchCV`, and explains the role and range of every hyperparameter. | Demonstrates how regularisation (`Ridge`, `Lasso`) and shallow trees (`Gradient Boosting`) respond to pure noise vs unregularised models. |
| **Feature Importance Verification** | Plotted raw tree importances without checking whether they reflected real signal or random noise fitting. | Adds a **Random-Noise Control Experiment** (`RANDOM_NOISE` column injected into `RandomForestRegressor`), proving that pure random noise ranks **3rd out of 15 features**. | Prevents students/stakeholders from misinterpreting noise-driven tree splits as real causal relationships. |
| **Actionable Insights & Recommendations** | None. | Adds **Section 10 (Household Consumption Insights)** across 4 dimensions and **Section 11 (Rule-Based Recommendations)** executing 5 quantitative energy-saving rules across all 49,000 cleaned records. | Delivers concrete, data-backed value for SDG 7, 9, and 12 even when time-series forecasting signal is zero. |

---

## 2. Forensic Audit of the 5 Raw CSV Streams

Before writing any notebook code, we inspected all 5 CSV files in `data/raw/` (`50,000` rows each):

1. **Uniform Random Distributions:**
   - Every numeric column in every file is uniformly distributed between round minimum and maximum bounds:
     - `energy_usage_kwh`: uniform on $[1.00, 50.00]\text{ kWh}$ (mean $25.54\text{ kWh}$, skewness $-0.009$, Kolmogorov–Smirnov test against uniform $p = 0.42$).
     - `active_power_kw`: uniform on $[0.50, 10.00]\text{ kW}$ ($p = 0.81$).
     - `temperature_celsius`: uniform on $[15.00, 40.00]\text{ °C}$.
     - `unit_rate`: uniform on $[3.00, 10.00]$.
2. **Absence of Physical Laws:**
   - $\text{corr}(\text{active\_power\_kw}, \text{voltage\_reading} \times \text{current\_reading}) = -0.0016$ (real physics requires $r \approx 1$).
   - $\text{corr}(\text{energy\_usage\_kwh}, \text{active\_power\_kw}) = -0.0021$.
   - $\text{corr}(\text{energy\_usage\_kwh}, \text{daily\_consumption\_kwh}) = -0.0086$.
   - $\text{corr}(\text{device\_energy\_draw\_kwh}, \text{device\_power\_kw} \times \text{runtime\_hours}) = +0.0042$.
   - $\text{corr}(\text{monthly\_bill}, \text{unit\_rate} \times \text{billing\_units}) = -0.0035$.
   - In `29.8%` of rows, `peak_demand_kw < offpeak_demand_kw`; in `13.1%` of rows, `dew_point > temperature_celsius` (meteorologically impossible).
3. **Why Reference Ridge Scored $R^2 \approx -0.001$:**
   - By definition, $R^2 = 1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2}$.
   - Because `energy_usage_kwh` was generated as independent uniform random draws, the conditional expectation $\mathbb{E}[y \mid X]$ is constant ($\bar{y}$), making the theoretical maximum out-of-sample $R^2$ equal to **$0.000$**.
   - Any model that fits non-zero weights on training noise incurs extra variance on test data, pushing test $R^2$ slightly negative ($-0.001$ for heavily regularised Ridge, and more negative for flexible ensembles).

---

## 3. Step-by-Step Pipeline Walkthrough

### Step 1: Data Loading & Positional Merging (Notebook Sections 1–2)
- All 5 files (`raw_energy_usage.csv`, `device_metrics.csv`, `weather_enrichment.csv`, `region_consumption.csv`, `tariff_metrics.csv`) contain `50,000` rows and `8,964` unique households (`household_id` from `1000` to `9999`), each appearing an average of `5.58` times.
- Because `household_id` is not unique, a relational SQL/pandas `merge(on="household_id")` would produce a Cartesian product ($\sim 280,000$ rows).
- We verify via `assert df["household_id"].equals(usage["household_id"])` that all 5 files share the **exact same row-by-row `household_id` sequence**, drop redundant ID/timestamp/region columns from secondary tables, and join horizontally (`50,000 × 75`).
- Timestamps (`dd-mm-yyyy HH:MM`) are parsed with `format="%d-%m-%Y %H:%M"` and sorted chronologically (`2023-01-01 01:49` to `2023-12-31 23:22`).

### Step 2: Validation & Cleaning (Notebook Section 3)
1. **Missing Values (Section 3a):**
   - Exactly `1,000` rows (`2.0%`) in `raw_energy_usage.csv` have `NaN` across **all 10 numeric meter columns** simultaneously (`energy_usage_kwh`, `active_power_kw`, `voltage_reading`, etc.).
   - **Justification for dropping:** A row with no target (`energy_usage_kwh` is `NaN`) and no meter measurements contains zero ground-truth information. Imputing target values with medians or forward-filling across different households would fabricate labels and leak information. Dropping these `1,000` rows leaves **`49,000` complete meter records**.
   - Remaining occasional `NaN` values in `weather_enrichment.csv` (`~2%`) are naturally handled when averaging ~134 readings per day in Step 4.
2. **Duplicates (Section 3b):**
   - After removing the `1,000` empty rows, **exact duplicate rows = `0`** (all `5` exact duplicates in the raw file were empty rows).
   - Inspecting `(household_id, timestamp)` pairs reveals that **`48,784` of `49,000` rows (`99.6%`)** share their household ID and exact minute with another row, and the maximum number of distinct timestamps per household is **`1`**. Because their numeric readings differ, they are not duplicate copies and are **kept**—but this proves that **per-household longitudinal history does not exist**.
3. **Outliers (Section 3c):**
   - Applying the standard `1.5 × IQR` rule (`< Q1 - 1.5·IQR` or `> Q3 + 1.5·IQR`) on `energy_usage_kwh` (`1–50 kWh`), `active_power_kw` (`0.5–10 kW`), `temperature_celsius` (`15–40 °C`), and `unit_rate` (`3–10`) yields **`0` outliers** in every column.
   - **Justification for keeping all values:** Uniform distributions have bounded tails and zero extreme points; clipping would arbitrarily distort valid bounds.

### Step 3: Exploratory Pattern Analysis (Notebook Section 4)
- Bar charts with `95%` confidence intervals (`±1.96 × SEM`) across **hour of day (`0–23`)**, **day of week (`0=Mon` to `6=Sun`)**, and **month (`1–12`)**, as well as breakdowns by `customer_category` (`Residential` vs `Commercial`) and `city_name` (`Chennai`, `Mumbai`, `Delhi`, `Bangalore`), confirm that mean consumption hovers flatly around `25.54 kWh` everywhere.

### Step 4: Daily Aggregation (Notebook Section 5)
- Because raw timestamps are irregular and each household only appears at a single timestamp, we aggregate to a **regular daily time series (`365` days, `2023-01-01` to `2023-12-31`, `0` missing days)**.
- Daily target: `consumption` = daily mean of `energy_usage_kwh` (mean `25.54 kWh`, std `1.19 kWh`, min `22.15 kWh`, max `29.11 kWh`).
- Daily exogenous aggregates: `temperature`, `humidity`, `wind_speed`, `solar_radiation`, `rainfall`, `unit_rate`, `peak_rate`, `offpeak_rate`.

### Step 5: Leak-Free Feature Engineering (Notebook Section 6)
We engineer **14 features** for each day $t$:
- **Calendar (3):** `day_of_week` (`0–6`), `month` (`1–12`), `is_weekend` (`0/1`).
- **Past Lags (2):** `lag_1` ($y_{t-1}$), `lag_7` ($y_{t-7}$).
- **Past Rolling Mean (1):** `rolling_7` = $\frac{1}{7}\sum_{k=1}^{7} y_{t-k}$, computed via `data["consumption"].shift(1).rolling(7).mean()` so day $t$'s target is strictly excluded.
- **Weather (5):** `temperature`, `humidity`, `wind_speed`, `solar_radiation`, `rainfall`.
- **Tariff (3):** `unit_rate`, `peak_rate`, `offpeak_rate`.
- Dropping the first `7` days (`2023-01-01` to `2023-01-07`) that lack full 7-day lag history yields **`358` complete daily rows**.

### Step 6: Correlation Analysis & Chronological Split (Notebook Sections 7–8)
- The `15 × 15` correlation heatmap on the `358` daily rows shows all target correlations lie within $[-0.138, +0.050]$, consistent with finite-sample random noise ($\pm 2/\sqrt{358} \approx \pm 0.106$).
- The `358` days are split strictly in chronological order:
  - **Train (`70%`):** `250` days (`2023-01-08` to `2023-09-14`)
  - **Validation (`15%`):** `54` days (`2023-09-15` to `2023-11-07`)
  - **Test (`15%`):** `54` days (`2023-11-08` to `2023-12-31`)

### Step 7: Model Selection, Hyperparameter Tuning & Evaluation (Notebook Part 2)
- During Part 2, `train` + `val` (`304` days) form the **development set** (`X_dev`, `y_dev`), evaluated using 5-fold expanding-window `TimeSeriesSplit` (`54` initial train days, `+50` days per fold).
- Linear models (`LinearRegression`, `Ridge`, `Lasso`) are wrapped in `Pipeline([("scale", StandardScaler()), ("model", ...)])` so mean/variance scaling is computed **inside each CV fold only**.
- Hyperparameter grids and outcomes:
  1. **Linear Regression:** No hyperparameters. Overfits 14 noise features (`CV MAE = 1.054`, `Test MAE = 1.014`, `Test R² = -0.118`).
  2. **Ridge Regression:** `alpha ∈ [0.01, 0.1, 1, 10, 100, 1000]`. Selects `alpha = 1000` (strongest penalty, shrinking weights toward zero: `CV MAE = 0.958`, `Test MAE = 0.980`, `Test R² = -0.013`).
  3. **Lasso Regression:** `alpha ∈ [0.001, 0.01, 0.05, 0.1, 0.5, 1]`. Selects `alpha = 0.5`, setting **all 14 coefficients to `0.0`** (`CV MAE = 0.957`, `Test MAE = 0.981`, `Test R² = -0.003`—identical to `Baseline: mean`).
  4. **Random Forest:** `n_estimators ∈ [100, 300]`, `max_depth ∈ [3, 5, 10]`, `min_samples_leaf ∈ [5, 10, 20]`. Selects `min_samples_leaf = 20` (largest leaf size to limit overfitting), yet still exhibits a train-vs-test gap (`Train MAE = 0.833` vs `Test MAE = 1.026`, `Test R² = -0.118`).
  5. **Gradient Boosting:** `n_estimators ∈ [50, 100, 200]`, `learning_rate ∈ [0.01, 0.05, 0.1]`, `max_depth ∈ [1, 2, 3]`. Selects the most conservative tree stumps (`learning_rate = 0.01, max_depth = 1, n_estimators = 50`), achieving the lowest `CV MAE = 0.956` and `Test MAE = 0.976` (`Test R² = -0.016`).

### Step 8: Household Consumption Insights & Rule-Based Engine (Notebook Sections 10–11)
Because forecasting models cannot extract predictive signal from independent uniform targets, Sections 10 and 11 pivot to **operational diagnostics** across the `49,000` cleaned household records:
1. **Peak Hours & Meter Demand:** Mean hourly usage is flat (`25.11–26.02 kWh`), but `peak_demand_kw` (`8.01 kW`) exceeds `offpeak_demand_kw` (`5.25 kW`) by **`+52.7%`**, and **`24.6%`** of records exhibit a poor `load_factor < 0.40`.
2. **Device Health & Runtime:** **`33.0%`** of appliances operate in `Critical` maintenance status, **`30.1%`** have `efficiency_ratio < 0.65`, and **`26.2%`** run `>18 hours/day`.
3. **Weather Conditions:** **`39.1%`** of records occur in hot weather (`>30 °C`, mean `cooling_load = 32.42`) and **`32.7%`** occur under high solar irradiance (`>700 W/m²`), with zero behavioural response.
4. **Tariff Spread & Billing:** Mean `peak_rate` (`9.98`) is **`+99.4%` higher** than `offpeak_rate` (`5.01`), a savings potential of `4.97` per shifted $\text{kWh}$, while `late_fee` averages `50.09` (`6.4%` of `monthly_bill`).
5. **5 Actionable Rules Evaluated on Dataset:**
   - **R1 (Shift Washer/Dryer to off-peak):** Flags `7,660` records (`15.6%`, `5,148` households).
   - **R2 (Service `Critical` low-efficiency `<0.65` units):** Flags `4,781` records (`9.8%`, `3,704` households).
   - **R3 (Cap non-refrigerator runtime `>18 h/day`):** Flags `9,554` records (`19.5%`, `5,914` households).
   - **R4 (Hot-weather `>32 °C` cooling optimisation):** Flags `7,079` records (`14.4%`, `4,877` households).
   - **R5 (Stagger spiky load factor `<0.35` / eliminate late fees `>50`):** Flags `29,055` records (`59.3%`, `8,615` households).
