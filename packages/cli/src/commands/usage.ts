import type { CliContext } from "../context.js";
import { writeLine } from "../context.js";
import { createPool } from "../db.js";
import { withPool } from "./shared.js";

interface RangeOptions {
  from?: string;
  to?: string;
  format?: string;
}

interface UsageRow {
  date: string;
  message_count: number;
  token_count: number;
}

export async function runUsageReport(
  context: CliContext,
  workspaceId: string,
  options: RangeOptions,
) {
  const rows = await getUsage(workspaceId, options);
  const totalMessages = rows.reduce((sum, row) => sum + row.message_count, 0);
  const totalTokens = rows.reduce((sum, row) => sum + row.token_count, 0);
  writeLine(
    context,
    JSON.stringify(
      {
        workspaceId,
        period: { from: options.from ?? null, to: options.to ?? null },
        totalMessages,
        totalTokens,
        daily: rows,
      },
      null,
      2,
    ),
  );
}

export async function runUsageDaily(
  context: CliContext,
  workspaceId: string,
  options: RangeOptions,
) {
  const rows = await getUsage(workspaceId, options);
  for (const row of rows) {
    writeLine(context, `${row.date}\t${row.message_count}\t${row.token_count}`);
  }
}

export async function runUsageExport(
  context: CliContext,
  workspaceId: string,
  options: RangeOptions,
) {
  const rows = await getUsage(workspaceId, options);
  if (options.format === "json") {
    writeLine(context, JSON.stringify(rows, null, 2));
    return;
  }
  writeLine(context, "date,message_count,token_count");
  for (const row of rows) {
    writeLine(context, `${row.date},${row.message_count},${row.token_count}`);
  }
}

async function getUsage(
  workspaceId: string,
  options: RangeOptions,
): Promise<UsageRow[]> {
  return withPool(createPool, async (pool) => {
    const conditions = ["workspace_id = $1"];
    const values: string[] = [workspaceId];
    if (options.from) {
      values.push(options.from);
      conditions.push(`date >= $${values.length}`);
    }
    if (options.to) {
      values.push(options.to);
      conditions.push(`date <= $${values.length}`);
    }
    const result = await pool.query<UsageRow>(
      `select date::text, message_count, token_count from usage where ${conditions.join(" and ")} order by date asc`,
      values,
    );
    return result.rows;
  });
}
