// A coller dans script.google.com (nouveau projet), voir backend/README.md pour le déploiement.

const SHEET_NAME = "Runs";

// Script autonome (pas créé depuis une Sheet) : getActiveSpreadsheet() renvoie null.
// On crée/retrouve donc notre propre classeur via son ID stocké dans les Script Properties.
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("SHEET_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { /* id invalide, on en recrée un */ }
  }
  const ss = SpreadsheetApp.create("Running Data - Omar");
  props.setProperty("SHEET_ID", ss.getId());
  return ss;
}

function getSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["startDate", "appleType", "type", "lieu", "distanceKm", "durationSec", "avgHR", "calories", "avgCadence", "avgPower", "notes"]);
  }
  return sheet;
}

// Best-effort : Apple ne connait pas la notion d'EF/Fractionné/Long/Récup.
// Modifiable à la main dans la colonne "type" de la Sheet à tout moment.
function guessType(appleType, distanceKm) {
  const t = (appleType || "").toLowerCase();
  if (t.includes("run")) return distanceKm > 10 ? "Long" : "EF";
  if (t.includes("yoga")) return "Yoga";
  if (t.includes("strength")) return "Renfo";
  if (t.includes("flexibility") || t.includes("cooldown")) return "Mobilité";
  if (t.includes("walk")) return "Récup";
  return "Autre";
}

function getRawSheet() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName("RawCaptures");
  if (!sheet) {
    sheet = ss.insertSheet("RawCaptures");
    sheet.appendRow(["receivedAt", "rawContent"]);
  }
  return sheet;
}

// Premier test : on capture tel quel ce que le Raccourci envoie, quelle que
// soit sa forme exacte. On affinera le format une fois qu'on aura vu un
// vrai envoi depuis l'iPhone.
function doPost(e) {
  getRawSheet().appendRow([new Date(), e.postData.contents]);

  let parsedOk = false;
  let added = 0;
  try {
    const body = JSON.parse(e.postData.contents);
    const workouts = body.workouts || [];
    const sheet = getSheet();
    const existingKeys = sheet.getDataRange().getValues().slice(1).map(r => String(r[0]));

    workouts.forEach(w => {
      if (existingKeys.includes(w.startDate)) return; // dédup par horodatage exact
      sheet.appendRow([
        w.startDate,
        w.appleType || "",
        guessType(w.appleType, w.distanceKm || 0),
        w.lieu || "",
        w.distanceKm || 0,
        w.durationSec || 0,
        w.avgHR || "",
        w.calories || "",
        w.avgCadence || "",
        w.avgPower || "",
        w.notes || "",
      ]);
      added++;
    });
    parsedOk = true;
  } catch (err) {
    // pas grave pour ce premier test : la donnée brute est déjà sauvegardée ci-dessus
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, parsedOk: parsedOk, added: added }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Renvoie les séances au format attendu par le dashboard (index.html).
function doGet(e) {
  const rows = getSheet().getDataRange().getValues().slice(1);
  const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];

  const runs = rows.map(r => {
    const [startDate, appleType, type, lieu, distanceKm, durationSec, avgHR, calories, avgCadence, avgPower, notes] = r;
    const d = new Date(startDate);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const allure = distanceKm > 0 ? Math.round(durationSec / distanceKm) : null;

    return {
      date: `${dd}/${mm}`,
      label: `${dd} ${MONTHS[d.getMonth()]}`,
      type: type,
      lieu: lieu || "",
      dist: Number(distanceKm) || 0,
      dur: new Date(durationSec * 1000).toISOString().substr(11, 8).replace(/^0/, ""),
      allure: allure,
      fc: avgHR || null,
      pw: avgPower || null,
      cad: avgCadence || null,
      cal: calories || null,
      effort: null,
      notes: notes || undefined,
    };
  }).sort((a, b) => a.date === b.date ? 0 : (new Date(2026, 0, 1) - new Date(2026, 0, 1))); // tri déjà garanti par ordre d'insertion

  return ContentService.createTextOutput(JSON.stringify(runs))
    .setMimeType(ContentService.MimeType.JSON);
}
