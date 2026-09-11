// ============================================================================
//  BANACRAFT - PALATETŐ BONTÁS, ELSZÁLLÍTÁS, ÚJ TETŐFEDÉS
//
//  Everything this bot knows about its trade: the questions (in order), their
//  buttons, the price model, and the facts the AI may repeat. The shared engine
//  in api/faq-agent.js reads only what is exported here.
//
//  ROOF SIZE - never asked. An owner knows the house's footprint, not the roof
//  area, so the roof is worked out from the footprint and the roof shape:
//  sátortető ×1,2, nyeregtető ×1,35 (Banacraft's own factors). The build year is
//  not asked either - every pala is treated as asbestos-cement.
//
//  PRICING PRINCIPLE - a floor, never a range. Every band answer is priced at
//  its LOWER edge and "Nem tudom" at a modest default, so the number the
//  customer sees can only go UP at the survey, and the assumption behind it is
//  printed next to it. All amounts are NET Ft; the engine adds VAT for private
//  customers.
//
//  THE RATES ARE MARKET-CALIBRATED STARTING POINTS, NOT BANACRAFT'S OWN PRICE
//  LIST (2026 azbeszt palabontás / tetőfedés ranges, Budapest). Replace the
//  numbers in `P` with Banacraft's real rates as soon as they are known.
// ============================================================================

export const BOT = {
    id: "banacraft-palateto",
    service: "azbeszt palatető bontása, elszállítása és új tetőfedés",
    phone: "+36 70 625 2014",
    email: "info@banacraft.hu",
};

// ---------------------------------------------------------------------------
//  PRICES (net Ft) - edit here only
// ---------------------------------------------------------------------------
const P = {
    // Roof surface -> multiplier on the footprint.
    shape: { nyereg: 1.35, sator: 1.2, felnyereg: 1.1, osszetett: 1.45, nem_tudom: 1.2 },
    // Eaves length ≈ factor × √footprint, for the gutter line.
    eaves: { nyereg: 2.6, sator: 4.1, felnyereg: 1.3, osszetett: 4.4, nem_tudom: 2.6 },
    // Price tiers by roof surface: under 100 m², 100–300 m², over 300 m².
    // Removal, packing, transport and licensed disposal, Ft / m² of roof.
    remove: { t1: 5500, t2: 4800, t3: 4200 },
    // Pala already on the ground: packing, loading, transport, disposal.
    haul: { t1: 2800, t2: 2400, t3: 2100 },
    material: { hullam: 1, sik: 1.15, bitumen: 0.75, nem_tudom: 1 },
    layersExtra: 0.12, // more than one layer on the roof
    labourShare: 0.5,  // of the removal rate; the part stairs and tight plots make dearer
    storeys: { f1: 0, f2: 900, f3: 1800 }, // scaffolding, Ft / m² of roof
    access: { ok: 1, reszben: 1.08, szuk: 1.18, nem_tudom: 1 },
    industrial: 1.1,
    newRoof: { cserepeslemez: 13500, trapez: 11000, betoncserep: 17000, keramia: 22000, zsindely: 21000, javaslat: 11000 }, // laths, membrane, covering incl. material, Ft / m²
    insulation: { fodem: 6500, teto: 14000 }, // loft floor per footprint m²; between rafters per roof m²
    extras: { eresz: 9500, badog: 60000, tetoablak: 180000, kemeny: 65000 }, // Ft / fm; from; per db; per db
    truck: { ok: 1, d50: 1.2, nehez: 1.35 },
    sheetState: { egyben: 1, tort: 1.3, csomag: 0.85 },
    haulLabourShare: 0.35,
    min: { bontas: 250000, szallitas: 120000, csere: 900000 },
};

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------
const opt = (label, value, extra) => ({ label, value, ...extra });
const NT = (extra) => opt("Nem tudom", "nem_tudom", extra);
const list = (sel, field) => String(sel[field] || "").split(",").filter(Boolean);
const num = (n) => String(Math.round(n * 100) / 100).replace(".", ",");

function optionOf(field, sel) {
    const f = FIELDS[field];
    const opts = typeof f.options === "function" ? f.options(sel) : f.options;
    return opts.find((o) => o.value === sel[field]) || null;
}
const labelOf = (field, sel) => (optionOf(field, sel) || {}).label || "";

function areaOf(sel, field) {
    const o = optionOf(field, sel);
    if (o && o.area != null) return o.area;
    const n = parseFloat(String(sel[field] || "").replace(",", "."));
    return n > 0 ? n : 0;
}

