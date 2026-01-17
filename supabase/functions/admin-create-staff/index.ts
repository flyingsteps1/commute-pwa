/// <reference lib="deno.ns" />
// supabase/functions/admin-create-staff/index.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          role: string | null;
          workplace_id: string | null;
          display_name: string | null;
          staff_id: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id: string;
          role?: string | null;
          workplace_id?: string | null;
          display_name?: string | null;
          staff_id?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          role?: string | null;
          workplace_id?: string | null;
          display_name?: string | null;
          staff_id?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [];
      };
      staff_public: {
        Row: {
          staff_id: string | null;
          user_id: string | null;
          display_name: string | null;
          workplace_id: string | null;
          is_active: boolean | null;
          name: string | null;
        };
        Insert: {
          workplace_id: string;
          staff_id: string;
          display_name?: string | null;
          name?: string | null;
          user_id?: string | null;
          is_active?: boolean | null;
        };
        Update: {
          display_name?: string | null;
          name?: string | null;
          user_id?: string | null;
          is_active?: boolean | null;
        };
        Relationships: [];
      };
      work_records: {
        Row: {
          id: string;
          staff_user_id: string | null;
        };
        Insert: Record<string, unknown>;
        Update: {
          staff_user_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, { Row: Record<string, unknown>; Relationships: [] }>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AnySupabaseClient = SupabaseClient<Database>;

type AdminCreateStaffRequestBase = {
  action?: string;
  staffId?: string;
  displayName?: string;
  workplaceId?: string;
  password?: string;
};

type AdminCreateStaffRequest =
  | (AdminCreateStaffRequestBase & { action: "upsert" })
  | (AdminCreateStaffRequestBase & { action: "soft_delete" })
  | (AdminCreateStaffRequestBase & { action: "restore" })
  | (AdminCreateStaffRequestBase & { action: "hard_delete" })
  | (AdminCreateStaffRequestBase & { action: "debug" })
  | (AdminCreateStaffRequestBase & { action: "ensure_profile" })
  | (AdminCreateStaffRequestBase & { action: "ping" })
  | AdminCreateStaffRequestBase;

type PostgrestErrorLike = {
  code?: string | null;
  hint?: string | null;
  message?: string | null;
  details?: string | null;
};

type StaffPublicRow = {
  staff_id: string | null;
  user_id: string | null;
  display_name: string | null;
  workplace_id: string | null;
};

type ProfilesInsert = Database["public"]["Tables"]["profiles"]["Insert"];
type StaffPublicInsert = Database["public"]["Tables"]["staff_public"]["Insert"];

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VERSION = "DEPLOY_PROBE_2026_01_04";
const PROBE = "PROBE_ADMIN_CREATE_STAFF__2026-01-04__A";

console.log("[DEPLOY_PROBE]", VERSION);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: Record<string, unknown>) {
  const ok = typeof body.ok === "boolean" ? body.ok : status < 400;
  return new Response(
    JSON.stringify({ probe: PROBE, version: VERSION, ok, ...body }),
    {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

const VALID_ACTIONS = [
  "upsert",
  "soft_delete",
  "restore",
  "hard_delete",
  "debug",
  "ensure_profile",
  "ping",
] as const;
type Action = (typeof VALID_ACTIONS)[number];

function normalizeAction(raw: unknown): Action | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (
    v === "ensure_profile" || v === "ensureprofile" || v === "ensure-profile"
  ) return "ensure_profile";
  if (v === "soft_delete" || v === "softdelete" || v === "soft-delete") {
    return "soft_delete";
  }
  if (v === "restore") return "restore";
  if (v === "hard_delete" || v === "harddelete" || v === "hard-delete") {
    return "hard_delete";
  }
  if (v === "debug") return "debug";
  if (v === "ping") return "ping";
  if (v === "upsert") return "upsert";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringProp(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const value = obj[key];
  return typeof value === "string" ? value : null;
}

function getErrorCode(err: unknown): string | null {
  return isRecord(err) ? getStringProp(err, "code") : null;
}

function getErrorHint(err: unknown): string | null {
  return isRecord(err) ? getStringProp(err, "hint") : null;
}

function getErrorMessage(err: unknown): string | null {
  return isRecord(err) ? getStringProp(err, "message") : null;
}

function getErrorDetails(err: unknown): string | null {
  return isRecord(err) ? getStringProp(err, "details") : null;
}

function toErr(e: unknown) {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack ?? null,
      code: getErrorCode(e),
      hint: getErrorHint(e),
      details: getErrorDetails(e),
    };
  }
  if (isRecord(e)) {
    return {
      name: getStringProp(e, "name"),
      message: getStringProp(e, "message") ?? String(e),
      stack: getStringProp(e, "stack"),
      code: getErrorCode(e),
      hint: getErrorHint(e),
      details: getErrorDetails(e),
    };
  }
  return {
    name: null,
    message: String(e),
    stack: null,
    code: null,
    hint: null,
    details: null,
  };
}

function isMissingColumn(err: unknown) {
  return getErrorCode(err) === "42703";
}

async function probeProfilesDeletedAt(adminClient: AnySupabaseClient) {
  try {
    const { error } = await adminClient.from("profiles").select("deleted_at")
      .limit(1);
    if (error && isMissingColumn(error)) return { ok: true, has: false };
    if (error) return { ok: false, error };
    return { ok: true, has: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function findStaffRow(
  adminClient: AnySupabaseClient,
  staffIdValue: string,
  workplaceId: string | null,
): Promise<{ row: StaffPublicRow | null; error: unknown | null }> {
  const fields = "staff_id, user_id, display_name, workplace_id";
  const workplaceIdFilter = workplaceId as string;
  const byStaffId = await adminClient
    .from("staff_public")
    .select(fields)
    .eq("workplace_id", workplaceIdFilter)
    .eq("staff_id", staffIdValue)
    .maybeSingle();

  if (byStaffId.error && !isMissingColumn(byStaffId.error)) {
    return { row: null, error: byStaffId.error };
  }
  if (byStaffId.data) {
    return { row: byStaffId.data as StaffPublicRow, error: null };
  }

  const byUserId = await adminClient
    .from("staff_public")
    .select(fields)
    .eq("workplace_id", workplaceIdFilter)
    .eq("user_id", staffIdValue)
    .maybeSingle();

  if (byUserId.error && !isMissingColumn(byUserId.error)) {
    return { row: null, error: byUserId.error };
  }
  if (byUserId.data) {
    return { row: byUserId.data as StaffPublicRow, error: null };
  }

  const byDisplay = await adminClient
    .from("staff_public")
    .select(fields)
    .eq("workplace_id", workplaceIdFilter)
    .eq("display_name", staffIdValue)
    .maybeSingle();

  if (byDisplay.error && !isMissingColumn(byDisplay.error)) {
    return { row: null, error: byDisplay.error };
  }
  return {
    row: (byDisplay.data as StaffPublicRow | null) ?? null,
    error: null,
  };
}

Deno.serve(async (req: Request) => {
  try {
    console.log("[PROBE_BOOT]", PROBE, req.method, new Date().toISOString());

    if (req.method === "OPTIONS") {
      return json(200, { step: "OPTIONS", action: "options" });
    }
    if (req.method !== "POST") {
      return json(405, {
        step: "METHOD_NOT_ALLOWED",
        error: "Method not allowed",
        action: null,
      });
    }

    let body: AdminCreateStaffRequest | null = null;
    try {
      body = (await req.json()) as AdminCreateStaffRequest;
    } catch {
      return json(400, {
        step: "INVALID_JSON",
        error: "Invalid JSON",
        action: null,
      });
    }

    // allow ping even without auth/env, to quickly verify deployment
    if (String(body?.action ?? "").trim().toLowerCase() === "ping") {
      return json(200, { step: "PING", action: "ping" });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return json(500, {
        step: "ENV_MISSING",
        error: "Missing Supabase env.",
        action: null,
      });
    }

    const rawAuth = req.headers.get("authorization") ??
      req.headers.get("Authorization") ?? "";
    if (!rawAuth) {
      return json(401, {
        step: "AUTH_MISSING",
        detail: "AUTH_HEADER_MISSING",
        action: null,
      });
    }

    const authHeader = rawAuth.startsWith("Bearer ")
      ? rawAuth
      : `Bearer ${rawAuth}`;

    const supabaseUser: AnySupabaseClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: authHeader } },
      },
    );
    const adminClient: AnySupabaseClient = supabaseUser;

    const { data: userData, error: userErr } = await supabaseUser.auth
      .getUser();
    if (userErr || !userData.user) {
      const detail: Record<string, unknown> = {
        step: "AUTH_INVALID",
        detail: userErr?.message ?? null,
        action: null,
      };
      if (Deno.env.get("ENV") === "DEV") {
        detail.authHeaderPrefix = authHeader.slice(0, 10);
        detail.authHeaderLen = authHeader.length;
      }
      return json(401, detail);
    }

    const staffId = String(body?.staffId ?? "").trim();
    const displayName = String(body?.displayName ?? "").trim();
    const password = body?.password ? String(body.password) : "";
    const payloadWorkplaceId = body?.workplaceId
      ? String(body.workplaceId).trim()
      : "";
    const action = normalizeAction(body?.action);
    if (!action) {
      return json(400, {
        step: "INVALID_ACTION",
        action: body?.action ?? null,
        detail: "Unknown action",
      });
    }

    const effectiveAction = action;

    let adminProfile: { role: string; workplace_id: string } | null = null;

    const adminOnly = effectiveAction !== "ensure_profile";
    if (adminOnly) {
      const { data: profile, error: profErr } = await supabaseUser
        .from("profiles")
        .select("role, workplace_id")
        .eq("id", userData.user.id)
        .maybeSingle();

      if (profErr || !profile) {
        return json(403, {
          step: "PROFILE_NOT_FOUND",
          detail: "No profile row",
          userId: userData.user.id,
          email: userData.user.email ?? null,
          action: effectiveAction,
        });
      }
      if (profile.role !== "admin") {
        return json(403, {
          step: "NOT_ADMIN",
          detail: "role is not admin",
          userId: userData.user.id,
          email: userData.user.email ?? null,
          role: profile.role,
          action: effectiveAction,
        });
      }
      adminProfile = profile as { role: string; workplace_id: string };
    }

    if (
      !staffId && effectiveAction !== "debug" &&
      effectiveAction !== "ensure_profile"
    ) {
      return json(400, {
        step: "STAFF_ID_REQUIRED",
        error: "staffId is required",
        action: effectiveAction,
      });
    }
    if (staffId === "admin") {
      return json(400, {
        step: "ADMIN_PROTECTED",
        error: "admin is protected",
        action: effectiveAction,
      });
    }

    const loginEmail = `${staffId}@oracletour.local`;
    const resolvedWorkplaceId =
      (payloadWorkplaceId || adminProfile?.workplace_id) ?? null;

    if (effectiveAction === "debug") {
      try {
        const debug: Record<string, unknown> = {
          ok: false,
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        };

        const { row, error: staffErr } = await findStaffRow(
          adminClient,
          staffId,
          resolvedWorkplaceId,
        );
        if (staffErr) {
          debug.staffPublic = {
            ok: false,
            step: "STAFF_PUBLIC",
            detail: toErr(staffErr),
          };
        } else {
          debug.staffPublic = { ok: true, row };
        }

        const userId = row?.user_id ?? null;

        // ✅ FIXED BRACES HERE
        if (userId) {
          const { data: usersData, error: listErr } = await adminClient.auth
            .admin.listUsers({
              page: 1,
              perPage: 1000,
            });

          if (listErr) {
            debug.authUser = {
              ok: false,
              step: "LIST_USERS",
              detail: toErr(listErr),
            };
          } else {
            const user = usersData?.users?.find((u) => u.id === userId) ?? null;
            debug.authUser = {
              ok: true,
              userId,
              found: !!user,
              email: user?.email ?? null,
            };
          }
        } else {
          debug.authUser = {
            ok: false,
            step: "AUTH_USER",
            detail: "NO_USER_ID",
          };
        }

        const workRecordCountOptions = { count: "exact", head: true } as const;
        const { data: wrData, error: wrErr, count } = await adminClient
          .from("work_records")
          .select("id", workRecordCountOptions)
          .eq("staff_user_id", userId ?? "__none__");

        if (wrErr) {
          debug.workRecords = {
            ok: false,
            step: "WORK_RECORDS",
            detail: toErr(wrErr),
          };
        } else {
          debug.workRecords = {
            ok: true,
            count: count ?? 0,
            sample: (wrData ?? [])[0] ?? null,
          };
        }

        const deletedAtSchema = await probeProfilesDeletedAt(adminClient);
        if (!deletedAtSchema.ok) {
          debug.profiles = {
            ok: false,
            step: "PROFILES_DELETED_AT",
            detail: toErr(deletedAtSchema.error),
          };
        } else {
          debug.profiles = { ok: true, has_deleted_at: deletedAtSchema.has };
        }

        debug.ok = true;
        return json(200, { step: "DEBUG", action: effectiveAction, ...debug });
      } catch (e) {
        return json(200, {
          ok: false,
          step: "DEBUG_UNHANDLED",
          detail: toErr(e),
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }
    }

    if (
      effectiveAction === "soft_delete" || effectiveAction === "hard_delete" ||
      effectiveAction === "restore"
    ) {
      if (!payloadWorkplaceId) {
        return json(400, {
          step: "WORKPLACE_ID_REQUIRED",
          detail: "WORKPLACE_ID_REQUIRED",
          receivedWorkplaceId: body?.workplaceId ?? null,
          action: effectiveAction,
          staffId,
        });
      }

      const { row, error: lookupErr } = await findStaffRow(
        adminClient,
        staffId,
        resolvedWorkplaceId,
      );
      if (lookupErr) {
        return json(500, {
          ok: false,
          step: "LOOKUP_STAFF_PUBLIC",
          detail: getErrorMessage(lookupErr) ?? String(lookupErr),
          code: getErrorCode(lookupErr),
          hint: getErrorHint(lookupErr),
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }
      if (!row) {
        return json(404, {
          ok: false,
          step: "RESOLVE_STAFF",
          detail: "STAFF_NOT_FOUND",
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      const userId = row.user_id ?? null;

      if (effectiveAction === "hard_delete") {
        if (Deno.env.get("ALLOW_HARD_DELETE") !== "true") {
          return json(403, {
            ok: false,
            step: "HARD_DELETE_DISABLED",
            error: "hard_delete_disabled",
            action: effectiveAction,
          });
        }

        let staffPublicDeleted: number | boolean = false;
        let profileDeleted: number | boolean = false;
        let authUserDeleted = false;

        if (userId) {
          const { error: nullifyErr } = await adminClient
            .from("work_records")
            .update({ staff_user_id: null })
            .eq("staff_user_id", userId);

          if (nullifyErr) {
            return json(500, {
              ok: false,
              step: "NULLIFY_WORK_RECORDS",
              detail: nullifyErr.message,
              code: getErrorCode(nullifyErr),
              hint: getErrorHint(nullifyErr),
              action: effectiveAction,
              staffId,
              workplaceId: payloadWorkplaceId,
            });
          }
        }

        const { data: deletedStaff, error: deleteStaffErr } = await adminClient
          .from("staff_public")
          .delete()
          .eq("workplace_id", payloadWorkplaceId)
          .eq("staff_id", staffId)
          .select("staff_id");

        if (deleteStaffErr) {
          return json(500, {
            ok: false,
            step: "HARD_DELETE_STAFF_PUBLIC",
            detail: deleteStaffErr.message,
            code: getErrorCode(deleteStaffErr),
            hint: getErrorHint(deleteStaffErr),
            action: effectiveAction,
            staffId,
            workplaceId: payloadWorkplaceId,
          });
        }
        staffPublicDeleted = deletedStaff ? deletedStaff.length : 0;

        if (userId) {
          const { data: profileData, error: profileDelErr } = await adminClient
            .from("profiles")
            .delete()
            .eq("id", userId)
            .select("id");

          if (profileDelErr && !isMissingColumn(profileDelErr)) {
            return json(500, {
              ok: false,
              step: "HARD_DELETE_PROFILE",
              detail: profileDelErr.message,
              code: getErrorCode(profileDelErr),
              hint: getErrorHint(profileDelErr),
              action: effectiveAction,
              staffId,
              workplaceId: payloadWorkplaceId,
            });
          }
          profileDeleted = profileDelErr
            ? false
            : profileData
            ? profileData.length
            : 0;

          const { error: authDelErr } = await adminClient.auth.admin.deleteUser(
            userId,
          );
          if (authDelErr) {
            return json(500, {
              ok: false,
              step: "HARD_DELETE_AUTH",
              detail: authDelErr.message,
              code: getErrorCode(authDelErr),
              hint: getErrorHint(authDelErr),
              action: effectiveAction,
              staffId,
              workplaceId: payloadWorkplaceId,
            });
          }
          authUserDeleted = true;
        }

        return json(200, {
          step: "HARD_DELETE_DONE",
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
          userId,
          staffPublicDeleted,
          profileDeleted,
          authUserDeleted,
        });
      }

      const deletedAtSchema = await probeProfilesDeletedAt(adminClient);
      if (!deletedAtSchema.ok) {
        return json(500, {
          ok: false,
          step: "CHECK_PROFILES_SCHEMA",
          detail: toErr(deletedAtSchema.error),
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }
      if (!deletedAtSchema.has) {
        return json(409, {
          ok: false,
          step: "PROFILES_DELETED_AT_MISSING",
          detail: "profiles.deleted_at column missing",
          todo: "Add deleted_at column to profiles to allow soft delete/restore.",
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      if (userId) {
        const deletedAtValue = effectiveAction === "restore"
          ? null
          : new Date().toISOString();
        const { error: profileErr } = await adminClient
          .from("profiles")
          .update({ deleted_at: deletedAtValue })
          .eq("id", userId);

        if (profileErr) {
          return json(500, {
            ok: false,
            step: effectiveAction === "restore"
              ? "RESTORE_PROFILE"
              : "SOFT_DELETE_PROFILE",
            detail: profileErr.message,
            code: getErrorCode(profileErr),
            hint: getErrorHint(profileErr),
            action: effectiveAction,
            staffId,
            workplaceId: payloadWorkplaceId,
          });
        }
      }

      const stepPrefix = effectiveAction === "restore" ? "RESTORE" : "SOFT_DELETE";
      const { data: before, error: selectErr } = await adminClient
        .from("staff_public")
        .select("staff_id, workplace_id, is_active, display_name")
        .eq("staff_id", staffId)
        .eq("workplace_id", payloadWorkplaceId)
        .maybeSingle();

      if (selectErr) {
        if (isMissingColumn(selectErr)) {
          return json(409, {
            ok: false,
            step: "MISSING_IS_ACTIVE",
            detail: "is_active column missing",
            action: effectiveAction,
            staffId,
            workplaceId: payloadWorkplaceId,
          });
        }
        return json(500, {
          ok: false,
          step: `${stepPrefix}_SELECT_FAILED`,
          detail: selectErr.message,
          code: getErrorCode(selectErr),
          hint: getErrorHint(selectErr),
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      const desiredIsActive = effectiveAction === "restore";
      const { data: updatedRows, error: staffErr2 } = await adminClient
        .from("staff_public")
        .update({ is_active: desiredIsActive })
        .eq("workplace_id", payloadWorkplaceId)
        .eq("staff_id", staffId)
        .select("staff_id, workplace_id, is_active");

      if (staffErr2) {
        if (isMissingColumn(staffErr2)) {
          return json(409, {
            ok: false,
            step: "MISSING_IS_ACTIVE",
            detail: "is_active column missing",
            action: effectiveAction,
            staffId,
            workplaceId: payloadWorkplaceId,
          });
        }
        return json(500, {
          ok: false,
          step: `${stepPrefix}_UPDATE_FAILED`,
          detail: staffErr2.message,
          code: getErrorCode(staffErr2),
          hint: getErrorHint(staffErr2),
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      if (!updatedRows || updatedRows.length === 0) {
        return json(404, {
          ok: false,
          step: `${stepPrefix}_UPDATE`,
          detail: "NO_ROWS_UPDATED",
          filter: { workplaceId: payloadWorkplaceId, staffId },
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      const { data: after, error: afterSelectErr } = await adminClient
        .from("staff_public")
        .select("staff_id, workplace_id, is_active, display_name")
        .eq("staff_id", staffId)
        .eq("workplace_id", payloadWorkplaceId)
        .maybeSingle();

      if (afterSelectErr || !after) {
        if (afterSelectErr && isMissingColumn(afterSelectErr)) {
          return json(409, {
            ok: false,
            step: "MISSING_IS_ACTIVE",
            detail: "is_active column missing",
            action: effectiveAction,
            staffId,
            workplaceId: payloadWorkplaceId,
          });
        }
        return json(500, {
          ok: false,
          step: `${stepPrefix}_AFTER_SELECT_FAILED`,
          detail: afterSelectErr?.message ?? "Row vanished after update",
          code: getErrorCode(afterSelectErr),
          hint: getErrorHint(afterSelectErr),
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      if (after.is_active !== desiredIsActive) {
        return json(500, {
          ok: false,
          step: `${stepPrefix}_INCONSISTENT`,
          detail: `Update did not set is_active=${desiredIsActive}`,
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
          before,
          after,
        });
      }

      return json(200, {
        step: `${stepPrefix}_DONE`,
        action: effectiveAction,
        staffId,
        workplaceId: payloadWorkplaceId,
        userId,
        before,
        after,
      });
    }

    if (effectiveAction === "ensure_profile") {
      let staffRow: StaffPublicRow | null = null;

      const { data: rowByUser, error: staffErr } = await adminClient
        .from("staff_public")
        .select("staff_id, user_id, workplace_id, display_name")
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (staffErr) {
        return json(500, {
          ok: false,
          step: "ENSURE_PROFILE_LOOKUP_STAFF_PUBLIC",
          detail: staffErr.message,
          code: getErrorCode(staffErr),
          hint: getErrorHint(staffErr),
          action: effectiveAction,
        });
      }

      staffRow = (rowByUser as StaffPublicRow | null) ?? null;

      if (!staffRow && staffId) {
        const { data: rowByStaffId, error: staffIdErr } = await adminClient
          .from("staff_public")
          .select("staff_id, user_id, workplace_id, display_name")
          .eq("staff_id", staffId)
          .maybeSingle();

        if (staffIdErr) {
          return json(500, {
            ok: false,
            step: "ENSURE_PROFILE_LOOKUP_STAFF_PUBLIC",
            detail: staffIdErr.message,
            code: getErrorCode(staffIdErr),
            hint: getErrorHint(staffIdErr),
            action: effectiveAction,
          });
        }

        staffRow = (rowByStaffId as StaffPublicRow | null) ?? null;
      }

      if (!staffRow) {
        return json(404, {
          ok: false,
          step: "ENSURE_PROFILE_LOOKUP_STAFF_PUBLIC",
          detail: "STAFF_ROW_NOT_FOUND",
          action: effectiveAction,
        });
      }

      const profilePayload: ProfilesInsert = {
        id: userData.user.id,
        role: "staff",
        workplace_id: staffRow.workplace_id,
        display_name: staffRow.display_name ?? staffRow.staff_id,
        staff_id: staffRow.staff_id,
      };

      const ensureRes = await adminClient.from("profiles").upsert(
        profilePayload,
        { onConflict: "id" },
      );

      if (ensureRes.error && isMissingColumn(ensureRes.error)) {
        delete profilePayload.staff_id;
        const retryRes = await adminClient.from("profiles").upsert(
          profilePayload,
          { onConflict: "id" },
        );
        if (retryRes.error) {
          return json(500, {
            ok: false,
            step: "ENSURE_PROFILE_UPSERT",
            detail: retryRes.error.message,
            code: getErrorCode(retryRes.error),
            hint: getErrorHint(retryRes.error),
            action: effectiveAction,
          });
        }
      } else if (ensureRes.error) {
        return json(500, {
          ok: false,
          step: "ENSURE_PROFILE_UPSERT",
          detail: ensureRes.error.message,
          code: getErrorCode(ensureRes.error),
          hint: getErrorHint(ensureRes.error),
          action: effectiveAction,
        });
      }

      return json(200, {
        ok: true,
        step: "ENSURE_PROFILE_OK",
        ensured: true,
        staffId: staffRow.staff_id,
        action: effectiveAction,
        workplaceId: staffRow.workplace_id,
      });
    }

    // upsert (create/update)
    const label = displayName || staffId;

    if (!payloadWorkplaceId) {
      return json(400, {
        step: "WORKPLACE_ID_REQUIRED",
        detail: "WORKPLACE_ID_REQUIRED",
        receivedWorkplaceId: body?.workplaceId ?? null,
        action: effectiveAction,
      });
    }

    const { row: existingRow, error: lookupErr } = await findStaffRow(
      adminClient,
      staffId,
      resolvedWorkplaceId,
    );
    if (lookupErr) {
      return json(500, {
        step: "LOOKUP_STAFF_PUBLIC",
        error: "STAFF_LOOKUP_FAILED",
        detail: getErrorMessage(lookupErr) ?? String(lookupErr),
        code: getErrorCode(lookupErr),
        hint: getErrorHint(lookupErr),
        action: effectiveAction,
      });
    }

    let userId = (existingRow as StaffPublicRow | null)?.user_id ?? null;

    if (!userId) {
      if (!password) {
        return json(400, {
          step: "PASSWORD_REQUIRED",
          error: "password is required",
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      const { data: created, error: createErr } = await adminClient.auth.admin
        .createUser({
          email: loginEmail,
          password,
          email_confirm: true,
        });

      if (createErr || !created.user) {
        const code = getErrorCode(createErr);
        const msg = createErr?.message ?? "Failed to create user";
        const isExists = code === "user_already_exists" ||
          code === "email_exists" ||
          String(msg).toLowerCase().includes("already registered") ||
          String(msg).toLowerCase().includes("already exists");

        if (isExists) {
          const { data: usersData, error: listErr } = await adminClient.auth
            .admin.listUsers({ page: 1, perPage: 1000 });
          if (listErr) {
            return json(500, {
              step: "LIST_USERS",
              detail: listErr.message,
              code: getErrorCode(listErr),
              hint: getErrorHint(listErr),
              action: effectiveAction,
            });
          }

          const user = usersData?.users?.find((u) => u.email === loginEmail) ??
            null;
          if (!user) {
            return json(500, {
              step: "CREATE_AUTH_USER",
              detail: "USER_EXISTS_BUT_NOT_FOUND",
              action: effectiveAction,
            });
          }
          userId = user.id;
        } else {
          return json(500, {
            step: "CREATE_AUTH_USER",
            detail: msg,
            code,
            hint: getErrorHint(createErr),
            action: effectiveAction,
          });
        }
      } else {
        userId = created.user.id;
      }
    } else if (password) {
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        userId,
        { password },
      );
      if (updateErr) {
        return json(500, {
          step: "UPDATE_AUTH_USER_PASSWORD",
          detail: updateErr.message,
          code: getErrorCode(updateErr),
          hint: getErrorHint(updateErr),
          action: effectiveAction,
        });
      }
    }

    // profile upsert
    const profilePayload: ProfilesInsert = {
      id: userId,
      role: "staff",
      workplace_id: payloadWorkplaceId,
      staff_id: staffId,
      display_name: label,
    };

    const profileRes = await adminClient.from("profiles").upsert(
      profilePayload,
      { onConflict: "id" },
    );

    if (profileRes.error && isMissingColumn(profileRes.error)) {
      delete profilePayload.staff_id;
      const retryRes = await adminClient.from("profiles").upsert(
        profilePayload,
        { onConflict: "id" },
      );
      if (retryRes.error) {
        return json(500, {
          step: "UPSERT_PROFILE",
          error: "UPSERT_PROFILE_FAILED",
          detail: retryRes.error.message,
          code: getErrorCode(retryRes.error),
          hint: getErrorHint(retryRes.error),
          action: effectiveAction,
        });
      }
    } else if (profileRes.error) {
      return json(500, {
        step: "UPSERT_PROFILE",
        error: "UPSERT_PROFILE_FAILED",
        detail: profileRes.error.message,
        code: getErrorCode(profileRes.error),
        hint: getErrorHint(profileRes.error),
        action: effectiveAction,
      });
    }

    // staff_public upsert
    const payload: StaffPublicInsert = {
      workplace_id: payloadWorkplaceId,
      staff_id: staffId,
      display_name: label,
      name: label,
      user_id: userId,
      is_active: true,
    };

    const { error: upsertErr } = await adminClient.from("staff_public").upsert(
      payload,
      { onConflict: "workplace_id,staff_id" },
    );

    if (upsertErr) {
      return json(500, {
        step: "UPSERT_STAFF_PUBLIC",
        detail: upsertErr.message,
        code: getErrorCode(upsertErr),
        hint: getErrorHint(upsertErr),
        action: effectiveAction,
      });
    }

    const { data: verifyRow, error: verifyErr } = await adminClient
      .from("staff_public")
      .select("staff_id, user_id, display_name, workplace_id")
      .eq("workplace_id", payloadWorkplaceId)
      .eq("staff_id", staffId)
      .maybeSingle();

    if (verifyErr || !verifyRow) {
      return json(500, {
        step: "UPSERT_STAFF_PUBLIC",
        detail: verifyErr?.message ?? "UPSERT_NOT_VISIBLE",
        code: getErrorCode(verifyErr),
        hint: getErrorHint(verifyErr),
        action: effectiveAction,
      });
    }

    return json(200, {
      step: "UPSERT_OK",
      action: effectiveAction,
      workplaceId: payloadWorkplaceId,
      staffId,
      userId,
      row: verifyRow,
      email: loginEmail,
    });
  } catch (e) {
    return json(500, { ok: false, step: "UNHANDLED", detail: toErr(e) });
  }
});
                                                                                                                                                                                