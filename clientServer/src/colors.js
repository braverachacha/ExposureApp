export const ANSI = {
  brand: '\x1b[38;5;44m',        // Teal
  brandBold: '\x1b[1;38;5;44m', 
  text: '\x1b[38;5;255m',        // Pure White
  dim: '\x1b[38;5;245m',         // Sea Gray
  success: '\x1b[38;5;157m',     // Seafoam
  warning: '\x1b[38;5;229m',     // Sand
  error: '\x1b[38;5;203m',       // Salmon
  reset: '\x1b[0m',
};

export const C = ANSI;

export const BLESSED = {
  brand: '#00ffcc',        // Teal
  brandBold: '#00ffcc',
  text: '#ffffff',         // Pure White
  dim: '#7a8a8a',          // Sea Gray
  success: '#7fffd4',      // Seafoam
  warning: '#ffe4b5',      // Sand
  error: '#fa8072',        // Salmon
};
