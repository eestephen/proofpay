"use client";

import { AllCommunityModule as ChartsModule, ModuleRegistry as ChartsRegistry, type AgChartOptions } from "ag-charts-community";
import { AgCharts } from "ag-charts-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type RowClickedEvent,
  type ValueFormatterParams,
} from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Ledger } from "@/server/service";

ModuleRegistry.registerModules([AllCommunityModule]);
ChartsRegistry.registerModules([ChartsModule]);

type Payment = Ledger["payments"][number];
type Entry = Ledger["audit"][number];

const STATUS: Record<string, string> = {
  paid: "bg-emerald-600 text-white",
  ordered: "bg-emerald-600 text-white",
  approved: "bg-blue-100 text-blue-800",
  ordering: "bg-blue-100 text-blue-800",
  payout_failed: "bg-red-100 text-red-800",
  order_failed: "bg-red-100 text-red-800",
};

function StatusCell({ value }: { value: string }) {
  if (!value) return null;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS[value] ?? "bg-gray-100"}`}>
      {value.replace("_", " ")}
    </span>
  );
}

const AUDIT_STYLE: Record<string, string> = {
  verified: "text-gray-800",
  payout_sent: "text-emerald-700",
  payout_status: "text-emerald-700",
  payout_failed: "text-red-700 font-semibold",
  override: "text-amber-700 font-semibold",
  verification_failed: "text-red-700",
};

export function LedgerView({ ledger }: { ledger: Ledger }) {
  const router = useRouter();
  const cur = ledger.currency;
  const money = (p: ValueFormatterParams) =>
    typeof p.value === "number" ? `${p.value.toLocaleString("en-SG", { minimumFractionDigits: 2 })} ${cur}` : "";
  const [shown, setShown] = useState<Payment[]>(ledger.payments);

  const paymentCols = useMemo<ColDef<Payment>[]>(
    () => [
      { field: "projectName", headerName: "Project", flex: 1.2, minWidth: 170, filter: "agTextColumnFilter", tooltipField: "projectName" },
      { field: "kind", headerName: "Type", width: 130, filter: "agTextColumnFilter" },
      { field: "item", headerName: "For", flex: 1.4, minWidth: 190, filter: "agTextColumnFilter", tooltipField: "item" },
      { field: "payee", headerName: "Paid to", flex: 1, minWidth: 150, filter: "agTextColumnFilter" },
      { field: "amount", headerName: "Amount", width: 140, filter: "agNumberColumnFilter", valueFormatter: money, type: "rightAligned" },
      { field: "status", headerName: "Status", width: 120, filter: "agTextColumnFilter", cellRenderer: StatusCell },
      { field: "payoutStatus", headerName: "PayPal", width: 110, valueFormatter: (p) => (p.node?.rowPinned ? "" : (p.value ?? "–")) },
      { field: "batchId", headerName: "Payout batch", width: 165, valueFormatter: (p) => (p.node?.rowPinned ? "" : (p.value ?? "–")) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cur],
  );

  const total = shown.reduce((s, p) => s + p.amount, 0);
  const pinned = [{ projectName: `Total (${shown.length} shown)`, amount: Math.round(total * 100) / 100 } as Payment];

  const auditCols = useMemo<ColDef<Entry>[]>(
    () => [
      {
        field: "at",
        headerName: "When",
        width: 190,
        sort: "desc",
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString("en-SG") : ""),
      },
      { field: "projectName", headerName: "Project", flex: 1, minWidth: 180, filter: "agTextColumnFilter" },
      { field: "subject", headerName: "Milestone / order", flex: 1.2, minWidth: 200, filter: "agTextColumnFilter" },
      {
        field: "kind",
        headerName: "Event",
        width: 160,
        filter: "agTextColumnFilter",
        cellClass: (p) => AUDIT_STYLE[p.value as string] ?? "text-gray-700",
      },
      { field: "detail", headerName: "Detail", flex: 3, minWidth: 320, filter: "agTextColumnFilter", tooltipField: "detail" },
    ],
    [],
  );

  const chart = useMemo<AgChartOptions>(
    () => ({
      data: ledger.projects.map((p) => ({ ...p, name: p.name.split(",")[0] })),
      title: { text: `Budget use by project (${cur})` },
      series: [
        { type: "bar" as const, xKey: "name", yKey: "released", yName: "Released", stacked: true, fill: "#2E7D4F" },
        { type: "bar" as const, xKey: "name", yKey: "committed", yName: "Committed (in flight)", stacked: true, fill: "#F2A541" },
        { type: "bar" as const, xKey: "name", yKey: "remaining", yName: "Remaining", stacked: true, fill: "#C9D6E6" },
      ],
      axes: {
        x: { type: "category", position: "bottom" },
        y: { type: "number", position: "left", label: { formatter: ({ value }) => Number(value).toLocaleString("en-SG") } },
      },
      legend: { position: "bottom" as const },
    }),
    [ledger.projects, cur],
  );

  const t = ledger.totals;
  const cards: [string, number | string, string][] = [
    ["Total budget", t.budget, "text-gray-900"],
    ["Released", t.released, "text-emerald-700"],
    ["Committed", t.committed, "text-blue-700"],
    ["Remaining", t.remaining, "text-gray-900 font-bold"],
    ["Payments made", t.paidCount, "text-gray-900"],
  ];

  return (
    <>
      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map(([label, value, cls]) => (
          <div className="rounded-lg border p-3" key={label}>
            <dt className="text-xs uppercase text-gray-500">{label}</dt>
            <dd className={`text-lg ${cls}`}>
              {typeof value === "number" && label !== "Payments made"
                ? `${value.toLocaleString("en-SG", { minimumFractionDigits: 2 })} ${cur}`
                : value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mb-8 rounded-lg border p-2" style={{ height: 320 }}>
        <AgCharts options={chart} />
      </div>

      <h2 className="mb-2 text-xl font-semibold">All payments and orders</h2>
      <p className="mb-2 text-sm text-gray-600">
        Filter any column; the pinned total updates to what is shown. Click a row to open it.
      </p>
      <div>
        <AgGridReact<Payment>
          domLayout="autoHeight"
          tooltipShowDelay={300}
          columnDefs={paymentCols}
          defaultColDef={{ sortable: true, resizable: true }}
          onFilterChanged={(e) => {
            const rows: Payment[] = [];
            e.api.forEachNodeAfterFilter((n) => n.data && rows.push(n.data));
            setShown(rows);
          }}
          onRowClicked={(e: RowClickedEvent<Payment>) => e.data?.href && router.push(e.data.href)}
          overlayNoRowsTemplate="No payments yet. Approve a milestone or a supplier quote."
          pinnedBottomRowData={pinned}
          rowClass="cursor-pointer"
          rowData={ledger.payments}
        />
      </div>

      <h2 className="mb-2 mt-10 text-xl font-semibold">Audit trail, all projects</h2>
      <p className="mb-2 text-sm text-gray-600">
        Every proof, AI check, rule hit, approval, override, payout and webhook, newest first.
      </p>
      <div>
        <AgGridReact<Entry>
          domLayout="autoHeight"
          columnDefs={auditCols}
          defaultColDef={{ sortable: true, resizable: true }}
          overlayNoRowsTemplate="Nothing has happened yet."
          pagination
          paginationPageSize={20}
          paginationPageSizeSelector={[20, 50, 100]}
          rowData={ledger.audit}
          tooltipShowDelay={300}
        />
      </div>
    </>
  );
}
