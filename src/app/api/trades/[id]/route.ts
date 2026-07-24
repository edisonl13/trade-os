import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trade = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, session.user.id)),
  });

  if (!trade) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  return NextResponse.json(trade);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, session.user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Allowed updatable fields
    const allowedFields = [
      "symbol", "direction", "entryPrice", "actualEntry", "actualExit",
      "stopLoss", "targetPrice", "positionSize", "pnl", "fees",
      "tradedAt", "closedAt", "strategy", "setup", "notes", "status",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // If closing a trade, update status
    if (body.pnl !== null || body.actualExit !== null) {
      updateData.status = "CLOSED";
    }

    updateData.updatedAt = Date.now();

    await db
      .update(trades)
      .set(updateData)
      .where(and(eq(trades.id, id), eq(trades.userId, session.user.id)));

    const updated = await db.query.trades.findFirst({
      where: eq(trades.id, id),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update trade error:", error);
    return NextResponse.json(
      { error: "Failed to update trade" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await db.query.trades.findFirst({
    where: and(eq(trades.id, id), eq(trades.userId, session.user.id)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Trade not found" }, { status: 404 });
  }

  await db
    .delete(trades)
    .where(and(eq(trades.id, id), eq(trades.userId, session.user.id)));

  return NextResponse.json({ success: true });
}
