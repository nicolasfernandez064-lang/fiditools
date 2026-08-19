export const VAT_RATE = 0.21;
export const VAT_FACTOR = VAT_RATE / (1 + VAT_RATE);

export function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function vatFromGross(gross: number) {
  return gross > 0 ? gross * VAT_FACTOR : 0;
}

export function iibbFromSales(grossSales: number, ivaEnabled: boolean, rate: number) {
  if (grossSales <= 0 || rate <= 0) return 0;
  const base = ivaEnabled ? grossSales / (1 + VAT_RATE) : grossSales;
  return base * rate;
}

export function coreProfitability(input: {
  sales: number;
  fees: number;
  merchandiseCost: number;
  ivaNonRecoverable?: number;
}) {
  const sales = numberValue(input.sales);
  const fees = numberValue(input.fees);
  const merchandiseCost = numberValue(input.merchandiseCost);
  const ivaNonRecoverable = numberValue(input.ivaNonRecoverable);
  const result = sales - fees - merchandiseCost - ivaNonRecoverable;
  return {
    sales,
    fees,
    merchandiseCost,
    ivaNonRecoverable,
    result,
    margin: sales > 0 ? (result / sales) * 100 : 0
  };
}

export function fullProfitability(input: {
  sales: number;
  fees: number;
  merchandiseCost: number;
  ivaNonRecoverable?: number;
  shipping?: number;
  iibb?: number;
  vatBalance?: number;
}) {
  const core = coreProfitability(input);
  const shipping = numberValue(input.shipping);
  const iibb = numberValue(input.iibb);
  const vatBalance = numberValue(input.vatBalance);
  const result = core.result - shipping - iibb - vatBalance;
  return {
    ...core,
    shipping,
    iibb,
    vatBalance,
    result,
    margin: core.sales > 0 ? (result / core.sales) * 100 : 0
  };
}
