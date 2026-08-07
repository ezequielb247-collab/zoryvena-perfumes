import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const STORE_URL = "https://zoryvena-perfumes.onrender.com";
const LOCAL_ORIGINS = new Set(["http://127.0.0.1:5500", "http://localhost:5500"]);
const ALLOWED_ORIGINS = new Set([STORE_URL, ...LOCAL_ORIGINS]);

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : STORE_URL,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function decodeClaims(token: string) {
  try {
    const part = token.split(".")[1] || "";
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(normalized));
  } catch {
    return {};
  }
}

async function tokenWorks(token: string) {
  try {
    const response = await fetch("https://api.mercadopago.com/v1/payment_methods", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json({ ok: true }, 200, origin);
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json({ error: "Origem não autorizada." }, 403, origin);

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Sessão administrativa obrigatória." }, 401, origin);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Configuração do servidor indisponível.");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão administrativa inválida." }, 401, origin);

    const claims = decodeClaims(token);
    if (claims?.aal !== "aal2") return json({ error: "Confirme o MFA antes de verificar a produção." }, 403, origin);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: adminUser, error: adminError } = await admin.from("admin_users").select("user_id,active").eq("user_id", userData.user.id).eq("active", true).maybeSingle();
    if (adminError || !adminUser) return json({ error: "Conta sem permissão administrativa." }, 403, origin);

    const publicKey = String(Deno.env.get("MERCADO_PAGO_PUBLIC_KEY_CARD_PRODUCTION") || "").trim();
    const pixToken = String(Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_PRODUCTION") || "").trim();
    const cardToken = String(Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN_CARD_PRODUCTION") || "").trim();
    const webhookSecret = String(Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_CARD") || Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET_PIX") || "").trim();

    const checks = {
      publicKeyPresent: Boolean(publicKey) && !publicKey.toUpperCase().startsWith("TEST-"),
      pixAccessTokenPresent: Boolean(pixToken) && !pixToken.toUpperCase().startsWith("TEST-"),
      cardAccessTokenPresent: Boolean(cardToken) && !cardToken.toUpperCase().startsWith("TEST-"),
      webhookSecretPresent: Boolean(webhookSecret),
      pixApiAuthenticated: false,
      cardApiAuthenticated: false,
    };

    if (checks.pixAccessTokenPresent) checks.pixApiAuthenticated = await tokenWorks(pixToken);
    if (checks.cardAccessTokenPresent) checks.cardApiAuthenticated = cardToken === pixToken ? checks.pixApiAuthenticated : await tokenWorks(cardToken);

    const credentialsReady = checks.publicKeyPresent && checks.pixAccessTokenPresent && checks.cardAccessTokenPresent && checks.pixApiAuthenticated && checks.cardApiAuthenticated;
    if (credentialsReady) {
      const { error: updateError } = await admin.from("store_settings").update({ payment_production_credentials_verified_at: new Date().toISOString() }).eq("id", 1);
      if (updateError) throw updateError;
    }

    return json({ ok: true, credentialsReady, webhookSecretPresent: checks.webhookSecretPresent, checks }, 200, origin);
  } catch (error) {
    console.error("mp-production-readiness failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível verificar o ambiente produtivo." }, 500, origin);
  }
});
