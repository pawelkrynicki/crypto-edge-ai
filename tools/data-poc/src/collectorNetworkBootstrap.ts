import { getDefaultResultOrder, setDefaultResultOrder } from "node:dns";

export const COLLECTOR_DNS_RESULT_ORDER = "ipv4first" as const;

/** Apply before constructing clients or issuing any live provider request. */
export function configureCollectorNetwork(): typeof COLLECTOR_DNS_RESULT_ORDER {
  setDefaultResultOrder(COLLECTOR_DNS_RESULT_ORDER);
  return COLLECTOR_DNS_RESULT_ORDER;
}

export function getCollectorDnsResultOrder(): ReturnType<typeof getDefaultResultOrder> {
  return getDefaultResultOrder();
}
