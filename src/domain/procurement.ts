/**
 * Simulated suppliers for the buyer agent. Each has fixed, deterministic rules:
 * an opening price and a floor (both relative to the market reference price),
 * a concession step per round, a lead time and limited stock. Prices the agent
 * sees come only from here, so the AI cannot invent a quote.
 */
export type Supplier = {
  id: string;
  name: string;
  /** Opening price as a multiple of the reference unit price. */
  openFactor: number;
  /** Lowest price it will ever accept, as a multiple of the reference. */
  floorFactor: number;
  /** Price drop per round without a counter-offer, as a multiple of the reference. */
  stepFactor: number;
  leadDays: number;
  stock: number;
};

export const SUPPLIERS: Supplier[] = [
  {
    id: "lion-city",
    name: "Lion City Building Supplies",
    openFactor: 1.25,
    floorFactor: 0.97,
    stepFactor: 0.08,
    leadDays: 3,
    stock: 500,
  },
  {
    id: "jurong",
    name: "Jurong Tile & Trade Depot",
    openFactor: 1.1,
    floorFactor: 0.9,
    stepFactor: 0.05,
    leadDays: 7,
    stock: 1000,
  },
  {
    id: "kranji",
    name: "Kranji Express Wholesale",
    openFactor: 1.35,
    floorFactor: 1.02,
    stepFactor: 0.12,
    leadDays: 2,
    stock: 60,
  },
];

export const MAX_ROUNDS = 3;

export type Quote = {
  supplierId: string;
  supplierName: string;
  round: number;
  /** What the buyer offered this round, if anything. */
  counterUnitMinor: number | null;
  unitMinor: number;
  totalMinor: number;
  quantity: number;
  leadDays: number;
  available: boolean;
  note: string;
};

export function supplierQuote(
  s: Supplier,
  input: {
    referenceUnitMinor: number;
    quantity: number;
    round: number;
    previousUnitMinor?: number;
    counterUnitMinor?: number;
  },
): Quote {
  const ref = input.referenceUnitMinor;
  const floor = Math.round(ref * s.floorFactor);
  const counter = input.counterUnitMinor ?? null;
  let unit: number;
  let note: string;
  if (input.round === 1 || input.previousUnitMinor === undefined) {
    unit = Math.round(ref * s.openFactor);
    note = "Opening offer";
  } else {
    const conceded = Math.max(floor, input.previousUnitMinor - Math.round(ref * s.stepFactor));
    if (counter !== null && counter >= floor && counter <= input.previousUnitMinor) {
      unit = counter;
      note = "Accepted your counter-offer";
    } else if (counter !== null && counter < floor && input.round >= MAX_ROUNDS) {
      unit = floor;
      note = "Best and final: this is our lowest price";
    } else if (conceded === floor) {
      unit = floor;
      note = "This is our lowest price";
    } else {
      unit = conceded;
      note = counter !== null ? "Can't go that low, but we can move a little" : "Small discount";
    }
  }
  const available = input.quantity <= s.stock;
  return {
    supplierId: s.id,
    supplierName: s.name,
    round: input.round,
    counterUnitMinor: counter,
    unitMinor: unit,
    totalMinor: unit * input.quantity,
    quantity: input.quantity,
    leadDays: s.leadDays,
    available,
    note: available ? note : `Only ${s.stock} in stock, cannot fill ${input.quantity}`,
  };
}

/** One negotiation: holds round state per supplier and records every quote. */
export class SupplierDesk {
  readonly quotes: Quote[] = [];
  readonly suppliers: Supplier[];
  private readonly referenceUnitMinor: number;
  private readonly quantity: number;

  constructor(input: { referenceUnitMinor: number; quantity: number; suppliers?: Supplier[] }) {
    this.referenceUnitMinor = input.referenceUnitMinor;
    this.quantity = input.quantity;
    this.suppliers = input.suppliers ?? SUPPLIERS;
  }

  latest(supplierId: string): Quote | undefined {
    return this.quotes.filter((q) => q.supplierId === supplierId).at(-1);
  }

  /** Ask a supplier for a quote, optionally with a per-unit counter-offer in minor units. */
  ask(supplierId: string, counterUnitMinor?: number): Quote {
    const s = this.suppliers.find((x) => x.id === supplierId);
    if (!s) throw new Error(`Unknown supplier ${supplierId}`);
    const prev = this.latest(supplierId);
    const round = (prev?.round ?? 0) + 1;
    if (round > MAX_ROUNDS) throw new Error(`${s.name}: already negotiated ${MAX_ROUNDS} rounds`);
    const q = supplierQuote(s, {
      referenceUnitMinor: this.referenceUnitMinor,
      quantity: this.quantity,
      round,
      previousUnitMinor: prev?.unitMinor,
      counterUnitMinor,
    });
    this.quotes.push(q);
    return q;
  }
}

export type QuoteRow = {
  supplierId: string;
  supplierName: string;
  openingUnitMinor: number;
  finalUnitMinor: number;
  totalMinor: number;
  leadDays: number;
  rounds: number;
  available: boolean;
  withinBudget: boolean;
  withinDeadline: boolean;
  lastNote: string;
};

/** Each supplier's final offer, checked against the owner's budget and deadline. */
export function summariseQuotes(quotes: Quote[], limits: { budgetMinor: number; deadlineDays: number }): QuoteRow[] {
  const ids = [...new Set(quotes.map((q) => q.supplierId))];
  return ids.map((id) => {
    const qs = quotes.filter((q) => q.supplierId === id);
    const last = qs.at(-1)!;
    return {
      supplierId: id,
      supplierName: last.supplierName,
      openingUnitMinor: qs[0].unitMinor,
      finalUnitMinor: last.unitMinor,
      totalMinor: last.totalMinor,
      leadDays: last.leadDays,
      rounds: qs.length,
      available: last.available,
      withinBudget: last.totalMinor <= limits.budgetMinor,
      withinDeadline: last.leadDays <= limits.deadlineDays,
      lastNote: last.note,
    };
  });
}

export const fits = (r: QuoteRow) => r.available && r.withinBudget && r.withinDeadline;

/**
 * Hard rule over the agent's pick: the recommendation must fit budget, deadline
 * and stock. A pick that does not fit is replaced by the cheapest offer that does.
 */
export function decideWinner(
  rows: QuoteRow[],
  agentPick: string | null,
  limits: { deadlineDays: number },
): { winner: QuoteRow | null; overruled: string | null } {
  const best = rows.filter(fits).sort((a, b) => a.totalMinor - b.totalMinor)[0] ?? null;
  const picked = rows.find((r) => r.supplierId === agentPick);
  if (picked && fits(picked)) return { winner: picked, overruled: null };
  if (!picked) {
    return {
      winner: best,
      overruled:
        agentPick && !picked
          ? `The agent picked an unknown supplier "${agentPick}"`
          : best && agentPick === null
            ? "The agent recommended no supplier, but one fits the limits"
            : null,
    };
  }
  const why = !picked.available
    ? "cannot supply the full quantity"
    : !picked.withinDeadline
      ? `delivers in ${picked.leadDays} days, past the deadline of ${limits.deadlineDays} days`
      : "is over budget";
  return { winner: best, overruled: `The agent picked ${picked.supplierName}, which ${why}` };
}
