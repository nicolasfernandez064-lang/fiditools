export type Regimen = "MONO" | "RI";
export type CostMode = "ARS" | "USD";

export interface CalculatorValues {
  regimen: Regimen;
  productName: string;
  salePrice: number;
  quantity: number;
  costARS: number;
  costUSD: number;
  dollar: number;
  costMode: CostMode;
  commissionPct: number;
  installmentPct: number;
  iibbPct: number;
  perceptionsPct: number;
  shipping: number;
  ivaNoRec: number;
  applyBruno: boolean;
  purchaseInvoiced: boolean;
  servicesIncludeIVA: boolean;
}

export interface CalculatorResult {
  price: number;
  quantity: number;
  cost: number;
  convertedCost: number;
  netSale: number;
  vatDebit: number;
  iibb: number;
  perceptions: number;
  commissionCash: number;
  installmentCash: number;
  shippingCash: number;
  commissionNet: number;
  shippingNet: number;
  commissionVatCredit: number;
  shippingVatCredit: number;
  merchandiseVatCredit: number;
  brunoCalculated: number;
  brunoApplied: number;
  ivaNoRec: number;
  vatBalance: number;
  definitiveOutflow: number;
  profitUnit: number;
  profitTotal: number;
  cashUnit: number;
  cashTotal: number;
  billingTotal: number;
  margin: number;
  returnOnCost: number;
}

export const calculatorDefaults: CalculatorValues = {
  regimen: "RI",
  productName: "Producto Mercado Libre",
  salePrice: 329999,
  quantity: 1,
  costARS: 228750,
  costUSD: 145.7,
  dollar: 1570,
  costMode: "USD",
  commissionPct: 12.5,
  installmentPct: 0,
  iibbPct: 4,
  perceptionsPct: 3,
  shipping: 6600,
  ivaNoRec: 0,
  applyBruno: false,
  purchaseInvoiced: true,
  servicesIncludeIVA: true
};

export function numeric(value: unknown) {
  const parsed = Number(String(value ?? 0).replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export function calculateProfitability(values: CalculatorValues): CalculatorResult {
  const price = numeric(values.salePrice);
  const quantity = Math.max(1, Math.floor(numeric(values.quantity)) || 1);
  const costARS = numeric(values.costARS);
  const convertedCost = numeric(values.costUSD) * numeric(values.dollar);
  const cost = values.costMode === "USD" ? convertedCost : costARS;
  const isRI = values.regimen === "RI";
  const commissionRate = numeric(values.commissionPct) / 100;
  const installmentRate = numeric(values.installmentPct) / 100;
  const iibbRate = numeric(values.iibbPct) / 100;
  const perceptionsRate = numeric(values.perceptionsPct) / 100;

  const netSale = isRI ? price / 1.21 : price;
  const vatDebit = isRI ? price - netSale : 0;
  const iibb = netSale * iibbRate;
  const perceptions = price * perceptionsRate;

  const commissionInput = price * commissionRate;
  const installmentInput = price * installmentRate;
  const servicesIncludeVat = isRI && values.servicesIncludeIVA;

  const commissionNet = isRI ? (servicesIncludeVat ? commissionInput / 1.21 : commissionInput) : commissionInput;
  const installmentNet = isRI ? (servicesIncludeVat ? installmentInput / 1.21 : installmentInput) : installmentInput;
  const meliServicesNet = commissionNet + installmentNet;
  const commissionVatCredit = isRI ? meliServicesNet * 0.21 : 0;
  const commissionCash = isRI && !servicesIncludeVat ? commissionNet * 1.21 : commissionInput;
  const installmentCash = isRI && !servicesIncludeVat ? installmentNet * 1.21 : installmentInput;

  const shippingInput = numeric(values.shipping);
  const shippingNet = isRI ? (servicesIncludeVat ? shippingInput / 1.21 : shippingInput) : shippingInput;
  const shippingVatCredit = isRI ? shippingNet * 0.21 : 0;
  const shippingCash = isRI && !servicesIncludeVat ? shippingNet * 1.21 : shippingInput;

  const merchandiseVatCredit = isRI && values.purchaseInvoiced ? (cost / 1.21) * 0.21 : 0;
  const brunoCalculated = (cost / 1.21) * 0.168;
  const ivaNoRec = isRI ? 0 : numeric(values.ivaNoRec);
  const brunoApplied = !isRI && values.applyBruno ? brunoCalculated : 0;

  const vatBalance = isRI ? vatDebit - merchandiseVatCredit - commissionVatCredit - shippingVatCredit : 0;
  const definitiveOutflow = cost + commissionCash + installmentCash + iibb + shippingCash + ivaNoRec + brunoApplied + vatBalance;
  const profitUnit = price - definitiveOutflow;
  const profitTotal = profitUnit * quantity;
  const cashUnit = profitUnit - perceptions;
  const cashTotal = cashUnit * quantity;

  return {
    price,
    quantity,
    cost,
    convertedCost,
    netSale,
    vatDebit,
    iibb,
    perceptions,
    commissionCash,
    installmentCash,
    shippingCash,
    commissionNet: meliServicesNet,
    shippingNet,
    commissionVatCredit,
    shippingVatCredit,
    merchandiseVatCredit,
    brunoCalculated,
    brunoApplied,
    ivaNoRec,
    vatBalance,
    definitiveOutflow,
    profitUnit,
    profitTotal,
    cashUnit,
    cashTotal,
    billingTotal: price * quantity,
    margin: price ? (profitUnit / price) * 100 : 0,
    returnOnCost: cost ? (profitUnit / cost) * 100 : 0
  };
}
