"use client";

import { AllCommunityModule, ModuleRegistry, type ColDef, type RowClickedEvent } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useRouter } from "next/navigation";
import type { BoardRow } from "@/server/service";

ModuleRegistry.registerModules([AllCommunityModule]);

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  awaiting_proof: { label: "Awaiting proof", className: "bg-gray-100 text-gray-700" },
  under_review: { label: "Under review", className: "bg-blue-100 text-blue-800" },
  ready: { label: "Ready to release", className: "bg-green-100 text-green-800" },
  on_hold: { label: "On hold", className: "bg-amber-100 text-amber-900" },
  approved: { label: "Paying…", className: "bg-blue-100 text-blue-800" },
  payout_failed: { label: "Payout failed", className: "bg-red-100 text-red-800" },
  paid: { label: "Paid", className: "bg-emerald-600 text-white" },
};

function StatusCell({ value }: { value: string }) {
  const s = STATUS_STYLE[value] ?? { label: value, className: "bg-gray-100" };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}

const columns: ColDef<BoardRow>[] = [
  { field: "position", headerName: "#", width: 60 },
  { field: "title", headerName: "Milestone", flex: 2, minWidth: 220, filter: "agTextColumnFilter" },
  { field: "payeeName", headerName: "Payee", flex: 1, minWidth: 160, filter: "agTextColumnFilter" },
  {
    field: "amount",
    headerName: "Amount",
    width: 130,
    filter: "agNumberColumnFilter",
    valueFormatter: (p) => (p.data ? `${p.value.toFixed(2)} ${p.data.currency}` : ""),
  },
  {
    field: "status",
    headerName: "Status",
    width: 160,
    filter: "agTextColumnFilter",
    filterValueGetter: (p) => STATUS_STYLE[p.data?.status ?? ""]?.label ?? p.data?.status,
    cellRenderer: StatusCell,
  },
  {
    field: "recommendation",
    headerName: "AI + rules",
    width: 120,
    valueFormatter: (p) => (p.value ? String(p.value).toUpperCase() : "–"),
  },
  {
    field: "fraudChecks",
    headerName: "Fraud checks",
    width: 130,
    filter: "agNumberColumnFilter",
    cellClass: (p) => (p.value > 0 ? "font-semibold text-red-700" : undefined),
  },
  { field: "payoutStatus", headerName: "PayPal", width: 120, valueFormatter: (p) => p.value ?? "–" },
  {
    field: "lastEventAt",
    headerName: "Last event",
    flex: 1,
    minWidth: 190,
    valueFormatter: (p) =>
      p.data?.lastEvent && p.value ? `${p.data.lastEvent} · ${new Date(p.value).toLocaleTimeString("en-SG")}` : "–",
  },
];

/** Sortable, filterable milestone board. Clicking a row opens the milestone. */
export function MilestoneGrid({ rows }: { rows: BoardRow[] }) {
  const router = useRouter();
  return (
    <div style={{ height: 80 + rows.length * 42 }}>
      <AgGridReact<BoardRow>
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true }}
        getRowId={(p) => String(p.data.id)}
        onRowClicked={(e: RowClickedEvent<BoardRow>) => e.data && router.push(`/milestones/${e.data.id}`)}
        rowClass="cursor-pointer"
        rowData={rows}
      />
    </div>
  );
}
