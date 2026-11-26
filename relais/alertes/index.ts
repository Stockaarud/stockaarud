// Relais d'alertes Stockaarud.
// L'appli d'un CAARUD lui envoie des chiffres (produit en rupture, jours de stock restants) ;
// il en fait un e-mail et le confie à Brevo. Il n'écrit qu'aux adresses qui ont confirmé leur inscription.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const sb = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const BREVO_KEY = Deno.env.get("BREVO_KEY") ?? "";
const FROM = Deno.env.get("BREVO_FROM") ?? "";
const SELF = SB_URL + "/functions/v1/alertes";
const APP = "https://stockaarud.github.io/stockaarud/";
const PAGE = "https://stockaarud.github.io/alertes.html";

const MAX_PAR_ADRESSE_JOUR = 20;   // alertes par adresse et par jour
const MAX_TOTAL_JOUR = 270;        // sous le plafond gratuit de Brevo (300 par jour)
const MAX_CONFIRMATIONS_JOUR = 60; // mails de confirmation par jour, toutes adresses confondues
const DELAI_CONFIRMATION_H = 6;    // pas plus d'un mail de confirmation par adresse toutes les 6 h
const MAX_PAR_BASE_JOUR = 80;      // alertes par CAARUD et par jour : un abus ne bloque pas les autres CAARUD
const MAX_CONF_PAR_BASE_JOUR = 15; // mails de confirmation par CAARUD et par jour

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, x-stk-base",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
// texte libre venu de l'appli : court, sur une ligne, sans adresse web (le relais ne doit pas servir à envoyer des liens)
const propre = (s: unknown, n = 80) =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/(https?:\/\/|www\.)\S+/gi, "").replace(/\s+/g, " ").trim().slice(0, n);
const cleOk = (s: unknown, n = 60) => String(s ?? "").replace(/[^a-zA-Z0-9_.:-]/g, "").slice(0, n);
const mailOk = (s: unknown) => {
  const e = String(s ?? "").trim().toLowerCase();
  return e.length <= 120 && /^[^@\s<>"',;]+@[^@\s<>"',;]+\.[a-z]{2,}$/.test(e) ? e : "";
};
const mails = (l: unknown) => [...new Set((Array.isArray(l) ? l : []).map(mailOk).filter(Boolean))].slice(0, 5);
const jour = (t: unknown) => {
  const d = new Date(Number(t) || Date.now());
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
};
const depuis = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const token = () => crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);

