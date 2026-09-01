import { describe, expect, it } from "vitest";
import { queryParam } from "../netlify/functions/_shared/http";

const req = (url: string) => new Request(url);

/**
 * On the deployed edge the netlify.toml `:id` placeholders do not substitute,
 * so ids have to be recoverable from the path alone.
 */
describe("id resolution", () => {
  it("prefers a real query param", () => {
    expect(queryParam(req("https://x/.netlify/functions/groups?groupId=g1"), "groupId")).toBe("g1");
  });

  it("falls back to the path when the query param is absent", () => {
    expect(queryParam(req("https://x/api/groups/g1"), "groupId")).toBe("g1");
    expect(queryParam(req("https://x/api/groups/g1/expenses"), "groupId")).toBe("g1");
    expect(queryParam(req("https://x/api/groups/g1/balances"), "groupId")).toBe("g1");
  });

  it("ignores an unsubstituted placeholder", () => {
    expect(queryParam(req("https://x/api/groups/g1/expenses?groupId=:id"), "groupId")).toBe("g1");
  });

  it("resolves nested ids", () => {
    expect(queryParam(req("https://x/api/groups/g1/expenses/e9"), "expenseId")).toBe("e9");
    expect(queryParam(req("https://x/api/groups/g1/settlements/s3"), "settlementId")).toBe("s3");
  });

  it("does not confuse one section's id for another", () => {
    expect(queryParam(req("https://x/api/groups/g1/expenses/e9"), "settlementId")).toBeUndefined();
    expect(queryParam(req("https://x/api/groups/g1/balances"), "expenseId")).toBeUndefined();
  });

  it("returns undefined when there is nothing to find", () => {
    expect(queryParam(req("https://x/api/groups"), "groupId")).toBeUndefined();
    expect(queryParam(req("https://x/api/auth"), "groupId")).toBeUndefined();
  });
});
