import type { Fund } from "@/server/service";

export function FundSummary({ fund }: { fund: Fund }) {
  const cells: [string, string, string][] = [
    ["Budget", fund.budget, "text-gray-900"],
    ["Released", fund.released, "text-emerald-700"],
    ["Committed (in flight)", fund.committed, "text-blue-700"],
    ["Remaining", fund.remaining, "text-gray-900 font-bold"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map(([label, value, cls]) => (
        <div className="rounded-lg border p-3" key={label}>
          <dt className="text-xs uppercase text-gray-500">{label}</dt>
          <dd className={`text-lg ${cls}`}>
            {value} <span className="text-sm font-normal text-gray-500">{fund.currency}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
