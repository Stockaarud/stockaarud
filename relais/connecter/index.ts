// Stockaarud : bouton « Connecter Supabase ».
// Le CAARUD autorise Stockaarud sur son propre compte Supabase ; cette fonction crée alors sa base,
// lance le script d'installation, autorise les connexions par code et rend la clé publique à l'appli.
// Rien n'est gardé ensuite : l'autorisation est effacée dès que la base est prête (ou au bout de 30 minutes).
//
// Secrets à poser dans le projet du relais (Edge Functions > Secrets) :
//   SB_OAUTH_CLIENT_ID      identifiant de l'application OAuth « Stockaarud »
//   SB_OAUTH_CLIENT_SECRET  son secret (ne jamais le mettre dans l'appli ni dans le dépôt)
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const CLIENT_ID = Deno.env.get("SB_OAUTH_CLIENT_ID") ?? "0dab1e3b-2ad6-400c-bd61-cc7d37c7625a";
const CLIENT_SECRET = Deno.env.get("SB_OAUTH_CLIENT_SECRET") ?? "";
const API = Deno.env.get("SB_API") ?? "https://api.supabase.com";
const MOI = (Deno.env.get("CONNECTER_URL") ?? SB_URL.replace(/\/+$/, "") + "/functions/v1/connecter");
// Le script d'installation est pris à une version précise du dépôt, et son empreinte est vérifiée avant de le lancer :
// une modification du dépôt ne change pas ce qui est exécuté sur la base d'un CAARUD tant que ces deux lignes ne changent pas.
// (À chaque nouvelle version de supabase/setup.sql : mettre ici le commit et le SHA-256 du fichier, puis redéployer.)
const SCRIPT_COMMIT = "641190c1e5b73d3505195f346c4df4061caa6141";
const SCRIPT_SHA256 = Deno.env.get("SETUP_SQL_SHA256") ?? "4f406887e66abb987d83d1f8147052a75a6e6bde51623d36216df054abc411b7";
const SCRIPT = Deno.env.get("SETUP_SQL_URL") ?? "https://raw.githubusercontent.com/Stockaarud/stockaarud/" + SCRIPT_COMMIT + "/supabase/setup.sql";
// Seules ces adresses peuvent lancer une connexion et en recevoir le résultat.
const RETOURS = (Deno.env.get("RETOURS") ?? "https://stockaarud.github.io/stockaarud/").split(",").map((s) => s.trim()).filter(Boolean);
const NOM = "stockaarud", REGION = "eu-west-3";
const DUREE_MIN = 30;
// Au-delà de ce nombre de départs en 10 minutes (tous CAARUD confondus), le relais refuse les suivants.
const MAX_DEPARTS_10MIN = Number(Deno.env.get("MAX_DEPARTS_10MIN") ?? "100");
// ... et un même appareil (même adresse réseau) n'en lance pas plus de 5 : il ne peut pas bloquer les autres.
const MAX_DEPARTS_IP_10MIN = 5;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
const vers = (u: string) => new Response(null, { status: 302, headers: { location: u, "cache-control": "no-store" } });

const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const alea = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const sha = async (s: string) => await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));

// L'autorisation est chiffrée avec le jeton que seul le navigateur du CAARUD détient :
// la table du relais, seule, ne permet pas de s'en servir.
async function cle(jeton: string) {
  return await crypto.subtle.importKey("raw", await sha(jeton + "|" + CLIENT_SECRET), "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function chiffrer(jeton: string, clair: string) {
  const iv = alea(12);
  const c = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cle(jeton), new TextEncoder().encode(clair));
  return b64u(iv) + "." + b64u(c);
}
async function dechiffrer(jeton: string, t: string) {
  const d = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const [iv, c] = t.split(".");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: d(iv) }, await cle(jeton), d(c)));
}

function retourOk(u: string) {
  return RETOURS.find((r) => u === r || u === r.replace(/\/$/, "") || u === r + "index.html") ? u : "";
}

async function mgmt(tok: string, path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { authorization: "Bearer " + tok, "content-type": "application/json", ...(init.headers || {}) } });
  const t = await r.text();
  let j: any = null;
  try { j = t ? JSON.parse(t) : null; } catch (_) { j = null; }
  return { ok: r.ok, status: r.status, j, t };
}
const msgDe = (x: { j: any; t: string }) => String((x.j && (x.j.message || x.j.error || x.j.msg)) || x.t || "").slice(0, 300);

