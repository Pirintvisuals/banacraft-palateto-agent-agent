// ============================================================================
//  BANACRAFT - PALATETŐ BONTÁS, ELSZÁLLÍTÁS, ÚJ TETŐFEDÉS
//
//  Everything this bot knows about its trade: the questions (in order), their
//  buttons, the price model, and the facts the AI may repeat. The shared engine
//  in api/faq-agent.js reads only what is exported here.
//
//  PRICES ARE BANACRAFT'S OWN (Róbert, 2026-10-30 and 2026-11-05):
//   - removal and haulage per m² of roof in three tiers, Budapest prices; Pest
//     megye +10%, the surrounding counties +20%; a minimum billed area per region
//   - bitumen shingle on top +800 Ft/m²
//   - new covering only 38 000 Ft/m², whole new roof 60 000 Ft/m² (tinsmith work
//     included), insulation between rafters 16 900 Ft/m²
//  Over 200 m², industrial roofs, pala already on the ground and anything further
//  out get a call instead of a price.
//
//  ROOF SIZE - never asked. An owner knows the house's footprint, not the roof
//  area, so the roof is worked out from the footprint and the roof shape
//  (sátortető ×1,2, nyeregtető ×1,35 - Banacraft's own factors).
//
//  All amounts are NET Ft; the engine adds VAT for private customers.
// ============================================================================

export const BOT = {
    id: "banacraft-palateto",
    service: "azbeszt palatető bontása, elszállítása és új tetőfedés",
    phone: "+36 70 625 2014",
    email: "info@banacraft.hu",
    maxStartDays: 60,
};

// ---------------------------------------------------------------------------
//  PRICES (net Ft) - edit here only
// ---------------------------------------------------------------------------
const P = {
    // Removal + packing + haulage + licensed disposal, Ft / m² of roof:
    // up to 50 m², 50–100 m², over 100 m².
    remove: { t1: 6990, t2: 4400, t3: 3790 },
    region: { bp: 1, pest: 1.1, kornyek: 1.2 },
    minM2: { bp: 30, pest: 50, kornyek: 100 },
    customAboveM2: 200,
    shingle: 800, // bitumen shingle on top of the pala, Ft / m²
    newRoof: { hejazat: 38000, teljes: 60000 },
    insulation: 16900,
    // Roof surface -> multiplier on the footprint.
    shape: { nyereg: 1.35, sator: 1.2, felnyereg: 1.1, osszetett: 1.45, nem_tudom: 1.2 },
};

