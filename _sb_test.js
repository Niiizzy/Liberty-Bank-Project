// Quick Supabase connection + schema diagnostic (disposable, delete after use)
const https = require("https");
const URL = "qxnqebpsxpsdutdawvphl.supabase.co";
const KEY = process.argv[2] || "sb_publishable_s-vi6WcvA0dcErUmZbv-rg_cACcX1oH";
function req(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({
      hostname: URL, path, method,
      headers: {
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "Prefer": method === "GET" ? "count=exact" : "return=minimal",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let out = "";
      res.setEncoding("utf8");
      res.on("data", (c) => out += c);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: out }));
    });
    r.on("error", (e) => resolve({ error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}
function cut(x, n=500){return x? String(x).slice(0,n) : "(empty)"}
(async () => {
  console.log("== ANON KEY (length) ==", KEY.length, KEY.startsWith("eyJ") ? "looks JWT-like" : "DOES NOT LOOK LIKE A VALID SUPABASE ANON KEY");
  const r1 = await req("GET", "/rest/v1/transactions?limit=1&select=*");
  console.log("GET /rest/v1/transactions", r1.error?("ERR "+r1.error):r1.status, cut(r1.body));
  const r2 = await req("GET", "/rest/v1/");
  console.log("GET /rest/v1/ (schema list):", r2.error?("ERR "+r2.error):r2.status, cut(r2.body, 2000));
  const uid = "lucky@libertytrust.com";
  const r3 = await req("POST", "/rest/v1/transactions", [{
    user_email: uid, name:"__DIAGNOSTIC__ " + Date.now(), sub:"diagnostic insert", amt:0.01, type:"pos",
    date:new Date().toLocaleString("en-GB"), balance_after:0
  }]);
  console.log("POST insert (should be 201 if RLS allows + schema ok):", r3.error?("ERR "+r3.error):r3.status, cut(r3.body));
})();
