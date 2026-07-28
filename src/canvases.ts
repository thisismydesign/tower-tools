import type { ComponentType } from "react";

import BattleReportStats from "../canvases/battle-report-stats.canvas";
import EnemyLevelSkipPlanner from "../canvases/enemy-level-skip.canvas";
import ThornCalculator from "../canvases/thorn-calculator.canvas";

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
  {
    id: "battle-report-stats",
    title: "Battle Report Stats",
    Component: BattleReportStats,
  },
];

export const DEFAULT_CANVAS_ID = CANVASES[0]?.id ?? "";

export function canvasById(id: string): CanvasEntry | undefined {
  return CANVASES.find((c) => c.id === id);
}
