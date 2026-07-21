import assert from "node:assert/strict";
import { getDefaultResultOrder, setDefaultResultOrder } from "node:dns";
import { describe, it } from "node:test";
import {
  COLLECTOR_DNS_RESULT_ORDER,
  configureCollectorNetwork,
  getCollectorDnsResultOrder,
} from "../src/collectorNetworkBootstrap.js";

describe("collector network bootstrap", () => {
  it("applies IPv4-first DNS ordering before live collection", () => {
    const previous = getDefaultResultOrder();
    try {
      assert.equal(configureCollectorNetwork(), COLLECTOR_DNS_RESULT_ORDER);
      assert.equal(getCollectorDnsResultOrder(), "ipv4first");
    } finally {
      setDefaultResultOrder(previous);
    }
  });
});