function topUp(items, min) {
    const sum = items.reduce((s, i) => s + i.amount, 0);
    if (sum < min) items.push({ label: "Kiegészítés a minimális díjig (kiszállás, munkadíj)", amount: min - sum });
    return items;
}

const tier = (m2) => (m2 < 100 ? "t1" : m2 < 300 ? "t2" : "t3");

function materialFactor(sel) {
    const m = list(sel, "material");
    const f = m.map((x) => P.material[x] ?? 1);
    const layers = m.filter((x) => x !== "nem_tudom").length;
    return (f.length ? Math.max(...f) : 1) * (layers > 1 ? 1 + P.layersExtra : 1);
}

// ---------------------------------------------------------------------------
//  QUESTIONS
// ---------------------------------------------------------------------------
const TIMELINE = {
    short: "Kezdés",
    q: "Mikorra szeretné, hogy elkezdjük?",
    hint: "Legfeljebb 3 hónapon belül induló munkákat vállalunk.",
    options: [opt("Amint lehet", "asap"), opt("30 napon belül", "d30"), opt("60 napon belül", "d60"), opt("90 napon belül", "d90")],
};

const AREA_HOUSE = [opt("60 m² alatt", "a_lt60", { area: 45 }), opt("60–100 m²", "a_60_100", { area: 60 }), opt("100–150 m²", "a_100_150", { area: 100 }), opt("150–250 m²", "a_150_250", { area: 150 }), opt("250 m² felett", "a_gt250", { area: 250 }), NT({ area: 70 })];
const AREA_SHED = [opt("20 m² alatt", "s_lt20", { area: 15 }), opt("20–40 m²", "s_20_40", { area: 20 }), opt("40–80 m²", "s_40_80", { area: 40 }), opt("80 m² felett", "s_gt80", { area: 80 }), NT({ area: 25 })];
const AREA_INDUSTRIAL = [opt("100 m² alatt", "g_lt100", { area: 70 }), opt("100–300 m²", "g_100_300", { area: 100 }), opt("300–600 m²", "g_300_600", { area: 300 }), opt("600 m² felett", "g_gt600", { area: 600 }), NT({ area: 150 })];
// Pala on the ground is asked in roof-surface bands directly (Banacraft's own bands).
const AREA_SHEETS = [opt("50 m² alatt", "p_lt50", { area: 35 }), opt("50–100 m²", "p_50_100", { area: 50 }), opt("100–300 m²", "p_100_300", { area: 100 }), opt("300 m² felett", "p_gt300", { area: 300 }), NT({ area: 50 })];

const NEW_ROOF_NAME = {
    cserepeslemez: "cserepeslemez", trapez: "trapézlemez", betoncserep: "betoncserép", keramia: "kerámiacserép",
    zsindely: "bitumenes zsindely", javaslat: "a legkedvezőbb lemezfedés",
};

