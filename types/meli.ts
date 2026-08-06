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

export interface MeliItemsSearch {
  seller_id?: string | number;
  results?: string[];
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
}

export interface MeliItemAttribute {
  id?: string;
  name?: string;
  value_id?: string | null;
  value_name?: string | null;
}

export interface MeliItemVariation {
  id?: number;
  price?: number;
  available_quantity?: number;
  sold_quantity?: number;
  seller_custom_field?: string | null;
  attributes?: MeliItemAttribute[];
}

export interface MeliItem {
  id?: string;
  title?: string;
  price?: number;
  currency_id?: string;
  available_quantity?: number;
  sold_quantity?: number;
  status?: string;
  sub_status?: string[];
  thumbnail?: string;
  secure_thumbnail?: string;
  permalink?: string;
  category_id?: string;
  listing_type_id?: string;
  catalog_listing?: boolean;
  seller_custom_field?: string | null;
  attributes?: MeliItemAttribute[];
  variations?: MeliItemVariation[];
  date_created?: string;
  last_updated?: string;
}

export interface MeliMultiGetItem {
  code?: number;
  body?: MeliItem;
}

export interface MeliPublication {
  id: string;
  title: string;
  price: number;
  currencyId: string;
  availableQuantity: number;
  soldQuantity: number;
  status: string;
  thumbnail: string;
  permalink: string;
  sellerSku: string | null;
  variationCount: number;
  listingTypeId: string;
  catalogListing: boolean;
  lastUpdated: string | null;
}

export interface MeliPublicationsResponse {
  connected: boolean;
  sellerId: number;
  status: string;
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
  results: MeliPublication[];
  error?: string;
}
