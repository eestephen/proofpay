"use client";

import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import type { PurchaseQuoteRow } from "@/server/service";

ModuleRegistry.registerModules([AllCommunityModule]);

const yesNo = (ok: boolean) => (ok ? "✓" : "✗");

/** Side-by-side supplier offers for one purchase request. */
export function QuotesGrid({ rows, currency }: { rows: PurchaseQuoteRow[]; currency: string }) {
  const money = (v: number) => `${v.toFixed(2)} ${currency}`;
  const columns: ColDef<PurchaseQuoteRow>[] = [
    {
      field: "supplierName",
      headerName: "Supplier",
      flex: 2,
      minWidth: 330,
      cellRenderer: (p: { value: string; data?: PurchaseQuoteRow }) => (
        <span>
          {p.value}
          {p.data?.recommended && (
            <span className="ml-2 rounded bg-emerald-600 px-2 py-0.5 text-xs text-white">Recommended</span>
          )}
        </span>
      ),
    },
    { field: "openingUnit", headerName: "Opening / unit", width: 140, valueFormatter: (p) => money(p.value) },
    { field: "finalUnit", headerName: "Final / unit", width: 130, valueFormatter: (p) => money(p.value) },
    { field: "total", headerName: "Total", width: 130, sort: "asc", valueFormatter: (p) => money(p.value) },
    { field: "leadDays", headerName: "Delivery", width: 110, valueFormatter: (p) => `${p.value} days` },
    { field: "rounds", headerName: "Rounds", width: 100 },
    {
      field: "withinBudget",
      headerName: "Budget",
      width: 100,
      cellDataType: false,
      valueFormatter: (p) => yesNo(p.value),
      cellClass: (p) => (p.value ? "text-emerald-700" : "text-red-700 font-semibold"),
    },
    {
      field: "withinDeadline",
      headerName: "Deadline",
      width: 110,
      cellDataType: false,
      valueFormatter: (p) => yesNo(p.value),
      cellClass: (p) => (p.value ? "text-emerald-700" : "text-red-700 font-semibold"),
    },
    {
      field: "available",
      headerName: "Stock",
      width: 90,
      cellDataType: false,
      valueFormatter: (p) => yesNo(p.value),
      cellClass: (p) => (p.value ? "text-emerald-700" : "text-red-700 font-semibold"),
    },
    { field: "lastNote", headerName: "Supplier's last reply", flex: 2, minWidth: 220 },
  ];
  return (
    <div style={{ height: 80 + rows.length * 42 }}>
      <AgGridReact<PurchaseQuoteRow>
        columnDefs={columns}
        defaultColDef={{ sortable: true, resizable: true }}
        getRowId={(p) => p.data.supplierId}
        rowClassRules={{ "bg-emerald-50": (p) => p.data?.recommended === true }}
        rowData={rows}
      />
    </div>
  );
}
