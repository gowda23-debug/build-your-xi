import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/require-user";
import {
  WORLD_AVAILABLE_EDITIONS,
} from "@/lib/world/editions";

export const dynamic =
  "force-dynamic";

export async function GET() {
  const {
    error: authError,
  } = await requireUser();

  if (authError) {
    return authError;
  }

  return NextResponse.json({
    editions:
      WORLD_AVAILABLE_EDITIONS,
  });
}