// Qui parle ? L'appli joint la session de la personne connectée à sa base Stockaarud.
// Le relais demande à cette base quel est son rôle : sans session valable d'un membre, rien ne part.
const ROLE_CACHE = new Map<string, { role: string; at: number }>();
async function appelant(req: Request, b: any): Promise<{ ref: string; role: string } | null> {
  const ref = cleOk(b?.ref, 40), key = req.headers.get("apikey") ?? "", auth = req.headers.get("authorization") ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref) || !key || !/^Bearer [A-Za-z0-9._-]{20,}$/.test(auth)) return null;
  const ck = ref + "|" + auth.slice(-40), c = ROLE_CACHE.get(ck);
  if (c && Date.now() - c.at < 5 * 60e3) return { ref, role: c.role };
  try {
    const r = await fetch(`https://${ref}.supabase.co/rest/v1/rpc/mon_role`, {
      method: "POST", headers: { apikey: key, authorization: auth, "content-type": "application/json" }, body: "{}",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const role = await r.json();
    if (role !== "coordo" && role !== "equipe") return null;
    if (ROLE_CACHE.size > 500) ROLE_CACHE.clear();
    ROLE_CACHE.set(ck, { role, at: Date.now() });
    return { ref, role };
  } catch (_) { return null; }
}
// Les adresses rattachées à ce CAARUD : un CAARUD n'écrit qu'aux adresses qu'il a lui-même inscrites.
async function rattachees(ref: string, dest: string[], prendre = false) {
  if (!dest.length) return [] as string[];
  const { data } = await sb.from("abonnes_bases").select("email").eq("ref", ref).in("email", dest);
  const ok = new Set((data ?? []).map((x: any) => x.email));
  // adresses inscrites avant ce contrôle (sans rattachement) : le premier CAARUD qui les utilise les garde
  const libres = dest.filter((e) => !ok.has(e));
  if (prendre && libres.length) {
    const { data: prises } = await sb.from("abonnes_bases").select("email").in("email", libres);
    const pris = new Set((prises ?? []).map((x: any) => x.email));
    const aPrendre = libres.filter((e) => !pris.has(e));
    if (aPrendre.length) {
      await sb.from("abonnes_bases").upsert(aPrendre.map((email) => ({ email, ref })), { onConflict: "email,ref", ignoreDuplicates: true });
      aPrendre.forEach((e) => ok.add(e));
    }
  }
  return dest.filter((e) => ok.has(e));
}

async function compte(table: string, f: (q: any) => any) {
  const { count } = await f(sb.from(table).select("*", { count: "exact", head: true }));
  return count ?? 0;
}

function gabarit(titre: string, corps: string, pied: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f1ea;font-family:Arial,Helvetica,sans-serif;color:#14201d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ea"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #d9d5c8">
<tr><td style="background:#1f4d3a;padding:14px 20px;font-size:20px;font-weight:bold;color:#ffffff;border-bottom:4px solid #f2b705">STOCK<span style="color:#f2b705">AARUD</span></td></tr>
<tr><td style="padding:22px 20px 8px"><h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${titre}</h1>${corps}
<p style="margin:22px 0 14px"><a href="${APP}" style="background:#1f4d3a;color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 18px;display:inline-block">Ouvrir Stockaarud</a></p></td></tr>
<tr><td style="padding:12px 20px 18px;border-top:1px solid #e6e2d6;font-size:12px;line-height:1.5;color:#5a5a50">${pied}</td></tr>
</table></td></tr></table></body></html>`;
}
const liste = (items: string[]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.4">${items.join("")}</table>`;
const ligne = (nom: string, val: string, coul: string) =>
  `<tr><td style="padding:7px 0;border-bottom:1px solid #eeeae0"><span style="display:inline-block;width:10px;height:10px;background:${coul};margin-right:8px"></span>${esc(nom)}</td><td align="right" style="padding:7px 0;border-bottom:1px solid #eeeae0;white-space:nowrap;font-weight:bold">${esc(val)}</td></tr>`;
const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${t}</p>`;
const jours = (n: unknown) => {
  const v = Math.max(0, Math.round(Number(n) || 0));
  return v >= 120 ? "120 j et plus" : v + " j";
};

async function brevo(to: string, sujet: string, html: string, texte: string) {
  if (!BREVO_KEY || !FROM) throw new Error("relais non configuré");
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Stockaarud", email: FROM }, to: [{ email: to }], subject: sujet, htmlContent: html, textContent: texte }),
  });
  if (!r.ok) throw new Error("brevo " + r.status + " " + (await r.text()).slice(0, 200));
}

// Inscription : crée l'adresse si besoin et lui envoie le lien de confirmation.
async function abonner(email: string, caarud: string, ref: string) {
  await sb.from("abonnes_bases").upsert({ email, ref }, { onConflict: "email,ref", ignoreDuplicates: true });
  const { data: a } = await sb.from("abonnes").select("*").eq("email", email).maybeSingle();
  if (a && a.confirme_at) return "confirme";
  if (a && a.demande_at > depuis(DELAI_CONFIRMATION_H)) return "attente";
  if ((await compte("envois", (q) => q.eq("type", "confirmation").gt("at", depuis(24)))) >= MAX_CONFIRMATIONS_JOUR) return "plus_tard";
  if ((await compte("envois", (q) => q.eq("type", "confirmation").like("cle", "conf|" + ref + "|%").gt("at", depuis(24)))) >= MAX_CONF_PAR_BASE_JOUR) return "plus_tard";
  const tk = a ? a.token : token();
  if (a) await sb.from("abonnes").update({ demande_at: new Date().toISOString() }).eq("email", email);
  else await sb.from("abonnes").insert({ email, token: tk });
  const lien = SELF + "?confirmer=" + tk;
  const html = gabarit(
    "Confirme ton adresse",
    p(`Cette adresse a été inscrite aux alertes de stock de <b>${esc(caarud || "ton CAARUD")}</b> dans Stockaarud.`) +
      p(`Pour les recevoir, confirme que c'est bien toi :`) +
      `<p style="margin:0 0 14px"><a href="${lien}" style="background:#f2b705;color:#14201d;text-decoration:none;font-weight:bold;padding:11px 18px;display:inline-block">Oui, je veux recevoir les alertes</a></p>` +
      p(`Si tu n'as rien demandé, ignore ce message : tu ne recevras rien d'autre.`),
    "Stockaarud, gestion du stock de matériel de réduction des risques. Aucune donnée sur les personnes accueillies.",
  );
  try {
    await brevo(email, "Stockaarud : confirme ton adresse pour les alertes de stock", html,
      `Cette adresse a été inscrite aux alertes de stock de ${caarud || "ton CAARUD"} dans Stockaarud.\nPour les recevoir, ouvre ce lien : ${lien}\nSi tu n'as rien demandé, ignore ce message.`);
  } catch (e) {
    // le mail n'est pas parti : on remet l'adresse dans son état d'avant, pour qu'un nouvel essai soit possible tout de suite
    if (a) await sb.from("abonnes").update({ demande_at: a.demande_at }).eq("email", email);
    else await sb.from("abonnes").delete().eq("email", email);
    throw e;
  }
  await sb.from("envois").insert({ cle: "conf|" + ref + "|" + email + "|" + Date.now(), email, type: "confirmation" });
  return "attente";
}