type Ligne = { id: string; etat: string; verifier: string | null; retour: string | null; jeton: string | null; ref: string | null; cle: string | null; lien: string | null; essais: number; reprise: boolean; cree_at: string };
// Secret de l'appareil : l'appli le garde de son côté et doit le redonner pour avancer.
// Un lien de retour ouvert sur un autre appareil ne sert donc à rien.
const lienOk = (s: string) => /^[a-f0-9]{32,64}$/.test(s);

async function menage() {
  await sb.from("connexions").delete().lt("cree_at", new Date(Date.now() - DUREE_MIN * 60000).toISOString());
  // une installation terminée n'est gardée que 5 minutes, le temps que l'appli lise le résultat
  await sb.from("connexions").delete().in("etat", ["fini", "echec"]).lt("maj_at", new Date(Date.now() - 5 * 60000).toISOString());
}
// Empreinte de l'adresse réseau de l'appelant : sert à compter, l'adresse elle-même n'est pas gardée.
async function empreinteIp(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  return ip ? hex(await sha("ip|" + ip + "|" + CLIENT_SECRET)).slice(0, 32) : "";
}
async function maj(id: string, v: Record<string, unknown>) {
  await sb.from("connexions").update({ ...v, maj_at: new Date().toISOString() }).eq("id", id);
}

/* 1. Départ : on envoie le navigateur vers l'écran d'autorisation de Supabase. */
async function depart(url: URL, req: Request) {
  const retour = retourOk(url.searchParams.get("retour") || RETOURS[0]);
  if (!retour) return json({ erreur: "retour" }, 400);
  const lien = (url.searchParams.get("lien") || "").toLowerCase();
  if (!lienOk(lien)) return vers(retour + "#connecter-erreur-appli");
  if (!CLIENT_SECRET) return vers(retour + "#connecter-erreur-config");
  await menage();
  const { count } = await sb.from("connexions").select("id", { count: "exact", head: true }).like("id", "d:%").gt("cree_at", new Date(Date.now() - 600000).toISOString());
  if ((count ?? 0) >= MAX_DEPARTS_10MIN) return vers(retour + "#connecter-erreur-occupe");
  const ip = await empreinteIp(req);
  if (ip) {
    const { count: n } = await sb.from("connexions").select("id", { count: "exact", head: true }).like("id", "d:%").eq("ip", ip).gt("cree_at", new Date(Date.now() - 600000).toISOString());
    if ((n ?? 0) >= MAX_DEPARTS_IP_10MIN) return vers(retour + "#connecter-erreur-occupe");
  }
  const etat = hex(alea(24)), verifier = b64u(alea(48));
  const { error } = await sb.from("connexions").insert({ id: "d:" + etat, etat: "attente", verifier, retour, lien: hex(await sha(lien)), ip: ip || null });
  if (error) return vers(retour + "#connecter-erreur-relais");
  const q = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: MOI, response_type: "code", state: etat, code_challenge: b64u(await sha(verifier)), code_challenge_method: "S256" });
  return vers(API + "/v1/oauth/authorize?" + q.toString());
}

/* 2. Retour de Supabase : on échange le code contre l'autorisation, puis on renvoie vers l'appli
      avec un jeton neuf (celui du départ n'est plus valable). */
async function retourSupabase(url: URL) {
  const etat = (url.searchParams.get("state") || "").replace(/[^a-f0-9]/g, "");
  const { data: l } = await sb.from("connexions").select("*").eq("id", "d:" + etat).maybeSingle();
  if (!l || l.etat !== "attente") return json({ erreur: "Cette demande de connexion a expiré : relance-la depuis l'appli." }, 400);
  await sb.from("connexions").delete().eq("id", l.id);
  const retour = retourOk(l.retour || "") || RETOURS[0];
  const code = url.searchParams.get("code") || "";
  if (!code) return vers(retour + "#connecter-erreur-refus");
  const r = await fetch(API + "/v1/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", authorization: "Basic " + btoa(CLIENT_ID + ":" + CLIENT_SECRET) },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: MOI, code_verifier: l.verifier || "" }),
  });
  let j: any = null;
  try { j = await r.json(); } catch (_) { j = null; }
  if (!r.ok || !j || !j.access_token) { console.error("echange", r.status, JSON.stringify(j).slice(0, 200)); return vers(retour + "#connecter-erreur-echange"); }
  const jeton = hex(alea(32));
  const { error } = await sb.from("connexions").insert({ id: hex(await sha(jeton)), etat: "autorise", jeton: await chiffrer(jeton, j.access_token), retour, lien: l.lien });
  if (error) return vers(retour + "#connecter-erreur-relais");
  return vers(retour + "#connecter-" + jeton);
}

