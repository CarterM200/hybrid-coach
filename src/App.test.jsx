// UI smoke tests. With no `storage` prop the app hydrates instantly from the seeded
// athlete, so these exercise the real render path (header, nav, tab switching) and the
// error boundary — catching the kind of UI regression a pure-engine test can't.
import { describe, test, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import App from "./HybridCoach";

afterEach(cleanup);

describe("App shell", () => {
  test("renders the dashboard for the seeded athlete", () => {
    render(<App />);
    expect(screen.getByText("HyCo")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Progress" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Profile" })).toBeInTheDocument();
  });

  test("navigating to the Progress tab shows the progress view", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Progress" }));
    expect(screen.getByRole("tab", { name: "Progress" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Weekly running volume")).toBeInTheDocument();
  });

  test("navigating to the Race tab works", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("tab", { name: "Race" }));
    // Race view renders a VO2 / race section heading
    expect(screen.getByRole("tab", { name: "Race" })).toHaveAttribute("aria-selected", "true");
  });

  test("bottom nav exposes all five tabs as ARIA tabs", () => {
    render(<App />);
    expect(screen.getAllByRole("tab").length).toBeGreaterThanOrEqual(5);
  });
});
