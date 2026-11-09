import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { extractCustodianReceipt } from "@/actions/custodian-receipts";
const { state, rpc, download } = vi.hoisted(() => ({
  state: { user: { id:"custodian", role:"custodian" } },
  rpc: vi.fn(), download: vi.fn(),
}));
vi.mock("@/lib/auth",()=>({getCurrentUser:async()=>state.user}));
vi.mock("@/lib/rate-limit",()=>({withinLimit:async()=>true}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({
  from:()=>({select:()=>({eq:()=>({single:async()=>({data:{id:"test",owner_id:"requester",status:"submitted",fund_id:"fund"},error:null})})})}),
  rpc,storage:{from:()=>({download})},
})}));
const id="91000000-0000-4000-8000-000000000001";
beforeEach(()=>{
  state.user={id:"custodian",role:"custodian"};
  vi.stubEnv("OPENAI_API_KEY","test-only-placeholder");
  rpc.mockImplementation(async name=>({data:name==="can_access_fund"?true:["CE - FUEL","NCE - OTHERS"],error:null}));
  download.mockResolvedValue({data:new Blob(["test-image"],{type:"image/jpeg"}),error:null});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
it("returns editable suggestions, keeps VAT out, and does not persist an approval",async()=>{
  const fetchMock=vi.fn(async()=>Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify({supplier:"Test supplier",tin:"",tag:"UNKNOWN",expense_date:"2026-11-09",plate:"ABC123",receipt_number:"100",amount:"500.00"})}]}]}));
  vi.stubGlobal("fetch",fetchMock);
  const result=await extractCustodianReceipt(id,`${id}/line/test.jpg`);
  expect(result.ok).toBe(true);
  if(result.ok)expect(result.suggestion).toMatchObject({supplier:"Test supplier",tag:"",tin:""});
  const request=JSON.parse((fetchMock.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);
  expect(request.store).toBe(false);
  expect(request.text.format.strict).toBe(true);
  expect(request.text.format.schema.properties).not.toHaveProperty("input_vat");
  expect(rpc.mock.calls.map(call=>call[0])).toEqual(["can_access_fund","list_custodian_tags"]);
});
it("refuses another liquidation's receipt path before downloading",async()=>{
  expect((await extractCustodianReceipt(id,"another-liquidation/file.jpg")).ok).toBe(false);
  expect(download).not.toHaveBeenCalled();
});
it("limits extraction to custodians and administrators",async()=>{
  state.user={id:"requester",role:"requester"};
  expect((await extractCustodianReceipt(id,`${id}/line/test.jpg`)).ok).toBe(false);
  expect(download).not.toHaveBeenCalled();
});
it("reports the missing provider connection",async()=>{
  vi.stubEnv("OPENAI_API_KEY","");
  const result=await extractCustodianReceipt(id,`${id}/line/test.jpg`);
  expect(result.ok).toBe(false);
  if(!result.ok)expect(result.error).toContain("API key");
});
