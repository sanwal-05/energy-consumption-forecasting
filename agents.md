\# AUCML Project: Household Energy Consumption Forecasting  
SDGs: 7 (Clean Energy), 9 (Industry/Innovation), 12 (Responsible Consumption).  
Reference repo (already copied here): energy-consumption-forecasting. It is a  
REFERENCE ONLY. We want our own, significantly changed project.

Data: 5 streams (\~50k rows each): energy usage, device metrics, weather,  
regional consumption, tariffs. CSVs are in data/raw/.

Known problem: the repo's Ridge model gets R² ≈ \-0.001, which is no better than  
a baseline. Investigate why. Do not hide weak results.

Rules:  
\- Simple, readable code. Presented live, step by step. No over-engineering.  
\- Single main notebook (notebooks/energy\_forecasting.ipynb), clear sections.  
\- Every model and hyperparameter choice gets a short markdown explanation (why).  
\- Markdown cells should also explain key concepts (leakage, chronological split,  
  baseline, MAE/RMSE/R²/MAPE, overfitting, cross-validation) in plain language.  
\- Chronological split only. No random shuffling. Watch for data leakage.  
\- Always compare against a naive baseline.  
\- Must run on macOS. Provide requirements.txt.  
\- Phase 1 \= notebook \+ README only. Phase 2 (Streamlit frontend) is NOT now.  