type Mail = { sujet: string; titre: string; corps: string; texte: string };
function composer(type: string, caarud: string, data: any): Mail | null {
  const nom = caarud || "ton CAARUD";
  if (type === "test") {
    return { sujet: `Stockaarud : essai des alertes (${nom})`, titre: "Les alertes fonctionnent",
      corps: p(`Ceci est un essai envoyé depuis les réglages de <b>${esc(nom)}</b>. Les vraies alertes arriveront à cette adresse.`),
      texte: `Essai des alertes de ${nom}. Les vraies alertes arriveront à cette adresse.` };
  }
  if (type === "rupture") {
    const prod = propre(data?.produit), act = propre(data?.activite, 40), d = jour(data?.date);
    if (!prod) return null;
    return { sujet: `Rupture signalée : ${prod} (${nom})`, titre: `Il n'y a plus de ${esc(prod)}`,
      corps: p(`L'équipe de <b>${esc(nom)}</b> a signalé une rupture${d ? " le " + esc(d) : ""}${act ? ", pendant l'activité " + esc(act) : ""}.`) +
        p(`Ouvre l'onglet Commandes pour voir ce qui est attendu, ou enregistre la livraison si elle est arrivée.`),
      texte: `L'équipe de ${nom} a signalé qu'il n'y a plus de ${prod}${d ? " (" + d + ")" : ""}.\n${APP}` };
  }
  if (type === "avenir") {
    const L = (Array.isArray(data?.produits) ? data.produits : []).slice(0, 40).map((x: any) => ({ nom: propre(x?.nom), j: x?.jours })).filter((x: any) => x.nom);
    if (!L.length) return null;
    return { sujet: `${L.length} produit${L.length > 1 ? "s" : ""} à commander maintenant (${nom})`,
      titre: L.length > 1 ? `${L.length} produits seront épuisés avant la prochaine livraison` : `${esc(L[0].nom)} sera épuisé avant la prochaine livraison`,
      corps: p(`Au rythme actuel de <b>${esc(nom)}</b>, voici le stock qu'il reste :`) + liste(L.map((x: any) => ligne(x.nom, jours(x.j), "#c0392b"))) +
        p(`<span style="font-size:13px;color:#5a5a50">Chaque produit n'est signalé qu'une fois par semaine.</span>`),
      texte: `À commander maintenant (${nom}) :\n` + L.map((x: any) => `- ${x.nom} : ${jours(x.j)}`).join("\n") + `\n${APP}` };
  }
  if (type === "recap") {
    const lire = (l: any) => (Array.isArray(l) ? l : []).slice(0, 60).map((x: any) => ({ nom: propre(x?.nom), j: x?.jours })).filter((x: any) => x.nom);
    const U = lire(data?.urgents), W = lire(data?.aprevoir), ok = Math.max(0, Math.round(Number(data?.tranquilles) || 0));
    const R = (Array.isArray(data?.ruptures) ? data.ruptures : []).slice(0, 20).map((x: any) => propre(x)).filter(Boolean);
    const d = jour(data?.date);
    let corps = p(`L'état du stock de <b>${esc(nom)}</b>${d ? ", calculé le " + esc(d) : ""}.`);
    if (R.length) corps += p(`<b>Ruptures signalées par l'équipe :</b> ${R.map(esc).join(", ")}.`);
    if (U.length) corps += `<h2 style="font-size:15px;margin:16px 0 4px;color:#c0392b">Urgent : à commander tout de suite</h2>` + liste(U.map((x: any) => ligne(x.nom, jours(x.j), "#c0392b")));
    if (W.length) corps += `<h2 style="font-size:15px;margin:16px 0 4px;color:#b9770e">À prévoir</h2>` + liste(W.map((x: any) => ligne(x.nom, jours(x.j), "#e0a100")));
    corps += p(`<span style="display:inline-block;width:10px;height:10px;background:#2e7d4f;margin:16px 8px 0 0"></span>${ok} produit${ok > 1 ? "s" : ""} tranquille${ok > 1 ? "s" : ""}.`);
    if (!U.length && !W.length && !R.length) corps += p(`Rien à commander pour l'instant.`);
    return { sujet: `Météo du stock : ${U.length} urgent${U.length > 1 ? "s" : ""}, ${W.length} à prévoir (${nom})`, titre: "La météo du stock", corps,
      texte: `Météo du stock de ${nom}${d ? " (" + d + ")" : ""}\n` + (R.length ? `Ruptures signalées : ${R.join(", ")}\n` : "") +
        (U.length ? `Urgent :\n` + U.map((x: any) => `- ${x.nom} : ${jours(x.j)}`).join("\n") + "\n" : "") +
        (W.length ? `À prévoir :\n` + W.map((x: any) => `- ${x.nom} : ${jours(x.j)}`).join("\n") + "\n" : "") + `${ok} produit(s) tranquille(s).\n${APP}` };
  }
  return null;
}

