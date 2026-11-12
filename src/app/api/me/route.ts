import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { nombreUsuarioActual } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = await getToken({ req });

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: token.sub,
      name: (await nombreUsuarioActual(token.sub)) ?? token.name,
      email: token.email,
      roles: (token.roles as string[] | undefined) ?? [],
    },
  });
}
