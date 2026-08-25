import { Card, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";

/** Bordered card with a titled header; `trailing` sits right-aligned in the header. */
export function SectionCard({
  title,
  trailing,
  children,
}: {
  title: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card withBorder radius="md" padding="lg">
      <Card.Section withBorder inheritPadding py="sm">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text fw={600}>{title}</Text>
          {trailing}
        </Group>
      </Card.Section>
      <Card.Section inheritPadding py="md">
        {children}
      </Card.Section>
    </Card>
  );
}
