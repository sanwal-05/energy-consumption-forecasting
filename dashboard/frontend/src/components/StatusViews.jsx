import React from 'react';
import { TOKENS } from '../tokens';

export function LoadingState({ label = 'Loading data from FastAPI backend...' }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white p-12 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent"
        style={{ borderColor: `${TOKENS.green[300]} transparent ${TOKENS.green[900]} ${TOKENS.green[900]}` }}
      />
      <p className="mt-3 text-sm font-medium text-gray-600">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div
      className="rounded-xl border bg-white p-6 text-center"
      style={{ borderColor: TOKENS.red[700] }}
    >
      <p className="text-sm font-semibold" style={{ color: TOKENS.red[800] }}>
        Unable to load data from the API
      </p>
      <p className="mt-1 text-xs text-gray-600">{String(error)}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: TOKENS.red[700] }}
        >
          Retry Request
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message = 'No records available for the selected filter.' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
      <p className="text-sm font-medium text-gray-600">{message}</p>
    </div>
  );
}
