import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MyWork } from "@/components/dashboard/my-work";
const { responses } = vi.hoisted(() => ({ responses: [] as { data: []; error: {message:string} | null; count?: number }[] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const result = responses.shift() ?? { data: [], error: null, count: 0 };
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "neq"]) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
} }) }));
beforeEach(() => { responses.length = 0; });
it("shows failed queries as unavailable instead of an empty summary", async () => {
  responses.push({ data: [], error: { message: "unavailable" } });
  const html = renderToStaticMarkup(await MyWork({userId:"user",role:"requester"}));
  expect(html).toContain("Some attention items could not be loaded");
  expect(html).not.toContain("No budget requests, liquidations, or reviews");
});
it("includes approvals and replenishments in the attention summary", async () => {
  const html = renderToStaticMarkup(await MyWork({userId:"user",role:"admin",approvalCount:2,replenishmentCount:3}));
  expect(html).toContain("2 vouchers to approve or review");
  expect(html).toContain("3 replenishments to review");
  expect(html).not.toContain("No budget requests, liquidations, or reviews");
});
it("uses scoped wording when the loaded summary is empty", async () => {
  const html = renderToStaticMarkup(await MyWork({userId:"user",role:"requester"}));
  expect(html).toContain("No budget requests, liquidations, or reviews in this summary.");
});
