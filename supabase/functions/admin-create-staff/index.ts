import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const VERSION = "DEPLOY_PROBE_2026_01_04";
const PROBE = "PROBE_ADMIN_CREATE_STAFF__2026-01-04__A";

console.log("[DEPLOY_PROBE]", VERSION);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: Record<string, unknown>) {
  const ok = typeof body.ok === "boolean" ? body.ok : status < 400;
  return new Response(JSON.stringify({ probe: PROBE, version: VERSION, ok, ...body }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const VALID_ACTIONS = ["upsert", "soft_delete", "hard_delete", "debug", "ensure_profile", "ping"] as const;
type Action = (typeof VALID_ACTIONS)[number];

function normalizeAction(raw: string): Action | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "ensure_profile" || v === "ensureprofile" || v === "ensure-profile") return "ensure_profile";
  if (v === "soft_delete" || v === "softdelete" || v === "soft-delete") return "soft_delete";
  if (v === "hard_delete" || v === "harddelete" || v === "hard-delete") return "hard_delete";
  if (v === "debug") return "debug";
  if (v === "ping") return "ping";
  if (v === "upsert") return "upsert";
  return null;
}

function toErr(e: unknown) {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack ?? null,
      code: (e as any)?.code ?? null,
      hint: (e as any)?.hint ?? null,
      details: (e as any)?.details ?? null,
    };
  }
  if (typeof e === "object" && e !== null) {
    return {
      name: (e as any)?.name ?? null,
      message: (e as any)?.message ?? String(e),
      stack: (e as any)?.stack ?? null,
      code: (e as any)?.code ?? null,
      hint: (e as any)?.hint ?? null,
      details: (e as any)?.details ?? null,
    };
  }
  return { name: null, message: String(e), stack: null, code: null, hint: null, details: null };
}

type DbErr = {
  code?: string;
  hint?: string;
  message?: string;
};

function isMissingColumn(err: DbErr | null | undefined) {
  return (err as any)?.code === "42703";
}

