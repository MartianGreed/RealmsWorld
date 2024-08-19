import type { CollectionToken } from "@/types/ark";
import { createSearchParamsCache, parseAsStringLiteral } from "nuqs/server";

import type { ArkClient } from "./client";

export const collectionSortDirectionKey = "direction";
export const collectionSortDirectionsValues = ["asc", "desc"] as const;
export const collectionSortDirectionsParser = parseAsStringLiteral(
  collectionSortDirectionsValues,
).withDefault("asc");
export type CollectionSortDirection =
  (typeof collectionSortDirectionsValues)[number];

export const collectionSortByKey = "sort";
export const collectionSortByValues = ["price"] as const;
export const collectionSortByParser = parseAsStringLiteral(
  collectionSortByValues,
).withDefault("price");
export type CollectionSortBy = (typeof collectionSortByValues)[number];

export const collectionPageSearchParamsCache = createSearchParamsCache({
  [collectionSortDirectionKey]: collectionSortDirectionsParser,
  [collectionSortByKey]: collectionSortByParser,
});

interface CollectionTokensApiResponse {
  data: CollectionToken[];
  next_page: number | null;
  token_count: number;
}
interface GetCollectionTokensParams {
  client: ArkClient;
  collectionAddress: string;
  page?: number;
  itemsPerPage?: number;
  sortBy?: string;
  sortDirection?: string;
}

export async function getCollectionTokens({
  client,
  collectionAddress,
  page = 1,
  itemsPerPage = 50,
  sortBy = "price",
  sortDirection = "asc",
}: GetCollectionTokensParams): Promise<CollectionTokensApiResponse> {
  const queryParams = [
    `items_per_page=${itemsPerPage}`,
    `sort=${sortBy}`,
    `direction=${sortDirection}`,
    `page=${page}`,
  ];

  try {
    return await client.fetch(
      `/collections/${collectionAddress}/0x534e5f4d41494e/tokens?${queryParams.join("&")}`,
    );
  } catch (error) {
    console.error(error);
    return {
      data: [],
      next_page: null,
      token_count: 0,
    } as CollectionTokensApiResponse;
  }
}