export const FIELDS = {
    projectType: {
        short: "Szolgáltatás",
        q: "Miben segíthetünk?",
        options: [
            opt("Pala bontása és elszállítása", "bontas"),
            opt("Csak elszállítás - a pala már le van szedve", "szallitas"),
            opt("Pala bontása, elszállítása és új tetőfedés", "csere"),
        ],
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
        q: (sel) => sel.projectType === "szallitas" ? "Milyen anyagot kell elszállítani?" : "Mi van most a tetőn?",
        hint: (sel) => sel.projectType === "szallitas" ? null : "Ha több réteg van egymáson (pl. pala a bitumenes lemez alatt), jelölje be mindet.",
        options: [opt("Hullámpala", "hullam"), opt("Síkpala, palatábla", "sik"), opt("Bitumenes lemez, kátránypapír", "bitumen"), NT()],
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
        type: "area",
        short: "Alapterület",
        q: "Mekkora az épület alapterülete?",
        hint: "Ebből számoljuk ki a tetőfelületet - a tetőt nem kell lemérnie. Konkrét számot is írhat.",
        options: (sel) => sel.building === "mellek" ? AREA_SHED : sel.building === "ipari" ? AREA_INDUSTRIAL : AREA_HOUSE,
        values: [...new Set([...AREA_HOUSE, ...AREA_SHED, ...AREA_INDUSTRIAL].map((o) => o.value))],
    },
    storeys: {
        short: "Magasság",
        q: "Milyen magas az épület?",
        hint: "Ebből tudjuk, milyen állvány kell.",
        options: [opt("Földszintes", "f1"), opt("Földszint és tetőtér", "f2"), opt("Emeletes vagy magasabb", "f3")],
    },
    access: {
        short: "Körbejárhatóság",
        q: "Körbejárható az épület, van hely az állványnak és a teherautónak?",
        options: [opt("Igen, körbejárható", "ok"), opt("Részben, van egy szűk oldal", "reszben"), opt("Nem, nagyon szűk a hely", "szuk"), NT()],
    },
    structure: {
        short: "Tetőszerkezet",
        q: "Milyen állapotban van a tetőszerkezet (gerendák, lécek)?",
        hint: "Nem baj, ha nem tudja - a pontos állapot csak a pala lebontása után látszik.",
        options: [opt("Jónak tűnik", "jo"), opt("Néhol beázik, sérült", "serult"), opt("Rossz, cserélni kell", "rossz"), NT()],
    },
    newRoof: {
        short: "Új fedés",
        q: "Mi legyen az új tetőfedés?",
        options: [
            opt("Cserepeslemez", "cserepeslemez"), opt("Trapézlemez", "trapez"), opt("Betoncserép", "betoncserep"),
            opt("Kerámiacserép", "keramia"), opt("Bitumenes zsindely", "zsindely"), opt("Még nem tudom, kérek javaslatot", "javaslat"),
        ],
    },
    extras: {
        type: "multi",
        short: "Kiegészítők",
        q: "Kell-e még valami a tetőre?",
        options: [opt("Ereszcsatorna csere", "eresz"), opt("Bádogos szegélyek", "badog"), opt("Tetőablak", "tetoablak"), opt("Kéményszegélyezés", "kemeny"), opt("Nem, csak a fedés", "nincs")],
        none: ["nincs"],
    },
    insulation: {
        short: "Hőszigetelés",
        q: "Szeretne hőszigetelést is?",
        options: [opt("Nem kérek", "nem"), opt("Igen, a padlásfödémre", "fodem"), opt("Igen, a tetőtérbe (szarufák közé)", "teto"), opt("Nem tudom, kérek tanácsot", "tanacs")],
    },

    // --- Csak elszállítás ---
    sheetArea: {
        type: "area",
        short: "Pala mennyisége",
        q: "Körülbelül mennyi pala van?",
        hint: "Egy raklapnyi hullámpala nagyjából 40–50 m². Konkrét számot is írhat.",
        options: AREA_SHEETS,
    },
    sheetState: {
        short: "Pala állapota",
        q: "Hogyan van most tárolva a pala?",
        options: [opt("Egymásra rakva, egyben", "egyben"), opt("Összetörve, szétszórva", "tort"), opt("Már be van csomagolva", "csomag")],
        after: (sel) => sel.sheetState === "tort"
            ? "Kérjük, addig ne mozgassa és ne söpörje össze - a törött palából könnyebben szabadulnak ki szálak."
            : null,
    },
    truck: {
        short: "Megközelítés",
        q: "Oda tud állni a teherautó?",
        options: [opt("Igen, közvetlenül mellé", "ok"), opt("20–50 méter hordással", "d50"), opt("Messzebb, nehezen megközelíthető", "nehez")],
    },

    timeline: TIMELINE,
};

export function fieldOrder(sel) {
    const pt = sel.projectType;
    if (!pt) return ["projectType"];
    if (pt === "szallitas") return ["projectType", "material", "sheetArea", "sheetState", "truck", "timeline"];
    const out = ["projectType", "building", "material", "roofShape", "baseArea", "storeys", "access", "structure"];
    if (pt === "csere") out.push("newRoof", "extras");
    out.push("insulation", "timeline");
    return out;
}

export function title(sel) {
    return labelOf("projectType", sel) || "Palatető";
}

// ---------------------------------------------------------------------------
//  QUOTE - returns net amounts; the engine applies VAT and rounding
// ---------------------------------------------------------------------------
const REGION = "Budapesten és kb. 50 km-es körzetében dolgozunk; távolabb kiszállási díj lehet.";

export function buildQuote(sel, { money }) {
    return sel.projectType === "szallitas" ? quoteHaul(sel, money) : quoteRoof(sel, money);
}