async function probeProfilesDeletedAt(adminClient: ReturnType<typeof createClient>) {
  try {
    const { error } = await adminClient.from("profiles").select("deleted_at").limit(1);
    if (error && isMissingColumn(error as any)) return { ok: true, has: false };
    if (error) return { ok: false, error };
    return { ok: true, has: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

Deno.serve(async (req: Request) => {
  try {
    console.log("[PROBE_BOOT]", PROBE, req.method, new Date().toISOString());
    if (req.method === "OPTIONS") {
      return json(200, { step: "OPTIONS", action: "options" });
    }
    if (req.method !== "POST") return json(405, { step: "METHOD_NOT_ALLOWED", error: "Method not allowed", action: null });

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return json(400, { step: "INVALID_JSON", error: "Invalid JSON", action: null });
    }

    if (String(body?.action ?? "").trim().toLowerCase() === "ping") {
      return json(200, { step: "PING", action: "ping" });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { step: "ENV_MISSING", error: "Missing Supabase env.", action: null });
    }

    const rawAuth =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";
    if (!rawAuth) return json(401, { step: "AUTH_HEADER_MISSING", error: "AUTH_HEADER_MISSING", action: null });

    const authHeader = rawAuth.startsWith("Bearer ") ? rawAuth : `Bearer ${rawAuth}`;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      const detail: Record<string, unknown> = { step: "JWT_INVALID", error: "JWT_INVALID", detail: userErr?.message ?? null, action: null };
      if (Deno.env.get("ENV") === "DEV") {
        detail.authHeaderPrefix = authHeader.slice(0, 10);
        detail.authHeaderLen = authHeader.length;
      }
      return json(401, detail);
    }

    const staffId = String(body?.staffId ?? "").trim();
    const displayName = String(body?.displayName ?? "").trim();
    const password = body?.password ? String(body.password) : "";
    const payloadWorkplaceId = body?.workplaceId ? String(body.workplaceId).trim() : "";
    const action = normalizeAction(body?.action);
    if (!action) {
      return json(400, { step: "INVALID_ACTION", action: body?.action ?? null, detail: "Unknown action" });
    }
    const effectiveAction = action;
    if (effectiveAction === "ping") {
      return json(200, { step: "PING", action: "ping" });
    }
    let adminProfile: { role: string; workplace_id: string } | null = null;

    const adminOnly = effectiveAction !== "ensure_profile" && effectiveAction !== "ping";
    if (adminOnly) {
      const { data: profile, error: profErr } = await adminClient
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

    if (!staffId && effectiveAction !== "debug" && effectiveAction !== "ensure_profile" && effectiveAction !== "ping") {
      return json(400, { step: "STAFF_ID_REQUIRED", error: "staffId is required", action: effectiveAction });
    }
    if (staffId === "admin") return json(400, { step: "ADMIN_PROTECTED", error: "admin is protected", action: effectiveAction });

    const loginEmail = `${staffId}@oracletour.local`;

    async function findStaffRow(staffIdValue: string) {
      const workplaceId = (payloadWorkplaceId || adminProfile?.workplace_id) ?? null;
      const fields = "staff_id, user_id, display_name, workplace_id";
      const byStaffId = await adminClient
        .from("staff_public")
        .select(fields)
        .eq("workplace_id", workplaceId)
        .eq("staff_id", staffIdValue)
        .maybeSingle();
      if (byStaffId.error && !isMissingColumn(byStaffId.error as any)) {
        return { row: null, error: byStaffId.error };
      }
      if (byStaffId.data) return { row: byStaffId.data ?? null, error: null };

      const byUserId = await adminClient
        .from("staff_public")
        .select(fields)
        .eq("workplace_id", workplaceId)
        .eq("user_id", staffIdValue)
        .maybeSingle();
      if (byUserId.error && !isMissingColumn(byUserId.error as any)) {
        return { row: null, error: byUserId.error };
      }
      if (byUserId.data) return { row: byUserId.data ?? null, error: null };

      const byDisplay = await adminClient
        .from("staff_public")
        .select(fields)
        .eq("workplace_id", workplaceId)
        .eq("display_name", staffIdValue)
        .maybeSingle();
      if (byDisplay.error && !isMissingColumn(byDisplay.error as any)) {
        return { row: null, error: byDisplay.error };
      }
      return { row: byDisplay.data ?? null, error: null };
    }

    if (effectiveAction === "debug") {
      try {
        const debug: Record<string, unknown> = { ok: false, action: effectiveAction, staffId, workplaceId: payloadWorkplaceId };
        const { row, error: staffErr } = await findStaffRow(staffId);
        if (staffErr) {
          debug.staffPublic = { ok: false, step: "STAFF_PUBLIC", detail: toErr(staffErr) };
        } else {
          debug.staffPublic = { ok: true, row };
        }

        const userId = row?.user_id ?? null;
        if (userId) {
        const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listErr) {
          debug.authUser = { ok: false, step: "LIST_USERS", detail: toErr(listErr) };
        } else {
          const user = usersData?.users?.find((u: any) => u.id === userId) ?? null;
            debug.authUser = { ok: true, userId, found: !!user, email: user?.email ?? null };
          }
        } else {
          debug.authUser = { ok: false, step: "AUTH_USER", detail: "NO_USER_ID" };
        }

        const { data: wrData, error: wrErr, count } = await adminClient
          .from("work_records")
          .select("id", { count: "exact", head: true })
          .eq("staff_user_id", userId ?? "__none__");
        if (wrErr) {
          debug.workRecords = { ok: false, step: "WORK_RECORDS", detail: toErr(wrErr) };
        } else {
          debug.workRecords = { ok: true, count: count ?? 0, sample: (wrData ?? [])[0] ?? null };
        }
        const deletedAtSchema = await probeProfilesDeletedAt(adminClient);
        if (!deletedAtSchema.ok) {
          debug.profiles = { ok: false, step: "PROFILES_DELETED_AT", detail: toErr(deletedAtSchema.error) };
        } else {
          debug.profiles = { ok: true, has_deleted_at: deletedAtSchema.has };
        }

        debug.ok = true;
        return json(200, { step: "DEBUG", action: effectiveAction, ...debug });
      } catch (e) {
        return json(200, { ok: false, step: "DEBUG_UNHANDLED", detail: toErr(e), action: effectiveAction, staffId, workplaceId: payloadWorkplaceId });
      }
    }

    if (effectiveAction === "ping") {
      return json(200, {
        step: "PING",
        action: "ping",
        received: {
          workplaceId: body?.workplaceId ?? null,
          staffId: body?.staffId ?? null,
        },
      });
    }

    if (effectiveAction === "soft_delete" || effectiveAction === "hard_delete") {
      if (!payloadWorkplaceId) {
        return json(400, {
          step: "WORKPLACE_ID_REQUIRED",
          detail: "WORKPLACE_ID_REQUIRED",
          receivedWorkplaceId: body?.workplaceId ?? null,
          action: effectiveAction,
          staffId,
        });
      }
      if (Deno.env.get("ENV") === "DEV") {
        console.log("[DEBUG_SOFT_DELETE]", { staffId, workplaceId: payloadWorkplaceId });
      }
      const { row, error: lookupErr } = await findStaffRow(staffId);
      if (lookupErr) {
        return json(500, {
          ok: false,
          step: "LOOKUP_STAFF_PUBLIC",
          detail: lookupErr.message,
          code: (lookupErr as any)?.code ?? null,
          hint: (lookupErr as any)?.hint ?? null,
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }
      if (!row) {
        return json(404, { ok: false, step: "RESOLVE_STAFF", detail: "STAFF_NOT_FOUND", action: effectiveAction, staffId, workplaceId: payloadWorkplaceId });
      }
      const userId = row.user_id ?? null;

      if (effectiveAction === "hard_delete") {
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
              code: (nullifyErr as any)?.code ?? null,
              hint: (nullifyErr as any)?.hint ?? null,
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
          .select("staff_id", { count: "exact" });
        if (deleteStaffErr) {
          return json(500, {
            ok: false,
            step: "HARD_DELETE_STAFF_PUBLIC",
            detail: deleteStaffErr.message,
            code: (deleteStaffErr as any)?.code ?? null,
            hint: (deleteStaffErr as any)?.hint ?? null,
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
            .select("id", { count: "exact" });
          if (profileDelErr && !isMissingColumn(profileDelErr as any)) {
            return json(500, {
              ok: false,
              step: "HARD_DELETE_PROFILE",
              detail: profileDelErr.message,
              code: (profileDelErr as any)?.code ?? null,
              hint: (profileDelErr as any)?.hint ?? null,
              action: effectiveAction,
              staffId,
              workplaceId: payloadWorkplaceId,
            });
          }
          profileDeleted = profileDelErr ? false : profileData ? profileData.length : 0;

          const { error: authDelErr } = await adminClient.auth.admin.deleteUser(userId);
          if (authDelErr) {
            return json(500, {
              ok: false,
              step: "HARD_DELETE_AUTH",
              detail: authDelErr.message,
              code: (authDelErr as any)?.code ?? null,
              hint: (authDelErr as any)?.hint ?? null,
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

      if (deletedAtSchema.ok && deletedAtSchema.has && userId) {
        const { error: profileErr } = await adminClient
          .from("profiles")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", userId);
        if (profileErr) {
          return json(500, {
            ok: false,
            step: "SOFT_DELETE_PROFILE",
            detail: profileErr.message,
            code: (profileErr as any)?.code ?? null,
            hint: (profileErr as any)?.hint ?? null,
            action: effectiveAction,
            staffId,
            workplaceId: payloadWorkplaceId,
          });
        }
      }

      const { data: before, error: selectErr } = await adminClient
        .from("staff_public")
        .select("staff_id, workplace_id, is_active, display_name")
        .eq("staff_id", staffId)
        .eq("workplace_id", payloadWorkplaceId)
        .maybeSingle();
      if (selectErr) {
        if (isMissingColumn(selectErr as any)) {
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
          step: "SOFT_DELETE_SELECT_FAILED",
          detail: selectErr.message,
          code: (selectErr as DbErr)?.code ?? null,
          hint: (selectErr as DbErr)?.hint ?? null,
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }

      const { data: updatedRows, error: staffErr } = await adminClient
        .from("staff_public")
        .update({ is_active: false })
        .eq("workplace_id", payloadWorkplaceId)
        .eq("staff_id", staffId)
        .select("staff_id, workplace_id, is_active");
      if (staffErr) {
        if (isMissingColumn(staffErr as any)) {
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
          step: "SOFT_DELETE_UPDATE_FAILED",
          detail: staffErr.message,
          code: (staffErr as DbErr)?.code ?? null,
          hint: (staffErr as DbErr)?.hint ?? null,
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }
      if (!updatedRows || updatedRows.length === 0) {
        return json(404, {
          ok: false,
          step: "SOFT_DELETE_UPDATE",
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
        if (afterSelectErr && isMissingColumn(afterSelectErr as any)) {
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
          step: "SOFT_DELETE_AFTER_SELECT_FAILED",
          detail: afterSelectErr?.message ?? "Row vanished after update",
          code: (afterSelectErr as DbErr)?.code ?? null,
          hint: (afterSelectErr as DbErr)?.hint ?? null,
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
        });
      }
      if (after.is_active !== false) {
        return json(500, {
          ok: false,
          step: "SOFT_DELETE_INCONSISTENT",
          detail: "Update did not set is_active=false",
          action: effectiveAction,
          staffId,
          workplaceId: payloadWorkplaceId,
          before,
          after,
        });
      }

      return json(200, {
        step: "SOFT_DELETE_DONE",
        action: effectiveAction,
        staffId,
        workplaceId: payloadWorkplaceId,
        userId,
        before,
        after,
      });
    }

    if (effectiveAction === "ensure_profile") {
      let staffRow = null as any;
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
          code: (staffErr as any)?.code ?? null,
          hint: (staffErr as any)?.hint ?? null,
          action: effectiveAction,
        });
      }
      staffRow = rowByUser ?? null;
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
            code: (staffIdErr as any)?.code ?? null,
            hint: (staffIdErr as any)?.hint ?? null,
            action: effectiveAction,
          });
        }
        staffRow = rowByStaffId ?? null;
      }
      if (!staffRow) {
        return json(404, {
          ok: false,
          step: "ENSURE_PROFILE_LOOKUP_STAFF_PUBLIC",
          detail: "STAFF_ROW_NOT_FOUND",
          action: effectiveAction,
        });
      }

      const profilePayload: Record<string, unknown> = {
        id: userData.user.id,
        role: "staff",
        workplace_id: staffRow.workplace_id,
        display_name: staffRow.display_name ?? staffRow.staff_id,
        staff_id: staffRow.staff_id,
      };
      const ensureRes = await adminClient.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (ensureRes.error && isMissingColumn(ensureRes.error as DbErr)) {
        delete profilePayload.staff_id;
        const retryRes = await adminClient.from("profiles").upsert(profilePayload, { onConflict: "id" });
        if (retryRes.error) {
          return json(500, {
            ok: false,
            step: "ENSURE_PROFILE_UPSERT",
            detail: retryRes.error.message,
            code: (retryRes.error as DbErr)?.code ?? null,
            hint: (retryRes.error as DbErr)?.hint ?? null,
            action: effectiveAction,
          });
        }
      } else if (ensureRes.error) {
        return json(500, {
          ok: false,
          step: "ENSURE_PROFILE_UPSERT",
          detail: ensureRes.error.message,
          code: (ensureRes.error as DbErr)?.code ?? null,
          hint: (ensureRes.error as DbErr)?.hint ?? null,
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

    const label = displayName || staffId;
    if (!payloadWorkplaceId) {
      return json(400, {
        step: "WORKPLACE_ID_REQUIRED",
        detail: "WORKPLACE_ID_REQUIRED",
        receivedWorkplaceId: body?.workplaceId ?? null,
        action: effectiveAction,
      });
    }

    const { row: existingRow, error: lookupErr } = await findStaffRow(staffId);
    if (lookupErr) {
      return json(500, {
        step: "LOOKUP_STAFF_PUBLIC",
        error: "STAFF_LOOKUP_FAILED",
        detail: lookupErr.message,
        code: (lookupErr as any)?.code ?? null,
        hint: (lookupErr as any)?.hint ?? null,
        action: effectiveAction,
      });
    }
    let userId = existingRow?.user_id ?? null;
    if (!userId) {
      if (!password) return json(400, { step: "PASSWORD_REQUIRED", error: "password is required", action: effectiveAction, staffId, workplaceId: payloadWorkplaceId });
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: loginEmail,
        password,
        email_confirm: true,
      });
      if (createErr || !created.user) {
        const code = (createErr as any)?.code ?? null;
        const msg = createErr?.message ?? "Failed to create user";
        const isExists =
          code === "user_already_exists" ||
          code === "email_exists" ||
          String(msg).toLowerCase().includes("already registered") ||
          String(msg).toLowerCase().includes("already exists");
        if (isExists) {
          const { data: usersData, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
          if (listErr) {
            return json(500, {
              step: "LIST_USERS",
              detail: listErr.message,
              code: (listErr as any)?.code ?? null,
              hint: (listErr as any)?.hint ?? null,
              action: effectiveAction,
            });
          }
          const user = usersData?.users?.find((u: any) => u.email === loginEmail) ?? null;
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
            hint: (createErr as any)?.hint ?? null,
            action: effectiveAction,
          });
        }
      } else {
        userId = created.user.id;
      }
    } else if (password) {
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, { password });
      if (updateErr) {
        return json(500, {
          step: "UPDATE_AUTH_USER_PASSWORD",
          detail: updateErr.message,
          code: (updateErr as any)?.code ?? null,
          hint: (updateErr as any)?.hint ?? null,
          action: effectiveAction,
        });
      }
    }

    const profilePayload: Record<string, unknown> = {
      id: userId,
      role: "staff",
      workplace_id: payloadWorkplaceId,
      staff_id: staffId,
      display_name: label,
    };
    const profileRes = await adminClient.from("profiles").upsert(profilePayload, { onConflict: "id" });
    if (profileRes.error && isMissingColumn(profileRes.error as DbErr)) {
      delete profilePayload.staff_id;
      const retryRes = await adminClient.from("profiles").upsert(profilePayload, { onConflict: "id" });
      if (retryRes.error) {
        return json(500, {
          step: "UPSERT_PROFILE",
          error: "UPSERT_PROFILE_FAILED",
          detail: retryRes.error.message,
          code: (retryRes.error as DbErr)?.code ?? null,
          hint: (retryRes.error as DbErr)?.hint ?? null,
          action: effectiveAction,
        });
      }
    } else if (profileRes.error) {
      return json(500, {
        step: "UPSERT_PROFILE",
        error: "UPSERT_PROFILE_FAILED",
        detail: profileRes.error.message,
        code: (profileRes.error as DbErr)?.code ?? null,
        hint: (profileRes.error as DbErr)?.hint ?? null,
        action: effectiveAction,
      });
    }

    const payload: Record<string, unknown> = {
      workplace_id: payloadWorkplaceId,
      staff_id: staffId,
      display_name: label,
      name: label,
      user_id: userId,
      is_active: true,
    };

    const { error: upsertErr } = await adminClient
      .from("staff_public")
      .upsert(payload, { onConflict: "workplace_id,staff_id" });
    if (upsertErr) {
      return json(500, {
        step: "UPSERT_STAFF_PUBLIC",
        detail: upsertErr.message,
        code: (upsertErr as any)?.code ?? null,
        hint: (upsertErr as any)?.hint ?? null,
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
        code: (verifyErr as any)?.code ?? null,
        hint: (verifyErr as any)?.hint ?? null,
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
