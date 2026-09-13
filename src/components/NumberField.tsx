import { Group, NumberInput, Slider, Stack, Text } from "@mantine/core";

/** Label + hint + number input, with a slider when the range is small enough to drag usefully. */
export function NumberField({
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
  suffix?: string;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const withSlider = step > 0 && max - min <= 200;
  return (
    <Stack gap={6}>
      <Group align="center" gap="xs" wrap="nowrap">
        <Stack gap={0} style={{ flex: 1 }}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          {hint && (
            <Text size="xs" c="dimmed">
              {hint}
            </Text>
          )}
        </Stack>
        <NumberInput
          size="xs"
          w={96}
          value={value}
          min={min}
          max={max}
          step={step > 0 ? step : undefined}
          clampBehavior="strict"
          allowDecimal={!Number.isInteger(step) || step === 0}
          hideControls
          styles={{ input: { textAlign: "right" } }}
          onChange={(next) => typeof next === "number" && onChange(clamp(next))}
        />
        <Text size="xs" c="dimmed" style={{ minWidth: 16, whiteSpace: "nowrap" }}>
          {suffix ?? ""}
        </Text>
      </Group>
      {withSlider && (
        <Slider value={value} min={min} max={max} step={step} label={null} size="sm" onChange={(n) => onChange(clamp(n))} />
      )}
    </Stack>
  );
}
