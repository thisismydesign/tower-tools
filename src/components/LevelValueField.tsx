import { Group, NumberInput, Slider, Stack, Text } from "@mantine/core";
import { useState } from "react";

import { round } from "../model/goldenBot";

/**
 * One-line level input paired with the value that level produces (metres or
 * multiplier). Editing either updates the other; the slider drives both.
 * Typing a value snaps to the nearest level.
 */
export function LevelValueField({
  label,
  level,
  maxLevel,
  base,
  perLevel,
  suffix,
  decimals,
  onChange,
}: {
  label: string;
  level: number;
  maxLevel: number;
  base: number;
  perLevel: number;
  suffix: string;
  decimals: number;
  onChange: (level: number) => void;
}) {
  const clampLevel = (n: number) => Math.min(maxLevel, Math.max(0, Math.round(n)));
  const valueOf = (l: number) => base + perLevel * l;
  const levelOf = (v: number) => clampLevel((v - base) / perLevel);
  const fmtValue = (l: number) => round(valueOf(l), decimals).toFixed(decimals);
  // Keep what the user is typing in the value box until it maps to a different level.
  const [draft, setDraft] = useState<string | null>(null);
  const draftNum = draft === null ? NaN : Number(draft);
  const shownValue =
    draft !== null && draft.trim() !== "" && !Number.isNaN(draftNum) && levelOf(draftNum) === level
      ? draft
      : fmtValue(level);
  return (
    <Stack gap={6}>
      <Group align="center" gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">
          Lvl
        </Text>
        <NumberInput
          size="xs"
          w={56}
          value={level}
          min={0}
          max={maxLevel}
          step={1}
          clampBehavior="strict"
          allowDecimal={false}
          hideControls
          styles={{ input: { textAlign: "right" } }}
          onChange={(next) => {
            if (typeof next !== "number") return;
            setDraft(null);
            onChange(clampLevel(next));
          }}
        />
        <NumberInput
          size="xs"
          w={72}
          value={shownValue}
          hideControls
          allowDecimal={decimals > 0}
          styles={{ input: { textAlign: "right", fontWeight: 600 } }}
          onChange={(next) => {
            setDraft(String(next));
            if (typeof next === "number") onChange(levelOf(next));
          }}
        />
        <Text size="xs" c="dimmed" style={{ minWidth: 16 }}>
          {suffix}
        </Text>
      </Group>
      <Slider
        value={level}
        min={0}
        max={maxLevel}
        step={1}
        label={null}
        size="sm"
        onChange={(n) => {
          setDraft(null);
          onChange(clampLevel(n));
        }}
      />
    </Stack>
  );
}