function quoteRoof(sel, money) {
    const pt = sel.projectType;
    const A = areaOf(sel, "baseArea");
    const mult = P.shape[sel.roofShape] ?? P.shape.nem_tudom;
    const R = Math.max(1, Math.round(A * mult));
    const t = tier(R);
    const matF = materialFactor(sel);
    const acc = P.access[sel.access] ?? 1;
    const ind = sel.building === "ipari" ? P.industrial : 1;
    const rate = P.remove[t];

    const items = [
        { label: `Pala bontása és csomagolása (kb. ${R} m² tetőfelület)`, amount: R * rate * matF * P.labourShare * acc * ind },
        { label: "Elszállítás és ártalmatlanítás engedélyes lerakóban, dokumentációval", amount: R * rate * matF * (1 - P.labourShare) },
    ];
    const scaffold = P.storeys[sel.storeys] ?? 0;
    if (scaffold) items.push({ label: "Állványozás, leesés elleni védelem", amount: R * scaffold });

    const extras = list(sel, "extras");
    if (pt === "csere") {
        items.push({ label: `Új tetőfedés: lécezés, fólia és ${NEW_ROOF_NAME[sel.newRoof] || "fedés"}, anyaggal (kb. ${R} m²)`, amount: R * (P.newRoof[sel.newRoof] ?? P.newRoof.javaslat) * acc });
        if (extras.includes("eresz")) {
            const fm = Math.round((P.eaves[sel.roofShape] ?? P.eaves.nem_tudom) * Math.sqrt(A));
            items.push({ label: `Ereszcsatorna cseréje (kb. ${fm} fm)`, amount: fm * P.extras.eresz });
        }
        if (extras.includes("badog")) items.push({ label: "Bádogos szegélyek", amount: P.extras.badog });
        if (extras.includes("tetoablak")) items.push({ label: "Tetőablak beépítése (1 db)", amount: P.extras.tetoablak });
        if (extras.includes("kemeny")) items.push({ label: "Kéményszegélyezés (1 db)", amount: P.extras.kemeny });
    }
    if (sel.insulation === "fodem") items.push({ label: `Padlásfödém hőszigetelése (kb. ${Math.round(A)} m²)`, amount: A * P.insulation.fodem });
    if (sel.insulation === "teto") items.push({ label: `Tetőtér hőszigetelése a szarufák között (kb. ${R} m²)`, amount: R * P.insulation.teto });
    topUp(items, P.min[pt] ?? P.min.bontas);

    const ex = [];
    const shapeName = (labelOf("roofShape", sel) || "").replace(/\s*\(.*\)$/, "").toLowerCase();
    ex.push(`A becslés **kb. ${R} m²** tetőfelülettel számol: ${Math.round(A)} m² alapterület × ${num(mult)}${sel.roofShape === "nem_tudom" ? " (a tetőforma nem ismert)" : ` (${shapeName})`}${sel.baseArea === "nem_tudom" ? ", becsült alapterülettel" : ""}. A pontos felületet a felmérésen mérjük le.`);
    ex.push("A tetőszerkezet (gerendák, lécek, deszkázat) állapota csak a pala lebontása után látszik - az esetleges javítást előre egyeztetjük, és csak jóváhagyás után végezzük el.");
    if (list(sel, "material").includes("nem_tudom")) ex.push("Ha a tetőn több réteg van egymáson, felár.");
    if (pt === "bontas") ex.push("Új tetőfedés: ha kéri, a bontással egy ütemben elkészítjük, hogy ne maradjon nyitva a tető - erre külön ajánlatot adunk.");
    if (pt === "csere") {
        if (sel.newRoof === "javaslat") ex.push("Az új fedés anyagát a felmérésen választjuk ki; az alapár a legkedvezőbb lemezfedéssel számol.");
        if (sel.newRoof === "betoncserep" || sel.newRoof === "keramia") ex.push("Cserépfedésnél a tetőszerkezet teherbírását a felmérésen ellenőrizzük; megerősítés esetén felár.");
        if (extras.includes("eresz")) ex.push("Az ereszcsatorna a tényleges hossz szerint, lefolyócsövekkel együtt.");
        if (extras.includes("badog")) ex.push("A bádogos szegélyek a tényleges hossz szerint.");
        if (extras.includes("tetoablak")) ex.push("Tetőablak: az ár típustól és mérettől függ; további ablak darabonként.");
        if (!extras.length || extras.includes("nincs")) ex.push("Bádogos munka (ereszcsatorna, szegélyek, kéményszegély) külön tétel, ha szükséges.");
    }
    if (sel.insulation === "tanacs") ex.push(`Hőszigetelés: a felmérésen javaslatot adunk (padlásfödémre ${money(P.insulation.fodem)}/m²-től).`);
    if (sel.storeys === "f3") ex.push("Magasabb épületnél emelőgép bérlése szükséges lehet.");
    if (sel.access === "nem_tudom") ex.push("Ha az épület nem járható körbe, az állvány és a konténer elhelyezése felárral jár.");
    if (sel.building === "tarsashaz") ex.push("Társasháznál a közös képviselő hozzájárulása szükséges.");
    ex.push(REGION);

    const flags = [];
    if (sel.structure === "serult" || sel.structure === "rossz") {
        flags.push("Ön jelezte, hogy a tetőszerkezet sérült - a javítása várhatóan külön tétel lesz, ezt a bontás után pontosan felmérjük.");
    }
    if (sel.access === "szuk") flags.push("Nagyon szűk helyen az állványozás és az anyagmozgatás egyedi megoldást igényel, ezt a felmérésen nézzük meg.");

    return {
        title: title(sel),
        items,
        includes: "a pala óvatos, törésmentes bontását, előírás szerinti csomagolását, rakodását, elszállítását, ártalmatlanítását engedélyes helyen, a dokumentációt és a terület takarítását" +
            (pt === "csere" ? ", valamint az új tetőfedést lécezéssel és fóliával tartalmazza" : " tartalmazza"),
        exclusions: ex,
        flags,
    };
}

