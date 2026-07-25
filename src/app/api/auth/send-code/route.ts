import { NextRequest, NextResponse } from "next/server";
import { sendVerificationCode } from "@/lib/auth";

/**
 * POST /api/auth/send-code
 *
 * Sends a one-time verification code to the given email.
 * Rate-limited: max 5 requests per email per 15 minutes.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = (body.email as string)?.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Valid email address is required" },
        { status: 400 }
      );
    }

    const result = await sendVerificationCode(email);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 429 }
      );
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    console.error("[Send Code Error]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
