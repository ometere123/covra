import { NextRequest, NextResponse } from "next/server";
import { verifyLogin } from "@/lib/auth";
import { responseError } from "@/lib/http";
import { z } from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = z.object({
      address: z.string(), message: z.string().min(30),
      signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    }).parse(await request.json());
    const user = await verifyLogin(body.address, body.message, body.signature as `0x${string}`, new URL(request.url).origin);
    return NextResponse.json(user);
  } catch (error) {
    return responseError(error, 401);
  }
}
