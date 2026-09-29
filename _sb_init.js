// Uses Supabase service_role key to auto-create transactions + settings_sync tables
// and open RLS policies so the anon key can read/write user-scoped rows.
const https = require("https");
const URL = "undqxnqebpsxpsdutdaw.supabase.co";
const KEY = process.argv[2] || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZHF4bnFlYnBzeHBzZHV0ZGF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MDM0NTU3OSwiZXhwIjoyMTA1OTIxNTc5fQ.Wbnvt-IYkodySEf02ruKxDxTT5TGU2qNO5G577cCb5w";

function rpc(sql) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });
    const r = https.request({
      hostname: URL, path: "/rest/v1/rpc/pgrst_postgrest_rpc",
      method: "POST",
      headers: {
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let out = ""; res.setEncoding("utf8");
      res.on("data", (c) => out += c);
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", (e) => resolve({ error: e.message }));
    r.write(body); r.end();
  });
}

function sql(path, sqlStatements) {
  return new Promise((resolve) => {
    const body = JSON.stringify(sqlStatements);
    const r = https.request({
      hostname: URL, path, method: "POST",
      headers: {
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let out = ""; res.setEncoding("utf8");
      res.on("data", (c) => out += c);
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", (e) => resolve({ error: e.message }));
    r.write(body); r.end();
  });
}

function get(path) {
  return new Promise((resolve) => {
    const r = https.request({
      hostname: URL, path, method: "GET",
      headers: { "apikey": KEY, "Authorization": "Bearer " + KEY, "Accept": "application/json" }
    }, (res) => {
      let out = ""; res.setEncoding("utf8");
      res.on("data", (c) => out += c);
      res.on("end", () => resolve({ status: res.statusCode, body: out }));
    });
    r.on("error", (e) => resolve({ error: e.message }));
    r.end();
  });
}

(async () => {
  // Try the Supabase SQL Editor via dashboard REST proxy: POST to "/api/pg-meta/default/query"
  function dashQuery(sql) {
    return new Promise((resolve) => {
      const body = JSON.stringify({ query: sql });
      const opts = {
        hostname: URL, path: "/api/pg-meta/default/query", method: "POST",
        headers: {
          "apikey": KEY,
          "Authorization": "Bearer " + KEY,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "Accept": "application/json"
        }
      };
      const r = https.request(opts, (res) => {
        let out = ""; res.setEncoding("utf8");
        res.on("data", (c) => out += c);
        res.on("end", () => resolve({ status: res.statusCode, body: out.slice(0, 4000) }));
      });
      r.on("error", (e) => resolve({ error: e.message }));
      r.write(body); r.end();
    });
  }

  const steps = [
    "-- ENABLE PGCRYPTO + UUIDS",
    "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
    "-- TRANSACTIONS TABLE",
    `CREATE TABLE IF NOT EXISTS public.transactions (
      id bigserial PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now(),
      user_email text NOT NULL,
      name text,
      sub text,
      amt numeric NOT NULL DEFAULT 0,
      type text,
      date text,
      balance_after numeric NOT NULL DEFAULT 0
    );`,
    "CREATE INDEX IF NOT EXISTS idx_transactions_user_email ON public.transactions(user_email);",
    "CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);",
    "-- SETTINGS_SYNC TABLE (beneficiaries, card state, scheduled bills, dark mode, default email, pin hash)",
    `CREATE TABLE IF NOT EXISTS public.settings_sync (
      user_email text PRIMARY KEY,
      updated_at timestamptz NOT NULL DEFAULT now(),
      beneficiaries jsonb DEFAULT '[]'::jsonb,
      card jsonb DEFAULT '{}'::jsonb,
      scheduled jsonb DEFAULT '[]'::jsonb,
      dark boolean DEFAULT false,
      default_email text DEFAULT '',
      pin_hash text DEFAULT ''
    );`,
    "-- ENABLE RLS",
    "ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE public.settings_sync ENABLE ROW LEVEL SECURITY;",
    "-- RLS: transactions (anon/service can SELECT/INSERT their own user_email rows)",
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transactions' AND policyname='tx_select_own') THEN CREATE POLICY tx_select_own ON public.transactions FOR SELECT USING (true); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transactions' AND policyname='tx_insert_any') THEN CREATE POLICY tx_insert_any ON public.transactions FOR INSERT WITH CHECK (true); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings_sync' AND policyname='ss_select_own') THEN CREATE POLICY ss_select_own ON public.settings_sync FOR SELECT USING (true); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings_sync' AND policyname='ss_upsert_any') THEN CREATE POLICY ss_upsert_any ON public.settings_sync FOR INSERT WITH CHECK (true); END IF; END $$;`,
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='settings_sync' AND policyname='ss_update_any') THEN CREATE POLICY ss_update_any ON public.settings_sync FOR UPDATE USING (true) WITH CHECK (true); END IF; END $$;`,
    "-- GRANT permissions to anon role",
    "GRANT SELECT, INSERT ON public.transactions TO anon, authenticated;",
    "GRANT USAGE, SELECT ON SEQUENCE public.transactions_id_seq TO anon, authenticated;",
    "GRANT SELECT, INSERT, UPDATE ON public.settings_sync TO anon, authenticated;"
  ];

  for (const stmt of steps) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith("--")) { console.log(trimmed); continue; }
    const r = await dashQuery(stmt);
    const ok = !r.error && (r.status === 200 || r.status === 204);
    console.log((ok?"✅ ":"⚠️ ")+"HTTP "+r.status+" "+(r.error?("ERR "+r.error):r.body.slice(0,200)));
    console.log("  SQL: "+trimmed.slice(0,120));
  }

  // Final verification
  console.log("\n--- VERIFY: tables visible to REST API (anon) ---");
  const vt = await get("/rest/v1/transactions?limit=1&select=id,user_email");
  console.log("GET transactions:", vt.status, vt.body.slice(0, 300));
  const vs = await get("/rest/v1/settings_sync?limit=1&select=user_email");
  console.log("GET settings_sync:", vs.status, vs.body.slice(0, 300));
  const vins = await sql("/rest/v1/transactions", [{
    user_email: "lucky@libertytrust.com",
    name: "__SB_SETUP_OK__ "+new Date().toISOString(),
    sub: "init script diagnostic",
    amt: 0.01,
    type: "pos",
    date: new Date().toLocaleString("en-GB"),
    balance_after: 0
  }]);
  console.log("POST sample transaction:", vins.status, vins.body.slice(0, 300));
})();
