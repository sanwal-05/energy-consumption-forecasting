import React, { useState } from 'react';
import { TOKENS } from './tokens';
import DashboardTab from './components/DashboardTab';
import AnalyticsTab from './components/AnalyticsTab';
import PredictionsTab from './components/PredictionsTab';
import InsightsTab from './components/InsightsTab';

const TABS = [
  { id: 'dashboard', label: '1. Dashboard' },
  { id: 'analytics', label: '2. Interactive Analytics' },
  { id: 'predictions', label: '3. Predictions' },
  { id: 'insights', label: '4. Insights & Recommendations' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-extrabold text-white"
              style={{ backgroundColor: TOKENS.green[900] }}
            >
              EF
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-gray-900 sm:text-lg">
                Household Energy Consumption Forecasting
              </h1>
              <p className="text-xs text-gray-500">
                SDG 7 · SDG 9 · SDG 12 — Real-Artifact Analytics & Demand-Response Dashboard
              </p>
            </div>
          </div>

          {/* 4-Tab Navigation Bar */}
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Main Tabs">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold transition sm:text-sm"
                  style={{
                    backgroundColor: isActive ? TOKENS.green[900] : '#ffffff',
                    color: isActive ? '#ffffff' : '#374151',
                    border: isActive ? `1px solid ${TOKENS.green[900]}` : '1px solid #e5e7eb',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'predictions' && <PredictionsTab />}
        {activeTab === 'insights' && <InsightsTab />}
      </main>

      {/* Clean Footer */}
      <footer className="mt-12 border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500">
        All metrics, predictions, and recommendations are served dynamically from Phase 1 exported artifacts via FastAPI.
      </footer>
    </div>
  );
}
