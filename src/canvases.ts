import type { ComponentType } from "react";

import EnemyLevelSkipPlanner from "../.cursor/canvases/enemy-level-skip.canvas";
import ThornCalculator from "../.cursor/canvases/thorn-calculator.canvas";

export interface CanvasEntry {
  id: string;
  title: string;
  Component: ComponentType;
}

/** Registered canvases shown in the web app nav. Add an entry when you add a new `.canvas.tsx`. */
export const CANVASES: CanvasEntry[] = [
  {
    id: "enemy-level-skip",
    title: "Enemy Level Skip",
    Component: EnemyLevelSkipPlanner,
  },
  {
    id: "thorn-calculator",
    title: "Thorn Calculator",
    Component: ThornCalculator,
  },
];

export const DEFAULT_CANVAS_ID = CANVASES[0]?.id ?? "";

export function canvasById(id: string): CanvasEntry | undefined {
  return CANVASES.find((c) => c.id === id);
}