function quoteHaul(sel, money) {
    const S = areaOf(sel, "sheetArea");
    const t = tier(S);
    const matF = materialFactor(sel);
    const rate = P.haul[t];
    const state = P.sheetState[sel.sheetState] ?? 1;
    const truck = P.truck[sel.truck] ?? 1;

    const items = [
        { label: "Előírás szerinti csomagolás és rakodás", amount: S * rate * matF * P.haulLabourShare * state * truck },
        { label: `Elszállítás és ártalmatlanítás engedélyes lerakóban, dokumentációval (kb. ${Math.round(S)} m²)`, amount: S * rate * matF * (1 - P.haulLabourShare) },
    ];
    topUp(items, P.min.szallitas);

    const ex = [
        `A becslés **kb. ${Math.round(S)} m²** palával számol${sel.sheetArea === "nem_tudom" ? " (nem tudta pontosan)" : ""}; több anyagnál négyzetméterenként ${money(rate * matF)}.`,
    ];
    if (sel.truck === "nehez") ex.push("50 méternél hosszabb vagy nehéz terepen történő hordásnál a felmérés szerint felár.");
    ex.push(REGION);

    const flags = [];
    if (sel.sheetState === "tort") flags.push("Törött pala esetén kérjük, ne mozgassa és ne söpörje össze - a csomagolást mi végezzük, védőfelszerelésben.");

    return {
        title: title(sel),
        items,
        includes: "a pala előírás szerinti csomagolását, rakodását, elszállítását és ártalmatlanítását engedélyes helyen, dokumentációval tartalmazza",
        exclusions: ex,
        flags,
    };
}

