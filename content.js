// Standard Cyrillic: Bulgarian text in the standard Cyrillic letter shapes,
// т, д, г, и, п as in print, not the handwritten shapes m, g, s, u, n.
//
// The handwritten shapes reach a page in one of two ways, and each has its
// own fix:
//
// 1. A font that has them as alternates, OpenType's locl feature, which the
//    browser turns on for text marked as Bulgarian (lang="bg"), as many
//    Google Fonts do: the feature is turned off for Bulgarian text.
// 2. A web font whose own Cyrillic letters are the handwritten shapes, as a
//    newspaper's custom font may be: found by its т being as wide as its m,
//    which no standard т is; then the Cyrillic letters of that font alone
//    are drawn from IBM Plex Sans or IBM Plex Serif, sized to the font's
//    x-height, and its Latin letters, digits and icons are left as they are.

const CYRILLIC = "U+0400-04FF";
const LOCL_STYLE = "standard-cyrillic-locl";
// A т at least this wide against the m is the handwritten one: the same
// glyph as m, or nearly; a standard т is about 0.5 to 0.65 of an m
const HANDWRITTEN_RATIO = 0.85;
// Fonts of icons, whose letters are pictures, never touched
const ICON_FONT = /icon|awesome|symbol|material|glyph|emoji/i;

let enabled = false;
const checked = new Set(); // family|weight|style|stretch, measured once
const added = []; // The FontFaces this script added, to take out if turned off
const replaced = new Set(); // The families whose Cyrillic is replaced
const bytes = new Map(); // The Plex files read, by name

function key(face) {
    return [face.family, face.weight, face.style, face.stretch].join("|");
}

