import { Table, Text } from "@mantine/core";
import type { ReactNode } from "react";

/** Table from plain arrays of cells; `highlightRow` marks the selected row. */
export function DataTable({
  headers,
  rows,
  align,
  highlightRow,
  emptyMessage,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  /** Per-column alignment, positionally matched to `headers`; defaults to left. */
  align?: Array<"left" | "center" | "right">;
  highlightRow?: number;
  emptyMessage?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        {emptyMessage}
      </Text>
    );
  }
  return (
    <Table.ScrollContainer minWidth={360}>
      <Table striped highlightOnHover withTableBorder verticalSpacing="xs" horizontalSpacing="md">
        <Table.Thead>
          <Table.Tr>
            {headers.map((header, i) => (
              <Table.Th key={i} ta={align?.[i]}>
                {header}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row, r) => (
            <Table.Tr key={r} bg={r === highlightRow ? "var(--mantine-primary-color-light)" : undefined}>
              {row.map((cell, c) => (
                <Table.Td key={c} ta={align?.[c]}>
                  {cell}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