// ---------------------------------------------------------------------------
//  SANITY SCENARIOS - test-flow.mjs clicks these through and prints the price.
//  min/max are loose market envelopes (gross Ft for private customers).
// ---------------------------------------------------------------------------
export const TEST_SCENARIOS = [
    {
        name: "Családi ház 100–150 m², nyeregtető, hullámpala, földszintes: bontás + elszállítás",
        answers: {
            projectType: "Pala bontása és elszállítása", building: "Családi ház", material: ["Hullámpala"], roofShape: "Nyeregtető (két ferde oldal)",
            baseArea: "100–150 m²", storeys: "Földszintes", access: "Igen, körbejárható", structure: "Jónak tűnik", insulation: "Nem kérek", timeline: "30 napon belül",
        },
        min: 400000, max: 2000000,
    },
    {
        name: "Csere: 60–100 m² sátortető, hullámpala + bitumen, tetőtér, szűk oldal, cserepeslemez + eresz + kémény, födémszigetelés",
        answers: {
            projectType: "Pala bontása, elszállítása és új tetőfedés", building: "Családi ház", material: ["Hullámpala", "Bitumenes lemez, kátránypapír"],
            roofShape: "Sátortető (négy ferde oldal)", baseArea: "60–100 m²", storeys: "Földszint és tetőtér", access: "Részben, van egy szűk oldal",
            structure: "Néhol beázik, sérült", newRoof: "Cserepeslemez", extras: ["Ereszcsatorna csere", "Kéményszegélyezés"], insulation: "Igen, a padlásfödémre",
            timeline: "Amint lehet",
        },
        min: 1500000, max: 7000000,
    },
    {
        name: "Csak elszállítás, 100–300 m², törött",
        answers: { projectType: "Csak elszállítás - a pala már le van szedve", material: ["Hullámpala"], sheetArea: "100–300 m²", sheetState: "Összetörve, szétszórva", truck: "Igen, közvetlenül mellé", timeline: "60 napon belül" },
        min: 200000, max: 1500000,
    },
    {
        name: "Melléképület 20–40 m², félnyereg, síkpala (minimális díj)",
        answers: {
            projectType: "Pala bontása és elszállítása", building: "Melléképület, garázs, ól", material: ["Síkpala, palatábla"], roofShape: "Félnyereg vagy lapos tető",
            baseArea: "20–40 m²", storeys: "Földszintes", access: "Igen, körbejárható", structure: "Nem tudom", insulation: "Nem kérek", timeline: "90 napon belül",
        },
        min: 250000, max: 800000,
    },
    {
        name: "Ipari csarnok 600 m² felett, nyeregtető, emeletes magasság (cég, nettó)",
        answers: {
            projectType: "Pala bontása és elszállítása", building: "Ipari vagy mezőgazdasági épület", material: ["Hullámpala"], roofShape: "Nyeregtető (két ferde oldal)",
            baseArea: "600 m² felett", storeys: "Emeletes vagy magasabb", access: "Igen, körbejárható", structure: "Jónak tűnik", insulation: "Nem kérek", timeline: "30 napon belül",
        },
        customer: "Cég",
        min: 3000000, max: 12000000,
    },
];

// ---------------------------------------------------------------------------
//  WHAT THE AI MAY SAY ABOUT THE COMPANY (from the Banacraft palatető site)
// ---------------------------------------------------------------------------
export const KNOWLEDGE = `- Régi hullámpala és síkpala bontása, elszállítása és új tetőfedés, engedéllyel, egy kézből. Budapest és kb. 50 km-es körzete.
- A veszélyes hulladék kezelésére saját engedélyünk van: nem adjuk tovább alvállalkozónak, és a dokumentáció megfelel a hazai előírásoknak.
- A folyamat: ingyenes helyszíni felmérés; a pala óvatos, törésmentes bontása a por- és szálképződés minimalizálásával; előírás szerinti csomagolás; rakodás és elszállítás (konténert sem kell rendelni); ártalmatlanítás kizárólag engedéllyel rendelkező, kijelölt helyen; igazolás a bontásról és az ártalmatlanításról; a terület megtisztítása; átadás.
- Ha kéri, a bontással egy ütemben beépítjük az új tetőfedést, így nem marad nyitva a tető. Hőszigetelést (padlásfödém vagy tetőtér), ereszcsatornát, bádogos szegélyeket, kéményszegélyt és tetőablakot is vállalunk.
- Az ár függ: a tető méretétől és állapotától, a megközelíthetőségtől, az elszállítandó mennyiségtől, a választott új héjazattól, a bádogozástól és a kiegészítőktől.
- Előre nem látható tetőszerkezeti javítást a felmérésen jelzünk, és csak egyeztetés után végzünk el.
- Pontos árat a helyszíni felmérés után, tételes ajánlatban adunk. A felmérés ingyenes és kötelezettség nélküli; aznap visszajelzünk és időpontot egyeztetünk.
- Az azbeszt a WHO és a Nemzetközi Rákkutató Ügynökség (IARC) szerint bizonyítottan rákkeltő (1. csoport): tüdőrákot, mezoteliómát és azbesztózist okozhat; nincs ismert biztonságos határérték, a tünetek gyakran csak évtizedekkel később jelentkeznek. Ez általános tájékoztatás, nem az ügyfél tetejére vonatkozó szakvélemény.
- Amíg a pala ép és bolygatatlan, a kockázat alacsonyabb. Az öregedés, mállás, törés, fúrás, vágás, csavarozás és különösen a nagynyomású mosás szálakat szabadíthat fel - a magasnyomású mosás a legrosszabb, amit a palával tenni lehet.
- Az ügyfélnek soha ne javasold, hogy maga bontsa, vágja, fúrja, mossa vagy mozgassa a palát.
- Felelősségbiztosítással dolgozunk, garanciát vállalunk, írásos ajánlatot és számlát adunk.`;
