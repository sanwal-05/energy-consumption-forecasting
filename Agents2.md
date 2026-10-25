Phase 2: build a dashboard in /dashboard. Backend: FastAPI (/dashboard/backend).  
Frontend: React with Vite \+ Recharts \+ Tailwind (/dashboard/frontend).  
Do NOT retrain models or change the notebook. The backend only loads the exported  
artifacts (joblib, CSV, JSON) and serves them.

Rules:  
\- Keep it simple and readable. No auth, no database, no Docker.  
\- Every number on screen must come from the API, which reads our real artifacts.  
  No hardcoded or placeholder metrics. If data is missing, show an empty state.  
\- Must run on macOS with two commands (uvicorn, npm run dev).  
\- White background. Clean, minimal, card-based layout.

Design tokens:  
\- Good / low consumption (green): \#204110, \#375f25, \#749764, \#a0bd85, \#c8d9c2  
\- Bad / high consumption (red): \#6b0015, \#850014, \#a50727, \#ae001a, \#e10531  
\- Neutral: white background, light grey borders, dark grey text.  
\- Meaning: green \= consumption at or below the household's typical level, or low  
  prediction error. Red \= overconsumption, anomalies, or high error.  
\- Actual \= dark green line. Predicted \= red line (as in a forecast-vs-actual overlay).

First, write a plan only: the API endpoints, the folder structure, the React  
components, and the tab layout. Wait for my approval.  