/* 3. L'appli appelle « avance » toutes les quelques secondes : chaque appel fait un pas. */
async function avance(jeton: string, lien: string) {
  if (!/^[a-f0-9]{64}$/.test(jeton)) return json({ erreur: "jeton" }, 400);
  await menage();
  const id = hex(await sha(jeton));
  const { data } = await sb.from("connexions").select("*").eq("id", id).maybeSingle();
  const l = data as Ligne | null;
  if (!l || Date.now() - new Date(l.cree_at).getTime() > DUREE_MIN * 60000) return json({ etape: "expire", erreur: "Cette connexion a expiré : relance-la." });
  // Même réponse qu'un jeton inconnu : on ne dit pas à un tiers que le jeton existe.
  if (!lienOk(lien) || !l.lien || hex(await sha(lien)) !== l.lien) return json({ etape: "expire", erreur: "Ce lien d'installation n'a pas été lancé depuis cet appareil : rien n'a été branché. Relance « Connecter Supabase » ici." });
  if (l.etat === "fini") return json({ etape: "fini", ref: l.ref, cle: l.cle, reprise: l.reprise });
  if (l.etat === "echec") return json({ etape: "echec", erreur: l.cle || "L'installation n'a pas abouti." });
  let tok = "";
  try { tok = await dechiffrer(jeton, l.jeton || ""); } catch (_) { return json({ etape: "expire", erreur: "Cette connexion a expiré : relance-la." }); }
  const echec = async (m: string) => { await maj(id, { etat: "echec", cle: m, jeton: null }); return json({ etape: "echec", erreur: m }); };
  const perdu = (x: { status: number }) => x.status === 401;
  const fin = Date.now() + 20000;
  let etat = l.etat, ref = l.ref || "", essais = l.essais || 0, reprise = !!l.reprise;

  while (Date.now() < fin) {
    if (etat === "autorise") {
      const o = await mgmt(tok, "/v1/organizations");
      if (perdu(o)) return echec("Supabase a refusé l'autorisation : relance la connexion.");
      const org = Array.isArray(o.j) && o.j[0];
      if (!org) return echec("Aucune organisation Supabase n'a été autorisée : relance la connexion et choisis-en une.");
      const p = await mgmt(tok, "/v1/projects");
      const deja = Array.isArray(p.j) ? p.j.find((x: any) => String(x.name || "").trim().toLowerCase() === NOM && !["REMOVED", "GOING_DOWN", "INIT_FAILED", "INACTIVE", "PAUSING", "PAUSE_FAILED"].includes(x.status)) : null;
      if (deja) { ref = deja.ref || deja.id; reprise = true; }
      else {
        const corps: Record<string, unknown> = { name: NOM, organization_slug: org.slug || org.id, db_pass: b64u(alea(24)), region_selection: { type: "specific", code: REGION } };
        let c = await mgmt(tok, "/v1/projects", { method: "POST", body: JSON.stringify(corps) });
        if (c.status === 400) { // ancien format de l'API
          delete corps.region_selection;
          c = await mgmt(tok, "/v1/projects", { method: "POST", body: JSON.stringify({ ...corps, organization_id: org.id, region: REGION }) });
        }
        if (!c.ok || !c.j) {
          const m = msgDe(c);
          console.error("creation", c.status, m);
          if (/limit|maximum|free project|2 (active )?(free )?projects/i.test(m) || c.status === 402) return echec("Ce compte Supabase a déjà ses 2 projets gratuits. Mets-en un en pause ou supprime-le dans Supabase, puis relance la connexion.");
          return echec("Supabase n'a pas pu créer la base (" + (m || c.status) + ").");
        }
        ref = c.j.ref || c.j.id;
      }
      etat = "creation"; await maj(id, { etat, ref, reprise });
      continue;
    }
    if (etat === "creation") {
      const p = await mgmt(tok, "/v1/projects/" + ref);
      if (perdu(p)) return echec("Supabase a refusé l'autorisation : relance la connexion.");
      const s = p.j && p.j.status;
      if (s === "ACTIVE_HEALTHY") { etat = "script"; essais = 0; await maj(id, { etat, essais }); continue; }
      if (s === "INIT_FAILED" || s === "REMOVED") return echec("Supabase n'a pas réussi à démarrer la base. Relance la connexion dans quelques minutes.");
      return json({ etape: "creation" });
    }
    if (etat === "script") {
      const s = await fetch(SCRIPT, { headers: { "cache-control": "no-cache" } });
      const sql = s.ok ? await s.text() : "";
      if (!/premiere_installation/.test(sql)) return echec("Le script d'installation est introuvable. Réessaie plus tard, ou installe à la main.");
      if (SCRIPT_SHA256 && hex(await sha(sql)) !== SCRIPT_SHA256) { console.error("script: empreinte inattendue"); return echec("Le script d'installation ne correspond pas à la version attendue. Rien n'a été lancé : installe à la main, ou réessaie plus tard."); }
      const q = await mgmt(tok, "/v1/projects/" + ref + "/database/query", { method: "POST", body: JSON.stringify({ query: sql }) });
      if (!q.ok) {
        essais++;
        console.error("script", q.status, msgDe(q));
        // Une base toute neuve refuse parfois les premières requêtes : on réessaie un moment.
        if (essais < 8 && (q.status >= 500 || q.status === 408 || q.status === 429 || /connect|timeout|not ready|starting/i.test(msgDe(q)))) { await maj(id, { essais }); return json({ etape: "script" }); }
        return echec("Le script d'installation a échoué (" + (msgDe(q) || q.status) + ").");
      }
      etat = "reglage"; essais = 0; await maj(id, { etat, essais });
      continue;
    }
    if (etat === "reglage") {
      const a = await mgmt(tok, "/v1/projects/" + ref + "/config/auth", { method: "PATCH", body: JSON.stringify({ external_anonymous_users_enabled: true }) });
      if (!a.ok) {
        essais++;
        console.error("reglage", a.status, msgDe(a));
        if (essais < 6 && a.status !== 401 && a.status !== 403) { await maj(id, { essais }); return json({ etape: "reglage" }); }
        return echec("Impossible d'autoriser les connexions par code (" + (msgDe(a) || a.status) + ").");
      }
      etat = "cles"; essais = 0; await maj(id, { etat, essais });
      continue;
    }
    if (etat === "cles") {
      const k = await mgmt(tok, "/v1/projects/" + ref + "/api-keys?reveal=true");
      const L = Array.isArray(k.j) ? k.j : [];
      // Uniquement une clé publique : jamais la clé secrète ni service_role.
      const pub = L.find((x: any) => x.type === "publishable" && x.api_key) || L.find((x: any) => x.name === "anon" && x.api_key && x.type !== "secret");
      if (!pub) {
        essais++;
        console.error("cles", k.status, msgDe(k));
        if (essais < 6 && k.status !== 401 && k.status !== 403) { await maj(id, { essais }); return json({ etape: "cles" }); }
        return echec("La base est prête, mais sa clé publique n'a pas pu être lue. Termine à la main : étape 3 de l'installation.");
      }
      await maj(id, { etat: "fini", cle: pub.api_key, jeton: null });
      // la base est désormais reconnue par le relais d'alertes
      await sb.from("bases_connues").upsert({ ref, source: "connecter" }, { onConflict: "ref", ignoreDuplicates: true });
      return json({ etape: "fini", ref, cle: pub.api_key, reprise });
    }
    return echec("État inconnu.");
  }
  return json({ etape: etat });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      if (url.searchParams.has("state") || url.searchParams.has("code") || url.searchParams.has("error")) return await retourSupabase(url);
      if (url.searchParams.has("sante")) return json({ ok: true, id: !!CLIENT_ID, secret: !!CLIENT_SECRET, retour: MOI });
      return await depart(url, req);
    }
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.action === "avance") return await avance(String(b.jeton || ""), String(b.lien || "").toLowerCase());
      return json({ erreur: "action" }, 400);
    }
    return json({ erreur: "methode" }, 405);
  } catch (e) {
    console.error("connecter", e);
    return json({ etape: "relais", erreur: "Le relais a rencontré une erreur. Réessaie dans un instant." }, 500);
  }
});
