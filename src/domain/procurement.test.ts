import { describe, expect, it } from "vitest";
import { negotiateByRules, SupplierDesk, SUPPLIERS, supplierQuote, type Supplier } from "./procurement";

const s: Supplier = {
  id: "t",
  name: "Test Supply",
  openFactor: 1.2,
  floorFactor: 0.95,
  stepFactor: 0.1,
  leadDays: 3,
  stock: 100,
};
const base = { referenceUnitMinor: 10000, quantity: 40 };

describe("supplierQuote", () => {
  it("opens above the reference price", () => {
    expect(supplierQuote(s, { ...base, round: 1 })).toMatchObject({
      unitMinor: 12000,
      totalMinor: 480000,
      leadDays: 3,
      available: true,
    });
  });

  it("concedes one step per round without a counter-offer", () => {
    expect(supplierQuote(s, { ...base, round: 2, previousUnitMinor: 12000 }).unitMinor).toBe(11000);
  });

  it("accepts a counter-offer at or above its floor", () => {
    const q = supplierQuote(s, { ...base, round: 2, previousUnitMinor: 12000, counterUnitMinor: 9600 });
    expect(q.unitMinor).toBe(9600);
    expect(q.note).toMatch(/accept/i);
  });

  it("never goes below its floor, whatever the counter-offer", () => {
    const q = supplierQuote(s, { ...base, round: 3, previousUnitMinor: 9600, counterUnitMinor: 5000 });
    expect(q.unitMinor).toBe(9500);
    expect(q.note).toMatch(/lowest/i);
  });

  it("is unavailable when the quantity exceeds its stock", () => {
    const q = supplierQuote(s, { referenceUnitMinor: 10000, quantity: 500, round: 1 });
    expect(q.available).toBe(false);
    expect(q.note).toMatch(/100 in stock/);
  });
});

describe("SupplierDesk", () => {
  it("records every quote and caps each supplier at 3 rounds", () => {
    const desk = new SupplierDesk({ referenceUnitMinor: 10000, quantity: 40, suppliers: [s] });
    desk.ask("t");
    desk.ask("t", 9000);
    desk.ask("t", 9000);
    expect(() => desk.ask("t", 9000)).toThrow(/3 rounds/);
    expect(desk.quotes.map((q) => q.round)).toEqual([1, 2, 3]);
    expect(desk.latest("t")?.unitMinor).toBe(9500);
  });

  it("refuses unknown suppliers", () => {
    const desk = new SupplierDesk({ referenceUnitMinor: 10000, quantity: 1, suppliers: [s] });
    expect(() => desk.ask("nope")).toThrow(/Unknown supplier/);
  });

  it("ships three distinct demo suppliers", () => {
    expect(new Set(SUPPLIERS.map((x) => x.id)).size).toBe(3);
  });
});

describe("negotiateByRules", () => {
  const limits = { budgetMinor: 130000, deadlineDays: 5 };
  it("opens with everyone, counters those that can deliver, and picks the cheapest fit", () => {
    const desk = new SupplierDesk({ referenceUnitMinor: 3000, quantity: 40 });
    const r = negotiateByRules((id, c) => desk.ask(id, c), desk.suppliers, [], limits);
    expect(new Set(desk.quotes.map((q) => q.supplierId)).size).toBe(3);
    expect(desk.latest("lion-city")!.round).toBe(3);
    expect(desk.latest("jurong")!.round).toBe(1); // 7 days: not worth countering
    expect(r.supplierId).toBe("lion-city"); // Kranji's floor is above Lion City's
    expect(desk.latest("lion-city")!.unitMinor).toBeLessThan(desk.quotes[0].unitMinor);
  });

  it("continues from rounds the AI already spent", () => {
    const desk = new SupplierDesk({ referenceUnitMinor: 3000, quantity: 40 });
    const first = desk.ask("lion-city");
    negotiateByRules((id, c) => desk.ask(id, c), desk.suppliers, [first], limits);
    expect(desk.quotes.filter((q) => q.supplierId === "lion-city")).toHaveLength(3);
  });

  it("returns null when nothing fits", () => {
    const desk = new SupplierDesk({ referenceUnitMinor: 3000, quantity: 40 });
    expect(
      negotiateByRules((id, c) => desk.ask(id, c), desk.suppliers, [], { budgetMinor: 100, deadlineDays: 5 })
        .supplierId,
    ).toBeNull();
  });
});
