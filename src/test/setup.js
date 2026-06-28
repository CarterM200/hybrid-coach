// Vitest global setup: adds jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom";

// recharts' ResponsiveContainer needs real layout; jsdom has none, so we stub
// ResizeObserver to keep chart-bearing components from throwing during render tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
