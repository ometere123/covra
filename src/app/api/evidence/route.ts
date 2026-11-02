import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { walletSession } from "@/lib/auth";
import { database } from "@/lib/db";
import { evidenceBucket, privateStorage } from "@/lib/storage";
import { responseError } from "@/lib/http";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(["application/pdf", "text/plain", "application/json", "image/png", "image/jpeg"]);

export async function POST(request: NextRequest) {
  try {
    const wallet = await walletSession();
    if (!wallet) return NextResponse.json({ error: "Wallet authentication required" }, { status: 401 });
    const form = await request.formData();
    const claimId = z.string().uuid().parse(form.get("claimId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Evidence file required");
    if (file.size <= 0 || file.size > MAX_BYTES || !TYPES.has(file.type)) {
      throw new Error("Evidence must be PDF, JSON, text, PNG or JPG, no larger than 5 MB");
    }
    const sql = database();
    const rows = await sql`
      select id from claims where id=${claimId} and lower(claimant_wallet)=${wallet}
        and status not in ('CANCELLED','PAID','DENIED','EXPIRED') limit 1
    `;
    if (!rows.length) return NextResponse.json({ error: "Active claim not found or evidence window closed" }, { status: 404 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    const path = "claims/" + claimId + "/" + randomUUID();
    const store = privateStorage();
    const { error } = await store.storage.from(evidenceBucket()).upload(path, bytes, {
      contentType: file.type, cacheControl: "0", upsert: false,
    });
    if (error) throw new Error("Evidence upload failed: " + error.message);
    const saved = await sql`
      insert into evidence(claim_id,uploaded_by,storage_path,sha256_hex,content_type,byte_size)
      values(${claimId},${wallet},${path},${digest},${file.type},${file.size})
      returning id,sha256_hex,created_at
    `;
    await sql`insert into audit_events(actor_wallet,action,resource_id,payload_hash)
      values(${wallet},'EVIDENCE_UPLOADED',${claimId},${digest})`;
    return NextResponse.json({ evidence: saved[0], public: false, message: "Stored privately with a verifiable SHA-256 commitment." }, { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
