import type { ShopifyOrderSummary } from "./types";

const API_VERSION = "2025-01";

function getConfig() {
  const shop = process.env.SHOPIFY_SHOP; // e.g. "tagfit.myshopify.com"
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  if (!shop || !token) {
    throw new Error(
      "Missing SHOPIFY_SHOP or SHOPIFY_ADMIN_ACCESS_TOKEN environment variables",
    );
  }
  return { shop, token };
}

const ORDERS_QUERY = /* GraphQL */ `
  query Orders($cursor: String, $query: String) {
    orders(first: 100, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        createdAt
        displayFinancialStatus
        displayFulfillmentStatus
        tags
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        shippingAddress {
          city
        }
        fulfillments(first: 5) {
          createdAt
          trackingInfo {
            company
            number
          }
        }
      }
    }
  }
`;

interface OrdersQueryResponse {
  data: {
    orders: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: Array<{
        id: string;
        name: string;
        createdAt: string;
        displayFinancialStatus: string;
        displayFulfillmentStatus: string;
        tags: string[];
        totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
        shippingAddress: { city: string | null } | null;
        fulfillments: Array<{
          createdAt: string;
          trackingInfo: Array<{ company: string | null; number: string | null }>;
        }>;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

/**
 * Fetches orders created on/after `sinceISODate`, paginating through the whole result set.
 */
export async function fetchShopifyOrders(
  sinceISODate: string,
): Promise<ShopifyOrderSummary[]> {
  const { shop, token } = getConfig();
  const endpoint = `https://${shop}/admin/api/${API_VERSION}/graphql.json`;
  const query = `created_at:>='${sinceISODate}'`;

  const results: ShopifyOrderSummary[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const res: Response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query: ORDERS_QUERY, variables: { cursor, query } }),
    });

    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} ${await res.text()}`);
    }

    const json = (await res.json()) as OrdersQueryResponse;
    if (json.errors?.length) {
      throw new Error(`Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
    }

    for (const node of json.data.orders.nodes) {
      const fulfillment = node.fulfillments[node.fulfillments.length - 1];
      const trackingInfo = fulfillment?.trackingInfo?.[0];
      results.push({
        id: node.id,
        name: node.name,
        createdAt: node.createdAt,
        financialStatus: node.displayFinancialStatus,
        fulfillmentStatus: node.displayFulfillmentStatus,
        totalPrice: Number(node.totalPriceSet.shopMoney.amount),
        currencyCode: node.totalPriceSet.shopMoney.currencyCode,
        city: node.shippingAddress?.city ?? null,
        tags: node.tags,
        trackingCompany: trackingInfo?.company ?? null,
        trackingNumber: trackingInfo?.number ?? null,
        fulfillmentCreatedAt: fulfillment?.createdAt ?? null,
      });
    }

    hasNextPage = json.data.orders.pageInfo.hasNextPage;
    cursor = json.data.orders.pageInfo.endCursor;
  }

  return results;
}
