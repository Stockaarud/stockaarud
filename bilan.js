/* Stockaarud : bilan complet de l'année, en Excel (graphiques modifiables) et en Word,
   et lecture des fichiers Excel pour reprendre un historique.
   Chargé seulement quand on s'en sert. S'appuie sur vendor/fflate.js (compression zip).

   Le bilan est décrit une seule fois, sous cette forme, puis rendu en PDF, Excel ou Word :
   B = { titre, sous, structure, annee, sections: [ { titre, intro, kpis: [[libellé, valeur]], tables: [T] } ] }
   T = { titre, note, cols: [{ t: "Produit", f: "s" }], rows: [[...]], total: true|false,
         chart: { type: "bar"|"barh"|"line"|"pie", titre, cat: 0, ser: [1, 2], max: 12 } }
   Formats de colonne : s texte · n entier · e euros · p part en % · v variation en % · d décimal.
   Une cellule peut porter son propre format : { v: 12.3, f: "d" }. */
(function () {
  "use strict";
  const enc = s => new TextEncoder().encode(s);
  const X = s => String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const PAL = ["1F4D3A", "F2B705", "7FAE92", "C27C0E", "5B7C8D", "C9D6A3", "53645D", "E8D48B", "2F7A5C", "9C6B3D"];
  /* Format Excel des étiquettes selon le format de la colonne */
  const NUMF = f => (f === "e" ? '#,##0\\ "€"' : f === "d" ? "#,##0.0" : f === "p" || f === "v" ? "0%" : "#,##0");
  const cv = c => (c !== null && typeof c === "object" ? c.v : c);
  const cf = (c, col) => (c !== null && typeof c === "object" && c.f ? c.f : (col && col.f) || "s");
  const estNb = v => typeof v === "number" && isFinite(v);
  const nfr = (v, d) => v.toLocaleString("fr-FR", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  function fmt(c, col) {
    const v = cv(c), f = cf(c, col);
    if (v === null || v === undefined || v === "") return "";
    if (!estNb(v)) return String(v);
    if (f === "e") return nfr(v) + " €";
    if (f === "p") return (v > 0 && v < 0.005 ? "<1" : nfr(v * 100)) + " %";
    if (f === "v") return (Math.round(v * 100) > 0 ? "+" : Math.round(v * 100) < 0 ? "−" : "") + nfr(Math.abs(v * 100)) + " %";
    if (f === "d") return nfr(v, 1);
    return nfr(v);
  }
  /* Lignes utiles au graphique : sans la ligne de total, limitées à chart.max. */
  function chartRows(T) { const R = T.total ? T.rows.slice(0, -1) : T.rows; return T.chart && T.chart.max ? R.slice(0, T.chart.max) : R; }
  function chartSpec(T) {
    const c = T.chart, R = chartRows(T);
    return { type: c.type, titre: c.titre || T.titre, cats: R.map(r => String(cv(r[c.cat || 0]) ?? "")), series: c.ser.map(i => ({ nom: T.cols[i].t, vals: R.map(r => (estNb(cv(r[i])) ? cv(r[i]) : 0)), f: T.cols[i].f })) };
  }

  /* ---------- Graphique dessiné, pour le PDF et Word ---------- */
  function chartPng(spec, w, h) {
    w = w || 1000; h = h || 460;
    const cvs = document.createElement("canvas"); cvs.width = w; cvs.height = h;
    const g = cvs.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
    const F = (px, b) => { g.font = (b ? "700 " : "") + px + "px Helvetica, Arial, sans-serif"; };
    g.fillStyle = "#14201d"; F(22, true); g.textBaseline = "top"; g.textAlign = "left"; g.fillText(spec.titre || "", 24, 16);
    const S = spec.series, C = spec.cats, col = i => "#" + PAL[i % PAL.length];
    const court = (t, max) => { t = String(t); while (t.length > 2 && g.measureText(t).width > max) t = t.slice(0, -2) + "…"; return t; };
    const etq = (v, f) => (f === "e" ? nfr(v) + " €" : f === "d" ? nfr(v, 1) : nfr(v));
    if (spec.type === "pie") {
      /* camembert : étiquettes dehors, reliées à leur part par un trait */
      const vals = S[0].vals.map(v => Math.max(0, v)), tot = vals.reduce((a, b) => a + b, 0) || 1, cx = w / 2, cy = h / 2 + 22, r = Math.min(h / 2 - 70, w / 4 - 40);
      let a0 = -Math.PI / 2; const L = [];
      vals.forEach((v, i) => { const a1 = a0 + (v / tot) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, a0, a1); g.closePath(); g.fillStyle = col(i); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
        if (v > 0) { const m = (a0 + a1) / 2; L.push({ i, m, droite: Math.cos(m) >= 0, y: cy + Math.sin(m) * (r + 34), t: C[i] + " : " + nfr(v) + " (" + (v / tot < 0.005 ? "<1" : Math.round((v / tot) * 100)) + " %)" }); }
        a0 = a1; });
      F(16);
      for (const cote of [true, false]) {
        const P = L.filter(l => l.droite === cote).sort((p, q) => p.y - q.y);
        for (let k = 1; k < P.length; k++) if (P[k].y - P[k - 1].y < 24) P[k].y = P[k - 1].y + 24;
        const bas = h - 16; if (P.length && P[P.length - 1].y > bas) { const d = P[P.length - 1].y - bas; P.forEach(l => (l.y -= d)); }
        for (const l of P) {
          const ex = cx + Math.cos(l.m) * r, ey = cy + Math.sin(l.m) * r, mx = cx + Math.cos(l.m) * (r + 18), my = cy + Math.sin(l.m) * (r + 18), tx = cx + (cote ? 1 : -1) * (r + 44);
          g.strokeStyle = "#53645d"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ex, ey); g.lineTo(mx, my); g.lineTo(tx, l.y); g.stroke();
          g.fillStyle = "#14201d"; g.textBaseline = "middle"; g.textAlign = cote ? "left" : "right"; g.fillText(court(l.t, w / 2 - r - 70), tx + (cote ? 6 : -6), l.y);
        }
      }
      return fin(cvs, w, h);
    }
    const hor = spec.type === "barh", leg = S.length > 1 ? 34 : 0;
    F(15);
    const lblW = hor ? Math.min(300, Math.max(...C.map(c => g.measureText(c).width), 40) + 16) : 0;
    const L = hor ? 24 + lblW : 84, T = 64, R = w - (hor ? 90 : 28), Bm = h - (hor ? 30 : 64) - leg;
    const max = Math.max(1, ...S.flatMap(s => s.vals)), pas = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const m = max / p; return (m <= 2 ? 0.5 : m <= 5 ? 1 : 2) * p; })(), top = Math.ceil((max * 1.08) / pas) * pas;
    g.strokeStyle = "#e3e9e5"; g.lineWidth = 1; g.fillStyle = "#53645d";
    for (let v = 0; v <= top + 1e-9; v += pas) {
      if (hor) { const x = L + ((R - L) * v) / top; g.beginPath(); g.moveTo(x, T); g.lineTo(x, Bm); g.stroke(); g.textAlign = "center"; g.textBaseline = "top"; g.fillText(nfr(v), x, Bm + 6); }
      else { const y = Bm - ((Bm - T) * v) / top; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(nfr(v), L - 8, y); }
    }
    const n = Math.max(1, C.length), nEtq = n * S.length, fe = nEtq > 30 ? 11 : nEtq > 16 ? 12 : 14;
    const etiquette = (t, x, y, ali, base) => { F(fe, true); g.fillStyle = "#14201d"; g.textAlign = ali; g.textBaseline = base; g.fillText(t, x, y); };
    if (hor) {
      const bh = (Bm - T) / n;
      C.forEach((c, i) => { F(15); g.fillStyle = "#14201d"; g.textBaseline = "middle"; g.textAlign = "right"; g.fillText(court(c, lblW - 10), L - 8, T + bh * (i + 0.5));
        S.forEach((s, k) => { const bw = (bh * 0.72) / S.length, x1 = ((R - L) * Math.max(0, s.vals[i])) / top, y1 = T + bh * i + bh * 0.14 + bw * k; g.fillStyle = col(k); g.fillRect(L, y1, x1, bw - 1); if (s.vals[i] > 0) etiquette(etq(s.vals[i], s.f), L + x1 + 5, y1 + bw / 2, "left", "middle"); }); });
    } else {
      const bw = (R - L) / n, every = Math.ceil(n / 16);
      C.forEach((c, i) => { if (i % every) return; F(15); g.fillStyle = "#14201d"; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(court(c, bw * every - 6), L + bw * (i + 0.5), Bm + 8); });
      if (spec.type === "line") {
        S.forEach((s, k) => { g.strokeStyle = col(k); g.lineWidth = 3; g.beginPath(); s.vals.forEach((v, i) => { const x = L + bw * (i + 0.5), y = Bm - ((Bm - T) * v) / top; if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
          s.vals.forEach((v, i) => { const x = L + bw * (i + 0.5), y = Bm - ((Bm - T) * v) / top; g.fillStyle = col(k); g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); if (n <= 14) etiquette(etq(v, s.f), x, y - 9, "center", "bottom"); }); });
      } else {
        C.forEach((c, i) => S.forEach((s, k) => { const ww = (bw * 0.74) / S.length, hh = ((Bm - T) * Math.max(0, s.vals[i])) / top, x = L + bw * i + bw * 0.13 + ww * k; g.fillStyle = col(k); g.fillRect(x, Bm - hh, ww - 1, hh);
          if (s.vals[i] > 0) { F(fe, true); const t = etq(s.vals[i], s.f); if (g.measureText(t).width <= ww + 14 || nEtq <= 12) etiquette(t, x + ww / 2, Bm - hh - 4, "center", "bottom"); } }));
      }
    }
    if (leg) { let x = L; const y = h - 28; F(15); g.textAlign = "left"; g.textBaseline = "top"; S.forEach((s, k) => { g.fillStyle = col(k); g.fillRect(x, y + 1, 14, 14); g.fillStyle = "#14201d"; g.fillText(s.nom, x + 20, y); x += g.measureText(s.nom).width + 48; }); }
    return fin(cvs, w, h);
  }
  function fin(cvs, w, h) { const url = cvs.toDataURL("image/png"), b = atob(url.split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return { url, jpg: cvs.toDataURL("image/jpeg", 0.9), bytes: u, w, h }; }

  /* ---------- Excel ---------- */
  const colL = n => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const nomFeuille = (t, pris) => { let n = String(t).replace(/[\\/?*\[\]:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Feuille"; let k = n, i = 2; while (pris.has(k.toLowerCase())) k = n.slice(0, 25) + " " + i++; pris.add(k.toLowerCase()); return k; };
  const STY = { s: 0, n: 3, e: 4, p: 5, v: 5, d: 6 }, STYB = { s: 1, n: 8, e: 9, p: 10, v: 10, d: 11 };
  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0\\ &quot;€&quot;"/><numFmt numFmtId="166" formatCode="#,##0.0"/></numFmts>'
    + '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1F4D3A"/><name val="Calibri"/></font></fonts>'
    + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4D3A"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="12">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>'
    + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    + '<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    + '<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    + '<xf numFmtId="9" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    + '<xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>'
    + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  function chartXml(T, feuille, r0, id) {
    const c = T.chart, n = chartRows(T).length, f = "'" + feuille.replace(/'/g, "''") + "'!", cat = colL(c.cat || 0), a = r0 + 2, b = r0 + 1 + n;
    const catRef = '<c:cat><c:strRef><c:f>' + X(f + "$" + cat + "$" + a + ":$" + cat + "$" + b) + '</c:f></c:strRef></c:cat>';
    const ser = (i, k, extra, avecCouleur) => '<c:ser><c:idx val="' + k + '"/><c:order val="' + k + '"/><c:tx><c:strRef><c:f>' + X(f + "$" + colL(i) + "$" + (r0 + 1)) + '</c:f></c:strRef></c:tx>'
      + (avecCouleur ? '<c:spPr>' + avecCouleur(PAL[k % PAL.length]) + '</c:spPr>' : '') + extra[0] + catRef + '<c:val><c:numRef><c:f>' + X(f + "$" + colL(i) + "$" + a + ":$" + colL(i) + "$" + b) + '</c:f></c:numRef></c:val>' + extra[1] + '</c:ser>';
    const plein = h => '<a:solidFill><a:srgbClr val="' + h + '"/></a:solidFill>', trait = h => '<a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="' + h + '"/></a:solidFill><a:round/></a:ln>';
    const sansCadre = '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>', txt = (sz, b) => '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '"' + (b ? ' b="1"' : '') + '><a:solidFill><a:srgbClr val="14201D"/></a:solidFill></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>';
    const nEtq = n * c.ser.length, tE = nEtq > 30 ? 700 : nEtq > 16 ? 800 : 900;
    const valeurs = (i, pos) => '<c:dLbls><c:numFmt formatCode="' + X(NUMF(T.cols[i].f)) + '" sourceLinked="0"/>' + sansCadre + txt(tE, true) + '<c:dLblPos val="' + pos + '"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>';
    const axes = hor => '<c:catAx><c:axId val="' + id + '1"/><c:scaling><c:orientation val="' + (hor ? "maxMin" : "minMax") + '"/></c:scaling><c:delete val="0"/><c:axPos val="' + (hor ? "l" : "b") + '"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="BFCBC4"/></a:solidFill></a:ln></c:spPr>' + txt(900) + '<c:crossAx val="' + id + '2"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
      + '<c:valAx><c:axId val="' + id + '2"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="' + (hor ? "b" : "l") + '"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E3E9E5"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' + txt(800) + '<c:crossAx val="' + id + '1"/><c:crosses val="' + (hor ? "max" : "autoZero") + '"/><c:crossBetween val="between"/></c:valAx>';
    let plot, layout = '<c:layout/>';
    if (c.type === "pie") {
      /* étiquettes dehors (nom et %), décalées vers l'extérieur pour qu'Excel trace un trait jusqu'à leur part */
      const R = chartRows(T), vals = R.map(r => Math.max(0, estNb(cv(r[c.ser[0]])) ? cv(r[c.ser[0]]) : 0)), tot = vals.reduce((x, y) => x + y, 0) || 1;
      let cum = 0, pts = "", lbls = "";
      vals.forEach((v, k) => { const m = (cum + v / 2) / tot * Math.PI * 2; cum += v; const petit = v / tot < 0.06, d = 0.09 + (petit && k % 2 ? 0.07 : 0);
        pts += '<c:dPt><c:idx val="' + k + '"/><c:bubble3D val="0"/><c:spPr>' + plein(PAL[k % PAL.length]) + '<a:ln w="19050"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>';
        lbls += '<c:dLbl><c:idx val="' + k + '"/><c:layout><c:manualLayout><c:x val="' + (Math.sin(m) * d).toFixed(4) + '"/><c:y val="' + (-Math.cos(m) * d).toFixed(4) + '"/></c:manualLayout></c:layout>' + sansCadre + txt(900) + '<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>' + X(" : ") + '</c:separator></c:dLbl>'; });
      const dl = '<c:dLbls>' + lbls + '<c:numFmt formatCode="0%" sourceLinked="0"/>' + sansCadre + txt(900) + '<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:separator>' + X(" : ") + '</c:separator><c:showLeaderLines val="1"/><c:leaderLines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="53645D"/></a:solidFill></a:ln></c:spPr></c:leaderLines></c:dLbls>';
      plot = '<c:pieChart><c:varyColors val="1"/>' + ser(c.ser[0], 0, [pts + dl, ""], null) + '<c:firstSliceAng val="0"/></c:pieChart>';
      layout = '<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="0.28"/><c:y val="0.27"/><c:w val="0.44"/><c:h val="0.62"/></c:manualLayout></c:layout>';
    }
    else if (c.type === "line") plot = '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>' + c.ser.map((i, k) => ser(i, k, ['<c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr>' + plein(PAL[k % PAL.length]) + '<a:ln><a:noFill/></a:ln></c:spPr></c:marker>' + (n <= 14 ? valeurs(i, "t") : ""), '<c:smooth val="0"/>'], trait)).join("") + '<c:marker val="1"/><c:axId val="' + id + '1"/><c:axId val="' + id + '2"/></c:lineChart>' + axes(false);
    else plot = '<c:barChart><c:barDir val="' + (c.type === "barh" ? "bar" : "col") + '"/><c:grouping val="clustered"/><c:varyColors val="0"/>' + c.ser.map((i, k) => ser(i, k, ['<c:invertIfNegative val="0"/>' + valeurs(i, "outEnd"), ""], plein)).join("") + '<c:gapWidth val="60"/><c:axId val="' + id + '1"/><c:axId val="' + id + '2"/></c:barChart>' + axes(c.type === "barh");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart>'
      + '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="1200" b="1"/><a:t>' + X(c.titre || T.titre) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>'
      + '<c:plotArea>' + layout + plot + '</c:plotArea>' + (c.type !== "pie" && c.ser.length > 1 ? '<c:legend><c:legendPos val="' + (c.type === "pie" ? "r" : "b") + '"/><c:overlay val="0"/></c:legend>' : '') + '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }

  /* feuilles : [{ nom, largeurs?, blocs: [ { titre, note, cols, rows, total, chart } | { texte: [lignes] } ] }] */
  function classeur(feuilles) {
    const files = {}, pris = new Set(), noms = [], ct = [], wbRels = [];
    let nChart = 0, nDraw = 0;
    feuilles.forEach((Fe, si) => {
      const nom = nomFeuille(Fe.nom, pris); noms.push(nom);
      const L = [], anc = []; let r = 1, maxC = 1;
      const cell = (ci, v, s) => { const ref = colL(ci) + r; if (v === null || v === undefined || v === "") return ""; if (estNb(v)) return '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : "") + '><v>' + v + '</v></c>'; return '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : "") + '><is><t xml:space="preserve">' + X(v) + '</t></is></c>'; };
      const ligne = cs => { const t = cs.join(""); if (t) L.push('<row r="' + r + '">' + t + '</row>'); r++; };
      for (const B of Fe.blocs) {
        if (B.texte) { B.texte.forEach((t, i) => ligne([cell(0, t, i === 0 ? (B.titre === false ? 1 : 7) : 0)])); r++; continue; }
        const r0 = r; maxC = Math.max(maxC, B.cols.length);
        if (!B.simple) ligne([cell(0, B.titre, 7)]);
        ligne(B.cols.map((c, i) => cell(i, c.t, 2)));
        B.rows.forEach((row, k) => { const gras = B.total && k === B.rows.length - 1; ligne(row.map((c, i) => { const v = cv(c), f = cf(c, B.cols[i]); return cell(i, v, estNb(v) ? (gras ? STYB : STY)[f] : gras ? 1 : 0); })); });
        if (B.note) ligne([cell(0, B.note, 0)]);
        if (B.chart && chartRows(B).length) { anc.push({ B, r0, col: B.cols.length + 1 }); r = Math.max(r, r0 + 19); }
        r += 2;
      }
      const larg = Fe.largeurs || [38].concat(new Array(Math.max(0, maxC - 1)).fill(15));
      let rel = "";
      if (anc.length) {
        nDraw++; const dr = [], drRels = [];
        anc.forEach((a, k) => { nChart++; files["xl/charts/chart" + nChart + ".xml"] = enc(chartXml(a.B, nom, a.r0, nChart)); ct.push('<Override PartName="/xl/charts/chart' + nChart + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>');
          drRels.push('<Relationship Id="rId' + (k + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + nChart + '.xml"/>');
          dr.push('<xdr:twoCellAnchor><xdr:from><xdr:col>' + a.col + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (a.r0 - 1) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>' + (a.col + 8) + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + (a.r0 + 17) + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
            + '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (k + 2) + '" name="Graphique ' + (k + 1) + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId' + (k + 1) + '"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>'); });
        files["xl/drawings/drawing" + nDraw + ".xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' + dr.join("") + '</xdr:wsDr>');
        files["xl/drawings/_rels/drawing" + nDraw + ".xml.rels"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drRels.join("") + '</Relationships>');
        files["xl/worksheets/_rels/sheet" + (si + 1) + ".xml.rels"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + nDraw + '.xml"/></Relationships>');
        ct.push('<Override PartName="/xl/drawings/drawing' + nDraw + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>');
        rel = '<drawing r:id="rId1"/>';
      }
      files["xl/worksheets/sheet" + (si + 1) + ".xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><cols>' + larg.map((wd, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + wd + '" customWidth="1"/>').join("") + '</cols><sheetData>' + L.join("") + '</sheetData>' + rel + '</worksheet>');
      ct.push('<Override PartName="/xl/worksheets/sheet' + (si + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>');
      wbRels.push('<Relationship Id="rId' + (si + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (si + 1) + '.xml"/>');
    });
    const ns = feuilles.length;
    files["xl/workbook.xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + noms.map((n, i) => '<sheet name="' + X(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join("") + '</sheets></workbook>');
    files["xl/_rels/workbook.xml.rels"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + wbRels.join("") + '<Relationship Id="rId' + (ns + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    files["xl/styles.xml"] = enc(STYLES);
    files["_rels/.rels"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    files["[Content_Types].xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + ct.join("") + '</Types>');
    return new Blob([window.fflate.zipSync(files, { level: 6 })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function xlsx(B) {
    const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    const F = [{ nom: "Lisez-moi", largeurs: [110], blocs: [{ texte: [B.titre, B.structure || "", B.sous || "", "Fichier créé par Stockaarud le " + date + "."] },
      { titre: false, texte: ["Comment s'en servir", "Un onglet par chapitre. Chaque graphique est un vrai graphique Excel, lié au tableau à sa gauche :", "change un chiffre, le graphique suit ; clique sur un graphique pour changer son type, ses couleurs ou son titre.", "Les montants sont calculés au prix actuel de chaque produit, sauf quand un prix d'époque a été saisi."] },
      { titre: false, texte: ["Les onglets"].concat(B.sections.map((s, i) => (i + 1) + ". " + s.titre)) }] }];
    B.sections.forEach((s, i) => {
      const blocs = [{ texte: [(i + 1) + ". " + s.titre].concat(s.intro ? [s.intro] : []) }];
      if (s.kpis && s.kpis.length) blocs.push({ titre: "Chiffres clés", cols: [{ t: "Indicateur", f: "s" }, { t: "Valeur", f: "s" }], rows: s.kpis.map(k => [k[0], k[1]]) });
      for (const T of s.tables) if (T.rows.length) blocs.push(T);
      F.push({ nom: (i + 1) + " " + s.titre, blocs });
    });
    return classeur(F);
  }

  /* ---------- Word ---------- */
  function docx(B) {
    const files = {}, rels = [], date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    let nImg = 0;
    const run = (t, o) => '<w:r><w:rPr>' + (o && o.b ? "<w:b/>" : "") + (o && o.c ? '<w:color w:val="' + o.c + '"/>' : "") + (o && o.s ? '<w:sz w:val="' + o.s + '"/>' : "") + '</w:rPr><w:t xml:space="preserve">' + X(t) + '</w:t></w:r>';
    const p = (t, st, o) => '<w:p><w:pPr>' + (st ? '<w:pStyle w:val="' + st + '"/>' : "") + (o && o.right ? '<w:jc w:val="right"/>' : "") + (o && o.keep ? "<w:keepNext/>" : "") + '</w:pPr>' + (t === "" ? "" : run(t, o)) + '</w:p>';
    const img = (png, largeurCm) => { nImg++; const id = "rIdImg" + nImg, cx = Math.round(largeurCm * 360000), cy = Math.round((cx * png.h) / png.w);
      files["word/media/image" + nImg + ".png"] = png.bytes; rels.push('<Relationship Id="' + id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + nImg + '.png"/>');
      return '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + nImg + '" name="Graphique ' + nImg + '"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="' + nImg + '" name="image' + nImg + '.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'; };
    const table = T => {
      const n = T.cols.length, W = 15100, w0 = n > 1 ? Math.round(W * Math.min(0.42, Math.max(0.2, 2.2 / (n + 1.2)))) : W, wi = n > 1 ? Math.floor((W - w0) / (n - 1)) : 0, sz = n > 9 ? 14 : n > 6 ? 16 : 18;
      const tc = (t, i, o) => '<w:tc><w:tcPr><w:tcW w:w="' + (i ? wi : w0) + '" w:type="dxa"/>' + (o.fill ? '<w:shd w:val="clear" w:color="auto" w:fill="' + o.fill + '"/>' : "") + '</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>' + (o.right ? '<w:jc w:val="right"/>' : "") + '</w:pPr>' + (t === "" ? "" : run(t, { b: o.b, c: o.c, s: sz })) + '</w:p></w:tc>';
      let x = '<w:tbl><w:tblPr><w:tblW w:w="' + W + '" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D0DBD5"/><w:bottom w:val="single" w:sz="4" w:color="D0DBD5"/><w:insideH w:val="single" w:sz="4" w:color="D0DBD5"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + T.cols.map((c, i) => '<w:gridCol w:w="' + (i ? wi : w0) + '"/>').join("") + '</w:tblGrid>';
      x += '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + T.cols.map((c, i) => tc(c.t, i, { fill: "1F4D3A", c: "FFFFFF", b: true, right: i > 0 && c.f !== "s" })).join("") + '</w:tr>';
      T.rows.forEach((r, k) => { const gras = T.total && k === T.rows.length - 1; x += '<w:tr>' + T.cols.map((c, i) => tc(fmt(r[i], c), i, { b: gras, right: estNb(cv(r[i])), fill: k % 2 ? "F2F5F3" : "" })).join("") + '</w:tr>'; });
      return x + '</w:tbl>';
    };
    let body = p(B.titre, "Titre") + (B.structure ? p(B.structure, "Sous") : "") + (B.sous ? p(B.sous, "Note") : "") + p("Document créé par Stockaarud le " + date + ". Tout se modifie : supprime les chapitres dont tu n'as pas besoin.", "Note");
    B.sections.forEach((s, i) => {
      body += p((i + 1) + ". " + s.titre, "T1") + (s.intro ? p(s.intro, "Note") : "");
      if (s.kpis && s.kpis.length) body += table({ cols: [{ t: "Chiffres clés", f: "s" }, { t: "", f: "s" }], rows: s.kpis.map(k => [k[0], k[1]]) }) + p("", "");
      for (const T of s.tables) { if (!T.rows.length) continue;
        body += p(T.titre, "T2", { keep: true });
        if (T.chart && chartRows(T).length > 1) body += img(chartPng(chartSpec(T), 1000, T.chart.type === "barh" ? Math.min(700, 150 + chartRows(T).length * 34) : 440), 17);
        body += table(T) + (T.note ? p(T.note, "Note") : p("", "")); }
    });
    const st = (id, nom, base, ppr, rpr) => '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + nom + '"/>' + (base ? '<w:basedOn w:val="' + base + '"/>' : "") + '<w:pPr>' + ppr + '</w:pPr><w:rPr>' + rpr + '</w:rPr></w:style>';
    files["word/styles.xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100"/></w:pPr></w:pPrDefault></w:docDefaults>'
      + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
      + st("Titre", "Title", "Normal", '<w:spacing w:after="60"/>', '<w:b/><w:color w:val="1F4D3A"/><w:sz w:val="48"/>')
      + st("Sous", "Subtitle", "Normal", '<w:spacing w:after="60"/>', '<w:b/><w:sz w:val="28"/>')
      + st("T1", "heading 1", "Normal", '<w:keepNext/><w:pageBreakBefore/><w:spacing w:before="0" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:color w:val="1F4D3A"/><w:sz w:val="36"/>')
      + st("T2", "heading 2", "Normal", '<w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/>', '<w:b/><w:sz w:val="26"/>')
      + st("Note", "Note", "Normal", '<w:spacing w:before="40" w:after="120"/>', '<w:color w:val="53645D"/><w:sz w:val="19"/>') + '</w:styles>');
    files["word/document.xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>' + body
      + '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>');
    files["word/_rels/document.xml.rels"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + rels.join("") + '</Relationships>');
    files["_rels/.rels"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    files["[Content_Types].xml"] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
    return new Blob([window.fflate.zipSync(files, { level: 6 })], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  /* ---------- Lire un fichier Excel : { noms: [...], feuilles: { nom: [[cellules en texte]] } } ---------- */
  function lireXlsx(buf) {
    const z = window.fflate.unzipSync(new Uint8Array(buf)), txt = n => (z[n] ? new TextDecoder().decode(z[n]) : ""), P = s => new DOMParser().parseFromString(s, "application/xml");
    const tag = (el, n) => [...el.getElementsByTagName("*")].filter(e => e.localName === n);
    if (!z["xl/workbook.xml"]) throw new Error("pas un classeur Excel");
    const sst = z["xl/sharedStrings.xml"] ? tag(P(txt("xl/sharedStrings.xml")), "si").map(si => tag(si, "t").filter(t => t.parentNode.localName !== "rPh").map(t => t.textContent).join("")) : [];
    const rel = {}; for (const r of tag(P(txt("xl/_rels/workbook.xml.rels")), "Relationship")) rel[r.getAttribute("Id")] = r.getAttribute("Target");
    const out = { noms: [], feuilles: {} };
    for (const s of tag(P(txt("xl/workbook.xml")), "sheet")) {
      const nom = s.getAttribute("name"), id = s.getAttribute("r:id") || s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"); let t = rel[id] || ""; t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
      if (!z[t]) continue;
      const rows = [];
      for (const row of tag(P(txt(t)), "row")) { const R = []; let auto = 0;
        for (const c of tag(row, "c")) { const ref = c.getAttribute("r") || ""; let ci = auto; const m = /^([A-Z]+)/.exec(ref); if (m) { ci = 0; for (const ch of m[1]) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--; } auto = ci + 1;
          const ty = c.getAttribute("t"), v = tag(c, "v")[0]; let val = "";
          if (ty === "s") val = sst[+(v ? v.textContent : -1)] ?? ""; else if (ty === "inlineStr") val = tag(c, "t").map(x => x.textContent).join(""); else val = v ? v.textContent : "";
          if (ty !== "s" && ty !== "inlineStr" && ty !== "str" && /^-?\d+\.\d{6,}$/.test(val)) val = String(Math.round(parseFloat(val) * 1e6) / 1e6);
          R[ci] = String(val).trim(); }
        for (let i = 0; i < R.length; i++) if (R[i] === undefined) R[i] = "";
        if (R.some(x => x !== "")) rows.push(R); }
      out.noms.push(nom); out.feuilles[nom] = rows;
    }
    return out;
  }

  window.STKBilan = { xlsx, docx, classeur, lireXlsx, chartPng, chartSpec, chartRows, fmt };
})();
