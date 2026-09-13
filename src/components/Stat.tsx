import { Paper, Text } from "@mantine/core";
import type { ReactNode } from "react";

/** A single headline figure with its caption. */
export function Stat({ value, label, color }: { value: ReactNode; label: string; color?: string }) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text fz={26} fw={650} lh={1.2} c={color}>
        {value}
      </Text>
      <Text size="xs" c="dimmed" mt={6}>
        {label}
      </Text>
    </Paper>
  );
}
