import { useCallback, useEffect, useState } from "react";
import { NavLink, Stack, Text, Title } from "@mantine/core";

import { CANVASES, DEFAULT_CANVAS_ID, canvasById } from "./canvases";
import "./app.css";

function readHashId(): string {
  return window.location.hash.slice(1).replace(/^\//, "");
}

function useCanvasRoute(defaultId: string) {
  const [activeId, setActiveId] = useState(() => {
    const fromHash = readHashId();
    return canvasById(fromHash) ? fromHash : defaultId;
  });

  useEffect(() => {
    const syncFromHash = () => {
      const fromHash = readHashId();
      if (fromHash && canvasById(fromHash)) {
        setActiveId(fromHash);
      }
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  const navigate = useCallback((id: string) => {
    window.location.hash = `/${id}`;
    setActiveId(id);
  }, []);

  return [activeId, navigate] as const;
}

export default function App() {
  const [activeId, navigate] = useCanvasRoute(DEFAULT_CANVAS_ID);
  const active = canvasById(activeId) ?? CANVASES[0];
  const ActiveComponent = active?.Component;

  return (
    <div className="app-layout">
      <nav className="app-nav" aria-label="Tools">
        <Stack gap="md">
          <Stack gap={2}>
            <Title order={4}>Tower Tools</Title>
            <Text size="xs" c="dimmed">
              The Tower calculators
            </Text>
          </Stack>
          <Stack gap={4}>
            {CANVASES.map((canvas) => (
              <NavLink
                key={canvas.id}
                label={canvas.title}
                active={canvas.id === active?.id}
                onClick={() => navigate(canvas.id)}
              />
            ))}
          </Stack>
        </Stack>
      </nav>
      <main className="app-main">
        <div className="app-main-inner">{ActiveComponent ? <ActiveComponent /> : null}</div>
      </main>
    </div>
  );
}
