import { Group, NumberInput, Slider, Stack, Text } from "@mantine/core";

/** Label + number input + slider. */
export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Trailing note next to the number input, e.g. a unit or derived value. */
  suffix?: string;
  /** Explanatory line under the slider. */
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <Stack gap={6}>
      <Group align="center" gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed" style={{ flex: 1 }}>
          {label}
        </Text>
        <NumberInput
          size="xs"
          w={76}
          value={value}
          min={min}
          max={max}
          step={step}
          clampBehavior="strict"
          allowDecimal={!Number.isInteger(step)}
          hideControls
          styles={{ input: { textAlign: "right" } }}
          onChange={(next) => typeof next === "number" && onChange(next)}
        />
        {suffix && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            {suffix}
          </Text>
        )}
      </Group>
      <Slider value={value} min={min} max={max} step={step} label={null} size="sm" onChange={onChange} />
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}
