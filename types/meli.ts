export interface MeliUser {
  id: number;
  nickname: string;
  site_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface MeliOrderItem {
  item?: {
    id?: string;
    title?: string;
    seller_sku?: string | null;
  };
  quantity?: number;
  unit_price?: number;
  full_unit_price?: number;
  sale_fee?: number;
}

export interface MeliOrder {
  id: number;
  date_created?: string;
  date_closed?: string;
  status?: string;
  total_amount?: number;
  currency_id?: string;
  order_items?: MeliOrderItem[];
  buyer?: { nickname?: string };
}

export interface MeliOrdersSearch {
  results: MeliOrder[];
  paging?: { total?: number; offset?: number; limit?: number };
}