// Removal for a roof of m2 square metres. A bigger roof never costs less than
// the top of the tier below (agreed with Róbert 2026-11-05): charged per tier as
// given, 51 m² would come out cheaper than 50 m².
function removalNet(m2) {
    const r = P.remove;
    if (m2 <= 50) return m2 * r.t1;
    if (m2 <= 100) return Math.max(m2 * r.t2, 50 * r.t1);
    return Math.max(m2 * r.t3, 100 * r.t2);
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const opt = (label, value, extra) => ({ label, value, ...extra });
const NT = (extra) => opt("Nem tudom", "nem_tudom", extra);
const list = (sel, field) => String(sel[field] || "").split(",").filter(Boolean);
const num = (n) => String(Math.round(n * 100) / 100).replace(".", ",");
const ft = (n) => Math.round(n).toLocaleString("hu-HU").replace(/\s/g, " ") + " Ft";

function optionOf(field, sel) {
    const f = FIELDS[field];
    const opts = typeof f.options === "function" ? f.options(sel) : f.options;
    return opts.find((o) => o.value === sel[field]) || null;
}
const labelOf = (field, sel) => (optionOf(field, sel) || {}).label || "";

function numberOf(sel, field) {
    const o = optionOf(field, sel);
    if (o && o.n != null) return o.n;
    const n = parseFloat(String(sel[field] || "").replace(",", "."));
    return n > 0 ? n : 0;
}

const roofArea = (sel) => Math.max(1, Math.round(numberOf(sel, "baseArea") * (P.shape[sel.roofShape] ?? P.shape.nem_tudom)));

// ---------------------------------------------------------------------------
//  QUESTIONS
// ---------------------------------------------------------------------------
const AREA_HOUSE = [opt("60 m² alatt", "a_lt60", { n: 45 }), opt("60–100 m²", "a_60_100", { n: 60 }), opt("100–150 m²", "a_100_150", { n: 100 }), opt("150 m² felett", "a_gt150", { n: 150 }), NT({ n: 70 })];
const AREA_SHED = [opt("20 m² alatt", "s_lt20", { n: 15 }), opt("20–40 m²", "s_20_40", { n: 20 }), opt("40–80 m²", "s_40_80", { n: 40 }), opt("80 m² felett", "s_gt80", { n: 80 }), NT({ n: 25 })];

export const FIELDS = {
    projectType: {
        short: "Szolgáltatás",
        q: "Miben segíthetünk?",
        options: [
            opt("Pala bontása és elszállítása", "bontas"),
            opt("Pala bontása, elszállítása és új tetőfedés", "csere"),
            opt("Csak elszállítás - a pala már le van szedve", "szallitas"),
        ],
    },
    region: {
        short: "Helyszín",
        q: "Hol van az épület?",
        hint: "Pest környéki megye: Nógrád, Heves, Jász-Nagykun-Szolnok, Bács-Kiskun, Fejér, Komárom-Esztergom.",
        options: [opt("Budapest", "bp"), opt("Pest megye", "pest"), opt("Pest környéki megye", "kornyek"), opt("Távolabb", "tavol")],
    },
    building: {
        short: "Épület",
        q: "Milyen épület tetejéről van szó?",
        options: [
            opt("Családi ház", "haz"), opt("Melléképület, garázs, ól", "mellek"), opt("Nyaraló", "nyaralo"),
            opt("Társasház", "tarsashaz"), opt("Ipari vagy mezőgazdasági épület", "ipari"),
        ],
    },
    material: {
        type: "multi",
        short: "Anyag",
        q: "Mi van most a tetőn?",
        hint: "Ha több réteg van egymáson (pl. bitumenes zsindely a palán), jelölje be mindet.",
        options: [opt("Hullámpala", "hullam"), opt("Síkpala, palatábla", "sik"), opt("Bitumenes zsindely vagy lemez a palán", "bitumen"), NT()],
        none: ["nem_tudom"],
    },
    roofShape: {
        short: "Tetőforma",
        q: "Milyen formájú a tető?",
        options: [
            opt("Nyeregtető (két ferde oldal)", "nyereg"), opt("Sátortető (négy ferde oldal)", "sator"),
            opt("Félnyereg vagy lapos tető", "felnyereg"), opt("Összetett, több síkú", "osszetett"), NT(),
        ],
    },
    baseArea: {
        type: "number",
        unit: "m²",
        short: "Alapterület",
        q: "Mekkora az épület alapterülete?",
        hint: "Ebből számoljuk ki a tetőfelületet - a tetőt nem kell lemérnie.",
        options: (sel) => sel.building === "mellek" ? AREA_SHED : AREA_HOUSE,
        values: [...new Set([...AREA_HOUSE, ...AREA_SHED].map((o) => o.value))],
    },
    loft: {
        short: "Padlás",
        q: "Be lehet jutni belülről a padlásra vagy a tetőtérbe?",
        hint: "Ha nem, állványozás kell - azt egyedileg árazzuk.",
        options: [opt("Igen", "igen"), opt("Nem", "nem"), NT()],
    },
    newRoof: {
        short: "Új fedés",
        q: "Milyen tetőmunka kell a bontás után?",
        options: [
            opt("Csak új héjazat (új lécezéssel, fóliával)", "hejazat"),
            opt("Teljes tetőcsere, bádogos munkával együtt", "teljes"),
            opt("Még nem tudom, kérek javaslatot", "javaslat"),
        ],
    },
    insulation: {
        short: "Hőszigetelés",
        q: "Szeretne hőszigetelést is a szarufák közé?",
        options: [opt("Nem kérek", "nem"), opt("Igen, kérek", "igen")],
    },
    timeline: {
        short: "Kezdés",
        q: "Mikorra szeretné, hogy elkezdjük?",
        hint: "Legfeljebb 60 napon belül induló munkákat vállalunk.",
        options: [opt("Amint lehet", "asap"), opt("30 napon belül", "d30"), opt("60 napon belül", "d60")],
    },
};

export function fieldOrder(sel) {
    const pt = sel.projectType;
    if (!pt) return ["projectType"];
    if (sel.region === "tavol") return ["projectType", "region", "timeline"];
    if (pt === "szallitas") return ["projectType", "region", "material", "timeline"];
    const out = ["projectType", "region", "building"];
    if (sel.building === "ipari") return [...out, "timeline"];
    out.push("material", "roofShape", "baseArea", "loft");
    if (pt === "csere") out.push("newRoof", "insulation");
    out.push("timeline");
    return out;
}

export function title(sel) {
    return labelOf("projectType", sel) || "Palatető";
}

// ---------------------------------------------------------------------------
//  QUOTE
// ---------------------------------------------------------------------------
export function callReason(sel) {
    if (sel.region === "tavol") return "Távolabbi helyszínre a munka méretétől függően megyünk ki - ezt kollégánk telefonon egyezteti Önnel.";
    if (sel.projectType === "szallitas") return "A már leszedett pala elszállításának ára a mennyiségtől és az állapotától függ, ezért ezt kollégánk egyedileg árazza.";
    if (sel.building === "ipari") return "Ipari és mezőgazdasági épületek tetejére egyedi ajánlatot adunk.";
    if (sel.baseArea && roofArea(sel) > P.customAboveM2) return `Ekkora tetőnél (kb. ${roofArea(sel)} m²) egyedi ajánlatot adunk.`;
    return null;
}

export function ownerNotes(sel) {
    if (!sel.baseArea || sel.region === "tavol") return [];
    const R = roofArea(sel);
    const k = P.region[sel.region] ?? 1;
    return [`Kb. ${R} m² tető. Bontás + elszállítás a tarifával: ${ft(removalNet(R) * k)} + ÁFA (régiós szorzóval, minimum nélkül).`];
}

const REGION_TEXT = "Budapesten, Pest megyében és a környező megyékben dolgozunk; nagyobb munkára távolabb is kimegyünk.";

export function buildQuote(sel, { money }) {
    const pt = sel.projectType;
    const region = sel.region || "bp";
    const k = P.region[region];
    const A = numberOf(sel, "baseArea");
    const mult = P.shape[sel.roofShape] ?? P.shape.nem_tudom;
    const R = roofArea(sel);
    const billed = Math.max(R, P.minM2[region]);
    const material = list(sel, "material");

    const regionNote = k > 1 ? ` (${region === "pest" ? "Pest megye +10%" : "környező megye +20%"})` : "";
    const items = [{
        label: `Pala bontása, csomagolása, elszállítása és ártalmatlanítása, dokumentációval (${billed > R ? `minimum ${billed} m²` : `kb. ${R} m²`})${regionNote}`,
        amount: removalNet(billed) * k,
    }];
    if (material.includes("bitumen")) items.push({ label: `Bitumenes réteg bontása a palán (kb. ${R} m²)`, amount: R * P.shingle * k });
    if (pt === "csere") {
        const full = sel.newRoof === "teljes";
        items.push({
            label: full ? `Teljes tetőcsere bádogos munkával, anyaggal (kb. ${R} m²)` : `Új héjazat új lécezéssel és fóliával, anyaggal (kb. ${R} m²)`,
            amount: R * P.newRoof[full ? "teljes" : "hejazat"] * k,
        });
        if (sel.insulation === "igen") items.push({ label: `Hőszigetelés a szarufák között (kb. ${R} m²)`, amount: R * P.insulation * k });
    }

    const ex = [];
    const shapeName = (labelOf("roofShape", sel) || "").replace(/\s*\(.*\)$/, "").toLowerCase();
    ex.push(`A becslés **kb. ${R} m²** tetőfelülettel számol: ${Math.round(A)} m² alapterület × ${num(mult)}${sel.roofShape === "nem_tudom" ? " (a tetőforma nem ismert)" : ` (${shapeName})`}${sel.baseArea === "nem_tudom" ? ", becsült alapterülettel" : ""}. A pontos felületet a felmérésen mérjük le.`);
    if (billed > R) ex.push(`Ezen a helyszínen a legkisebb elszámolt tetőfelület ${billed} m².`);
    if (sel.loft !== "igen") ex.push("Ha a padlás belülről nem járható, állványozás kell - ennek ára egyedi.");
    ex.push("A tetőszerkezet (gerendák, lécek, deszkázat) állapota csak a pala lebontása után látszik - az esetleges javítást előre egyeztetjük, és csak jóváhagyás után végezzük el.");
    if (material.includes("nem_tudom")) ex.push(`Ha a palán bitumenes réteg is van, annak bontása ${money(P.shingle * k)}/m².`);
    if (pt === "bontas") ex.push(`Új tetőfedés, ha kéri, a bontással egy ütemben: új héjazat ${money(P.newRoof.hejazat * k)}/m²-től.`);
    if (pt === "csere") {
        if (sel.newRoof === "javaslat") ex.push("Az új fedést a felmérésen választjuk ki; az alapár az új héjazattal számol. Teljes tetőcserénél (bádogos munkával) " + `${money(P.newRoof.teljes * k)}/m².`);
        ex.push("Bitumenes zsindely fedésnél OSB-borítás kell alá - ezt a felmérésen egyeztetjük.");
        if (sel.newRoof !== "teljes") ex.push("Bádogos munka (ereszcsatorna, szegélyek) a teljes tetőcserében benne van; csak új héjazatnál a felmérés szerint.");
        if (sel.insulation !== "igen") ex.push(`Hőszigetelés a szarufák közé, ha kéri: ${money(P.insulation * k)}/m².`);
    }
    if (sel.building === "tarsashaz") ex.push("Társasháznál a közös képviselő hozzájárulása szükséges.");
    ex.push(REGION_TEXT);

    return {
        title: title(sel),
        items,
        includes: "a pala óvatos, törésmentes bontását, előírás szerinti csomagolását, rakodását, elszállítását, ártalmatlanítását engedélyes helyen, a dokumentációt és a terület takarítását" +
            (pt === "csere" ? ", valamint az új tetőfedést tartalmazza" : " tartalmazza"),
        exclusions: ex,
        flags: [],
    };
}

// ---------------------------------------------------------------------------
//  SANITY SCENARIOS - test-flow.mjs clicks these through. min/max are the exact
//  expected total, worked out by hand from Róbert's rates. The engine adds 27%
//  VAT for private customers and rounds each line to 1 000 Ft.
// ---------------------------------------------------------------------------
export const TEST_SCENARIOS = [
    {
        // 100 × 1,35 = 135 m² roof: tier 3, 135 × 3 790 = 511 650 → 650 000
        name: "Budapesti családi ház 100–150 m², nyeregtető, hullámpala: bontás",
        answers: {
            projectType: "Pala bontása és elszállítása", region: "Budapest", building: "Családi ház", material: ["Hullámpala"],
            roofShape: "Nyeregtető (két ferde oldal)", baseArea: "100–150 m²", loft: "Igen", timeline: "30 napon belül",
        },
        min: 650000, max: 650000,
    },
    {
        // 15 × 1,1 = 17 m² roof, Pest megye minimum 50 m²: 50 × 6 990 × 1,1 = 384 450 → 488 000
        name: "Pest megyei melléképület 20 m² alatt (minimum terület)",
        answers: {
            projectType: "Pala bontása és elszállítása", region: "Pest megye", building: "Melléképület, garázs, ól", material: ["Síkpala, palatábla"],
            roofShape: "Félnyereg vagy lapos tető", baseArea: "20 m² alatt", loft: "Igen", timeline: "60 napon belül",
        },
        min: 488000, max: 488000,
    },
    {
        // 60 × 1,2 = 72 m² roof, tier 2 but not below 50 m² at tier 1: max(316 800, 349 500) = 349 500 → 444 000
        // bitumen 72 × 800 = 57 600 → 73 000; héjazat 72 × 38 000 = 2 736 000 → 3 475 000;
        // insulation 72 × 16 900 = 1 216 800 → 1 545 000
        name: "Csere: budapesti ház 60–100 m², sátortető, pala + bitumen, új héjazat, hőszigetelés",
        answers: {
            projectType: "Pala bontása, elszállítása és új tetőfedés", region: "Budapest", building: "Családi ház",
            material: ["Hullámpala", "Bitumenes zsindely vagy lemez a palán"], roofShape: "Sátortető (négy ferde oldal)", baseArea: "60–100 m²",
            loft: "Nem", newRoof: "Csak új héjazat (új lécezéssel, fóliával)", insulation: "Igen, kérek", timeline: "Amint lehet",
        },
        min: 5537000, max: 5537000,
    },
    {
        // 150 × 1,45 = 218 m² > 200 → call
        name: "Összetett tető 150 m² felett (egyedi ajánlat)",
        answers: {
            projectType: "Pala bontása és elszállítása", region: "Budapest", building: "Családi ház", material: ["Hullámpala"],
            roofShape: "Összetett, több síkú", baseArea: "150 m² felett", loft: "Igen", timeline: "30 napon belül",
        },
        call: true,
    },
    {
        name: "Csak elszállítás (egyedi ajánlat)",
        answers: { projectType: "Csak elszállítás - a pala már le van szedve", region: "Budapest", material: ["Hullámpala"], timeline: "30 napon belül" },
        call: true,
    },
];

// ---------------------------------------------------------------------------
//  WHAT THE AI MAY SAY ABOUT THE COMPANY (from the Banacraft palatető site)
// ---------------------------------------------------------------------------
export const KNOWLEDGE = `- Régi hullámpala és síkpala bontása, elszállítása és új tetőfedés, engedéllyel, egy kézből. Budapesten, Pest megyében és a környező megyékben; nagyobb munkára távolabb is.
- A veszélyes hulladék kezelésére saját engedélyünk van: nem adjuk tovább alvállalkozónak, és a dokumentáció megfelel a hazai előírásoknak.
- A folyamat: ingyenes helyszíni felmérés; a pala óvatos, törésmentes bontása a por- és szálképződés minimalizálásával; előírás szerinti csomagolás; rakodás és elszállítás (konténert sem kell rendelni); ártalmatlanítás kizárólag engedéllyel rendelkező, kijelölt helyen; igazolás a bontásról és az ártalmatlanításról; a terület megtisztítása; átadás.
- Ha kéri, a bontással egy ütemben beépítjük az új tetőfedést, így nem marad nyitva a tető: új héjazat új lécezéssel, vagy teljes tetőcsere bádogos munkával. Bitumenes zsindely alá OSB-borítás kell. A szarufák közé hőszigetelést is vállalunk.
- Az ár függ: a tető méretétől, a helyszíntől, attól, van-e bitumenes réteg a palán, és a választott új fedéstől.
- 200 m² feletti, ipari vagy mezőgazdasági tetőkre, és a már leszedett pala elszállítására egyedi ajánlatot adunk.
- Előre nem látható tetőszerkezeti javítást a felmérésen jelzünk, és csak egyeztetés után végzünk el.
- Pontos árat a helyszíni felmérés után, tételes ajánlatban adunk. A felmérés ingyenes és kötelezettség nélküli; aznap visszajelzünk és időpontot egyeztetünk.
- Az azbeszt a WHO és a Nemzetközi Rákkutató Ügynökség (IARC) szerint bizonyítottan rákkeltő (1. csoport): tüdőrákot, mezoteliómát és azbesztózist okozhat; nincs ismert biztonságos határérték, a tünetek gyakran csak évtizedekkel később jelentkeznek. Ez általános tájékoztatás, nem az ügyfél tetejére vonatkozó szakvélemény.
- Amíg a pala ép és bolygatatlan, a kockázat alacsonyabb. Az öregedés, mállás, törés, fúrás, vágás, csavarozás és különösen a nagynyomású mosás szálakat szabadíthat fel - a magasnyomású mosás a legrosszabb, amit a palával tenni lehet.
- Az ügyfélnek soha ne javasold, hogy maga bontsa, vágja, fúrja, mossa vagy mozgassa a palát.
- Felelősségbiztosítással dolgozunk, garanciát vállalunk, írásos ajánlatot és számlát adunk.`;