function unquoted(family) {
    return family.replace(/^["']|["']$/g, "");
}

// The weight of a face as a number, the middle of a range
function weightOf(face) {
    const w = String(face.weight).trim();
    if (w === "normal") return 400;
    if (w === "bold") return 700;
    const parts = w.split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    return parts.length === 0 ? 400 : (parts[0] + parts[parts.length - 1]) / 2;
}

function italic(face) {
    return /italic|oblique/.test(face.style);
}

// The weights of the face, as a range, low to high
function weightRange(face) {
    const w = String(face.weight).trim();
    if (w === "normal") return [400, 400];
    if (w === "bold") return [700, 700];
    const parts = w.split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
    return parts.length === 0 ? [400, 400] : [parts[0], parts[parts.length - 1]];
}

// The weights of the face, each band with the Plex weight that draws it: one
// for a face of one weight; for a variable face of a range of weights, as
// many Google Fonts are, a band for each Plex weight it reaches, so that its
// bold text is not drawn in one weight from the middle of the range
const PLEX_WEIGHTS = [
    [1, 349, 300],
    [350, 549, 400],
    [550, 649, 600],
    [650, 1000, 700],
];

function weightBands(face) {
    const [lo, hi] = weightRange(face);
    if (lo === hi) return [[String(face.weight), lo]];
    return PLEX_WEIGHTS.filter(([a, b]) => b >= lo && a <= hi).map(([a, b, w]) => [
        `${Math.max(a, lo)} ${Math.min(b, hi)}`,
        w,
    ]);
}

// The Plex file nearest the face: serif when its name says serif and not
// sans, else sans; Light, Regular, SemiBold or Bold; italic or upright
function plexFile(face, w) {
    const family = unquoted(face.family);
    const serif = /serif/i.test(family) && !/sans/i.test(family);
    const weight = w < 350 ? "Light" : w < 550 ? "Regular" : w < 650 ? "SemiBold" : "Bold";
    let name = weight + (italic(face) ? "Italic" : "");
    if (name === "RegularItalic") name = "Italic";
    return `Plex${serif ? "Serif" : "Sans"}-${name}.woff2`;
}

async function plexBytes(file) {
    if (!bytes.has(file)) {
        bytes.set(
            file,
            fetch(chrome.runtime.getURL(`fonts/${file}`)).then((r) => r.arrayBuffer()),
        );
    }
    return bytes.get(file);
}

function canvasFont(face, family) {
    return `${italic(face) ? "italic" : "normal"} ${Math.round(weightOf(face))} 100px "${family}"`;
}

// The width of т against m, and the height of х, in the face
function measure(face, family) {
    const context = document.createElement("canvas").getContext("2d");
    context.font = canvasFont(face, family);
    const t = context.measureText("т").width;
    const m = context.measureText("m").width;
    const x = context.measureText("х").actualBoundingBoxAscent;
    return { ratio: m > 0 ? t / m : 0, xHeight: x };
}

// The face's Cyrillic drawn from Plex, if its т is the handwritten one
async function check(face) {
    if (!enabled || face.status !== "loaded" || added.includes(face)) return;
    const family = unquoted(face.family);
    if (ICON_FONT.test(family) || checked.has(key(face))) return;
    checked.add(key(face));
    const { ratio, xHeight } = measure(face, family);
    if (ratio < HANDWRITTEN_RATIO) return;
    // Plex's x-height measured under a name of its own, so that the letters
    // put in are as tall as the font's own
    const probeFile = plexFile(face, weightOf(face));
    const probeFamily = `standard-cyrillic-probe-${probeFile}`;
    const probe = new FontFace(probeFamily, (await plexBytes(probeFile)).slice(0), {
        weight: String(Math.round(weightOf(face))),
        style: italic(face) ? "italic" : "normal",
    });
    await probe.load();
    document.fonts.add(probe);
    const plex = measure(face, probeFamily);
    document.fonts.delete(probe);
    const scale =
        plex.xHeight > 0 && xHeight > 0
            ? Math.min(1.25, Math.max(0.8, xHeight / plex.xHeight))
            : 1;
    for (const [weight, plexWeight] of weightBands(face)) {
        if (!enabled) return;
        // The family and the other descriptors of the font's own face: of two
        // faces that match, the one added last is asked first for the letters
        // of its range
        const cyrillic = new FontFace(face.family, (await plexBytes(plexFile(face, plexWeight))).slice(0), {
            weight,
            style: face.style,
            stretch: face.stretch,
            unicodeRange: CYRILLIC,
            sizeAdjust: `${(scale * 100).toFixed(1)}%`,
        });
        await cyrillic.load();
        if (!enabled) return;
        document.fonts.add(cyrillic);
        added.push(cyrillic);
    }
    replaced.add(family);
}

function scan() {
    if (!enabled) return;
    for (const face of document.fonts) {
        check(face).catch(() => {});
    }
}

function setLocl(on) {
    let style = document.getElementById(LOCL_STYLE);
    if (!on) {
        style?.remove();
        return;
    }
    if (style === null) {
        style = document.createElement("style");
        style.id = LOCL_STYLE;
        style.textContent =
            ':lang(bg), :lang(bg) * { font-feature-settings: "locl" 0 !important; }';
        (document.head ?? document.documentElement).append(style);
    }
}

function turn(on) {
    enabled = on;
    setLocl(on);
    if (on) {
        scan();
        return;
    }
    for (const face of added.splice(0)) {
        document.fonts.delete(face);
    }
    checked.clear();
    replaced.clear();
}

// Fonts load as text needs them: each batch checked as it is done
document.fonts.addEventListener("loadingdone", scan);
document.addEventListener("DOMContentLoaded", () => {
    // The style again at the end of the head, after the page's own
    if (enabled) {
        document.getElementById(LOCL_STYLE)?.remove();
        setLocl(true);
    }
    scan();
});
window.addEventListener("load", scan);

const host = location.hostname;

chrome.storage.sync.get({ off: [] }, ({ off }) => turn(!off.includes(host)));

chrome.storage.onChanged.addListener((changes) => {
    if (changes.off !== undefined) {
        turn(!(changes.off.newValue ?? []).includes(host));
    }
});

// What the popup shows: whether it is on here, and the fonts replaced
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message === "status" && window === window.top) {
        reply({ enabled, replaced: [...replaced] });
    }
});