async function envoyer(b: any, ref: string) {
  const type = String(b.type || ""), cle = cleOk(b.cle), caarud = propre(b.caarud, 60);
  if (!ref || !cle) return json({ erreur: "requête incomplète" }, 400);
  const dest = await rattachees(ref, mails(b.emails), true);
  const { data: conf } = await sb.from("abonnes").select("email, token").in("email", dest.length ? dest : [""]).not("confirme_at", "is", null);
  const res = { envoyes: 0, deja: 0, non_confirmes: dest.length - (conf?.length ?? 0), limites: 0 };
  if (!conf?.length) return json(res);
  if ((await compte("envois", (q) => q.gt("at", depuis(24)))) >= MAX_TOTAL_JOUR) return json({ ...res, limites: conf.length });
  if ((await compte("envois", (q) => q.like("cle", ref + "|%").gt("at", depuis(24)))) >= MAX_PAR_BASE_JOUR) return json({ ...res, limites: conf.length });
  for (const a of conf) {
    let data = b.data;
    const cles: string[] = [];
    if (type === "avenir") {
      // une ligne du journal par produit : un produit n'est signalé qu'une fois par semaine à chaque adresse
      const L = (Array.isArray(data?.produits) ? data.produits : []).slice(0, 40);
      const ks = L.map((x: any) => [ref, "av", cleOk(x?.id, 40), cle, a.email].join("|"));
      const { data: vus } = await sb.from("envois").select("cle").in("cle", ks.length ? ks : [""]);
      const deja = new Set((vus ?? []).map((v: any) => v.cle));
      const reste = L.filter((_: any, i: number) => !deja.has(ks[i]));
      if (!reste.length) { res.deja++; continue; }
      data = { produits: reste };
      cles.push(...ks.filter((k: string) => !deja.has(k)));
    } else cles.push([ref, type, cle, a.email].join("|"));
    const m = composer(type, caarud, data);
    if (!m) return json({ erreur: "contenu vide" }, 400);
    if ((await compte("envois", (q) => q.eq("email", a.email).gt("at", depuis(24)))) >= MAX_PAR_ADRESSE_JOUR) { res.limites++; continue; }
    // on réserve la clé avant d'envoyer : si deux téléphones signalent en même temps, un seul mail part
    const { error } = await sb.from("envois").insert(cles.map((k) => ({ cle: k, email: a.email, type })));
    if (error) { res.deja++; continue; }
    const pied = `Tu reçois ce message parce que cette adresse est inscrite aux alertes de ${esc(caarud || "ton CAARUD")} dans Stockaarud. ` +
      `Pour changer la fréquence : Réglages, Alertes par e-mail. <a href="${PAGE}?stop=${a.token}" style="color:#5a5a50">Ne plus rien recevoir</a>.`;
    try {
      await brevo(a.email, m.sujet, gabarit(m.titre, m.corps, pied), m.texte + `\n\nNe plus rien recevoir : ${PAGE}?stop=${a.token}`);
      res.envoyes++;
    } catch (e) {
      await sb.from("envois").delete().in("cle", cles);
      console.error(String(e));
      return json({ ...res, erreur: "envoi impossible" }, 502);
    }
  }
  return json(res);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const u = new URL(req.url);
  try {
    if (req.method === "GET") {
      const tk = cleOk(u.searchParams.get("confirmer"), 64);
      if (!tk) return json({ ok: true, service: "relais d'alertes Stockaarud" });
      const { data } = await sb.from("abonnes").update({ confirme_at: new Date().toISOString() }).eq("token", tk).is("confirme_at", null).select("email");
      const { data: deja } = data?.length ? { data } : await sb.from("abonnes").select("email").eq("token", tk);
      return Response.redirect(PAGE + "?etat=" + (deja?.length ? "confirme" : "inconnu"), 302);
    }
    const b = await req.json().catch(() => ({}));
    if (b.action === "stop") {
      const tk = cleOk(b.token, 64);
      if (tk) await sb.from("abonnes").delete().eq("token", tk);
      return json({ ok: true });
    }
    const qui = await appelant(req, b);
    if (!qui) return json({ erreur: "appli non reconnue : reconnecte-toi à ta base Stockaarud" }, 401);
    if (b.action === "abonner") {
      if (qui.role !== "coordo") return json({ erreur: "réservé au responsable stock" }, 403);
      const out: Record<string, string> = {};
      for (const e of mails(b.emails)) out[e] = await abonner(e, propre(b.caarud, 60), qui.ref);
      return json({ etats: out });
    }
    if (b.action === "etat") {
      const tous = mails(b.emails), dest = await rattachees(qui.ref, tous);
      const { data } = await sb.from("abonnes").select("email, confirme_at").in("email", dest.length ? dest : [""]);
      const out: Record<string, string> = {};
      for (const e of tous) { const a = dest.includes(e) && (data ?? []).find((x: any) => x.email === e); out[e] = a ? (a.confirme_at ? "confirme" : "attente") : "inconnu"; }
      return json({ etats: out });
    }
    if (b.action === "envoyer") return await envoyer(b, qui.ref);
    return json({ erreur: "action inconnue" }, 400);
  } catch (e) {
    console.error(String(e));
    return json({ erreur: "erreur du relais" }, 500);
  }
});
