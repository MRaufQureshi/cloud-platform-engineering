// Run with: npm test   (Node's built-in test runner, no extra packages)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { LANGS, detectLang, dictionaries, makeFormat, makeT } from "./i18n.js";
import { ago, emph, euro, greeting, parts, planSummary } from "./lib.js";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const stars = (text) => (text.match(/\*/g) || []).length;

test("English and German have exactly the same keys", () => {
  assert.deepEqual(Object.keys(dictionaries.de).sort(), Object.keys(dictionaries.en).sort());
});

test("every key uses the same {placeholders} and *highlights* in both languages", () => {
  for (const key of Object.keys(dictionaries.en)) {
    assert.deepEqual(placeholders(dictionaries.de[key]), placeholders(dictionaries.en[key]), key);
    assert.equal(stars(dictionaries.de[key]), stars(dictionaries.en[key]), key);
  }
});

test("every key used in the source files exists", () => {
  const files = ["App.jsx", "pages/Login.jsx", "pages/Dashboard.jsx", "pages/Control.jsx", "components/PlanChart.jsx", "components/BatteryGauge.jsx", "components/LangSwitch.jsx", "lib.js"];
  for (const file of files) {
    const source = fs.readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/\bt\(\s*"([\w.]+)"/g)) {
      assert.ok(match[1] in dictionaries.en, `${file}: ${match[1]} is missing in en`);
      assert.ok(match[1] in dictionaries.de, `${file}: ${match[1]} is missing in de`);
    }
  }
});

test("t fills in placeholders, and falls back to the key when it is unknown", () => {
  const en = makeT("en");
  assert.equal(en("ago.s", { n: 4 }), "4 s ago");
  assert.equal(en("no.such.key"), "no.such.key");
  assert.equal(makeT("de")("ago.s", { n: 4 }), "vor 4 s");
});

test("the language starts in English unless the user picked one", () => {
  assert.equal(detectLang(null), "en");
  assert.equal(detectLang(undefined), "en");
  assert.equal(detectLang("fr"), "en");
  assert.equal(detectLang("de"), "de");
  assert.deepEqual(LANGS, ["en", "de"]);
});

test("numbers and money follow the language", () => {
  assert.equal(makeFormat("en").num(4.5, 1), "4.5");
  assert.equal(makeFormat("de").num(4.5, 1), "4,5");
  assert.equal(euro(43.2), "€43.20");
  assert.equal(makeFormat("de").eur(43.2).replace(/ /g, " "), "43,20 €");
});

test("emph and parts split a sentence at the *highlight*", () => {
  assert.deepEqual(emph("Charging now, while power is *cheap*."), ["Charging now, while power is ", "cheap", "."]);
  assert.deepEqual(parts("Plug *in* now"), [{ text: "Plug " }, { text: "in", strong: true }, { text: " now" }]);
});

test("the sentences read the same in both languages", () => {
  assert.deepEqual(greeting({ kind: "charging" }), ["Charging now, while power is ", "cheap", "."]);
  assert.deepEqual(greeting({ kind: "charging" }, makeT("de")), ["Lädt jetzt, solange Strom ", "günstig", " ist."]);
  assert.equal(ago(200, makeT("de")), "vor 3 Min.");
  const windows = [{ action: "charge", start: 2, from: "14:00", to: "15:00" }];
  const summary = (lang) => planSummary({ kind: "charging" }, [{ price: 4.5 }], windows, { target_soc: 80, departure_time: "07:30" }, makeT(lang), makeFormat(lang).num);
  assert.equal(summary("en").map((p) => p.text).join(""), "Charging now while power costs 4.5 ct. Next, charging 14:00–15:00. Target: 80% by 07:30.");
  assert.equal(summary("de").map((p) => p.text).join("").replace(/ /g, " "), "Lädt jetzt, während Strom 4,5 ct kostet. Als Nächstes: Laden 14:00–15:00. Ziel: 80 % um 07:30 Uhr.");
});
