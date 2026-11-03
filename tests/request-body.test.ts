import { expect, it } from "vitest";
import { limitedBody } from "../src/lib/request-body";
it("accepts bounded UTF-8 JSON without a Content-Length header", async () => {
  const request = new Request("https://covra.example/mcp", { method: "POST", body: '{"message":"é"}' });
  expect(await limitedBody(request, 16)).toBe('{"message":"é"}');
});
it("rejects streamed overflow despite a missing or understated length and cancels the source", async () => {
  let cancelled = false;
  const body = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } });
  const request = new Request("https://covra.example/mcp", { method: "POST", body, duplex: "half", headers: { "content-length": "1" } } as RequestInit);
  await expect(limitedBody(request, 10)).rejects.toThrow(RangeError);
  expect(cancelled).toBe(true);
});
it("rejects invalid UTF-8 and malformed declared lengths", async () => {
  await expect(limitedBody(new Request("https://covra.example", { method: "POST", body: new Uint8Array([255]) }), 10)).rejects.toThrow();
  await expect(limitedBody(new Request("https://covra.example", { method: "POST", headers: { "content-length": "NaN" } }), 10)).rejects.toThrow(RangeError);
});
