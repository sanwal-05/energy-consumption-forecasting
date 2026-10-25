// Strictly only the design tokens specified in AGENTS.md / Agents2.md
export const TOKENS = {
  green: {
    900: '#204110', // Darkest green (Actual line, primary good text/badges)
    700: '#375f25', // Deep green (secondary bars, good indicators)
    500: '#749764', // Medium green (standard bars, normal consumption)
    300: '#a0bd85', // Soft green (accents, gauge segments)
    100: '#c8d9c2', // Light green (badge backgrounds, best-model row highlight)
  },
  red: {
    900: '#6b0015', // Darkest red (high-error stroke, critical text)
    800: '#850014', // Deep red (overconsumption / negative R2 text)
    700: '#a50727', // Rich red (high bars, alert borders)
    600: '#ae001a', // Vivid red (secondary alert bars)
    500: '#e10531', // Bright red (Predicted line, highest bar, large-error highlight)
  },
};
