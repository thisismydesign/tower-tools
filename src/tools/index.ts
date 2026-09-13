import type { ComponentType } from "react";

import BattleReportStats from "./BattleReportStats";
import EnemyLevelSkip from "./EnemyLevelSkip";
import GoldenBotSniper from "./GoldenBotSniper";
import SubmodReroll from "./SubmodReroll";
import ThemesVsGoldenBot from "./ThemesVsGoldenBot";
import ThornCalculator from "./ThornCalculator";

export interface Tool {
  /** Nav id; doubles as the `#/<id>` route. */
  id: string;
  title: string;
  Component: ComponentType;
}

/** Every tool shown in the app nav, in order. Add a line per tool. */
export const TOOLS: Tool[] = [
  { id: "enemy-level-skip", title: "Enemy Level Skip", Component: EnemyLevelSkip },
  { id: "thorn-calculator", title: "Thorn Calculator", Component: ThornCalculator },
  { id: "golden-bot-sniper", title: "Golden Bot + Gilded Sniper", Component: GoldenBotSniper },
  { id: "themes-vs-golden-bot", title: "Themes vs. Golden Bot", Component: ThemesVsGoldenBot },
  { id: "submod-reroll", title: "Submod Reroll", Component: SubmodReroll },
  { id: "battle-report-stats", title: "Battle Report Stats", Component: BattleReportStats },
];
