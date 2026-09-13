import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useHash } from "@mantine/hooks";

import BattleReportStats from "./tools/BattleReportStats";
import EnemyLevelSkip from "./tools/EnemyLevelSkip";
import GoldenBotSniper from "./tools/GoldenBotSniper";
import SubmodReroll from "./tools/SubmodReroll";
import ThornCalculator from "./tools/ThornCalculator";

/** Nav entries; `id` doubles as the `#/<id>` route. Add a line per tool. */
const TOOLS = [
  { id: "enemy-level-skip", title: "Enemy Level Skip", Component: EnemyLevelSkip },
  { id: "thorn-calculator", title: "Thorn Calculator", Component: ThornCalculator },
  { id: "golden-bot-sniper", title: "Golden Bot + Gilded Sniper", Component: GoldenBotSniper },
  { id: "submod-reroll", title: "Submod Reroll", Component: SubmodReroll },
  { id: "battle-report-stats", title: "Battle Report Stats", Component: BattleReportStats },
];

function ColorSchemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const next = useComputedColorScheme("light") === "dark" ? "light" : "dark";
  return (
    <ActionIcon variant="default" size="lg" aria-label={`Switch to ${next} mode`} onClick={() => setColorScheme(next)}>
      {next === "dark" ? "🌙" : "☀️"}
    </ActionIcon>
  );
}

export default function App() {
  // Hash routing keeps deep links working on GitHub Pages without rewrites.
  const [hash, setHash] = useHash({ getInitialValueInEffect: false });
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure(false);

  const active = TOOLS.find((t) => `#/${t.id}` === hash) ?? TOOLS[0];

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: "sm", collapsed: { mobile: !navOpened } }}
      padding="lg"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" aria-label="Toggle tools" />
            <Title order={4}>Tower Tools</Title>
            <Text size="xs" c="dimmed" visibleFrom="sm">
              The Tower calculators
            </Text>
          </Group>
          <ColorSchemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap={4}>
          {TOOLS.map((tool) => (
            <NavLink
              key={tool.id}
              label={tool.title}
              active={tool.id === active.id}
              onClick={() => {
                setHash(`/${tool.id}`);
                closeNav();
              }}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <active.Component />
        </div>
      </AppShell.Main>
    </AppShell>
  );
}
