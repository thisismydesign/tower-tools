// Shared test environment: jest-dom matchers plus the browser APIs Mantine
// and Recharts expect that jsdom does not ship.
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

window.matchMedia ??= (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Tools must not reach the network in tests. Anything fetched (e.g. the
// default stats JSON) comes back as a 404 so the in-app fallback kicks in.
vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
