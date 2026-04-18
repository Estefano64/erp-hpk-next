import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function getAuditUser(req: NextRequest): Promise<string | null> {
  const token = await getToken({ req });
  if (!token) return null;
  return (token.name as string) ?? (token.email as string) ?? null;
}

export async function isAdmin(req: NextRequest): Promise<boolean> {
  const token = await getToken({ req });
  return token?.rol === "admin";
}
