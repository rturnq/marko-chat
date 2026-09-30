#!/usr/bin/env node
// Generates the emoji picker's data from Unicode's emoji-test.txt:
//
//   node scripts/emoji/generate.mjs
//
// The source is https://unicode.org/Public/emoji/16.0/emoji-test.txt, saved
// next to this script. To move to a newer version, download that version's
// file, point SOURCE at it, and run this again.
//
// The output keeps Unicode's groups, subgroups and order, with the Component
// group left out. Emojis that take a skin tone list their five single-tone
// versions under `skins`; mixed-tone versions (such as two people with
// different tones) are left out, since the picker selects one tone.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const VERSION = "16.0";
const SOURCE = path.join(import.meta.dirname, `emoji-test-${VERSION}.txt`);
const OUTPUT = path.join(
  import.meta.dirname,
  "../../src/tags/ui-emoji-picker/emoji-data.json",
);

const TONES = {
  "light skin tone": "light",
  "medium-light skin tone": "medium-light",
  "medium skin tone": "medium",
  "medium-dark skin tone": "medium-dark",
  "dark skin tone": "dark",
};
const TONE_ORDER = Object.values(TONES);
const MODIFIER_OR_VS16 = /[\u{1F3FB}-\u{1F3FF}]|\u{FE0F}/gu;
const RGI = /^\p{RGI_Emoji}$/v;

const groups = [];
const basesByName = new Map();
const variants = [];
let mixedTones = 0;
let group;
let subgroup;

for (const line of readFileSync(SOURCE, "utf8").split("\n")) {
  const heading = /^# (group|subgroup): (.+)$/.exec(line);
  if (heading) {
    if (heading[1] === "group") {
      group = { name: heading[2], subgroups: [] };
      if (group.name !== "Component") groups.push(group);
    } else {
      subgroup = { name: heading[2], emojis: [] };
      group.subgroups.push(subgroup);
    }
    continue;
  }

  // `1F44B 1F3FB ; fully-qualified # 👋🏻 E1.0 waving hand: light skin tone`
  const entry = /^([0-9A-F ]+?)\s*; fully-qualified\s*# \S+ E[\d.]+ (.+)$/.exec(
    line,
  );
  if (!entry || group.name === "Component") continue;
  const emoji = String.fromCodePoint(
    ...entry[1].split(" ").map((hex) => parseInt(hex, 16)),
  );
  if (!RGI.test(emoji)) throw new Error(`Not an RGI emoji: ${line}`);

  // Names put qualifiers after a colon: `man: light skin tone, red hair`.
  const name = entry[2];
  const colon = name.indexOf(": ");
  const qualifiers = colon === -1 ? [] : name.slice(colon + 2).split(", ");
  const tones = qualifiers.filter((q) => q in TONES);
  if (!tones.length) {
    const base = { emoji, name };
    subgroup.emojis.push(base);
    basesByName.set(name, base);
  } else if (tones.every((tone) => tone === tones[0])) {
    const rest = qualifiers.filter((q) => !(q in TONES));
    const baseName =
      name.slice(0, colon) + (rest.length ? `: ${rest.join(", ")}` : "");
    variants.push({ emoji, name, baseName, tone: TONES[tones[0]] });
  } else {
    mixedTones++;
  }
}

for (const variant of variants) {
  const base = basesByName.get(variant.baseName);
  if (!base) throw new Error(`No base emoji for ${variant.name}`);
  // Without skin tones and variation selectors, both are the same sequence.
  if (
    variant.emoji.replace(MODIFIER_OR_VS16, "") !==
    base.emoji.replace(MODIFIER_OR_VS16, "")
  ) {
    throw new Error(`${variant.name} does not match ${base.name}`);
  }
  (base.skins ??= {})[variant.tone] = variant.emoji;
}

let bases = 0;
let withSkins = 0;
for (const { subgroups } of groups) {
  for (const { emojis } of subgroups) {
    for (const base of emojis) {
      bases++;
      if (!base.skins) continue;
      withSkins++;
      const tones = Object.keys(base.skins);
      if (tones.length !== TONE_ORDER.length) {
        throw new Error(`${base.name} has tones ${tones.join(", ")}`);
      }
      base.skins = Object.fromEntries(
        TONE_ORDER.map((tone) => [tone, base.skins[tone]]),
      );
    }
  }
}

// One emoji per line keeps the file readable and its diffs small.
const lines = [
  "{",
  `  "version": ${JSON.stringify(VERSION)},`,
  '  "groups": [',
];
groups.forEach((group, gi) => {
  lines.push(
    "    {",
    `      "name": ${JSON.stringify(group.name)},`,
    '      "subgroups": [',
  );
  group.subgroups.forEach((subgroup, si) => {
    lines.push(
      "        {",
      `          "name": ${JSON.stringify(subgroup.name)},`,
      '          "emojis": [',
    );
    subgroup.emojis.forEach((emoji, ei) => {
      const comma = ei < subgroup.emojis.length - 1 ? "," : "";
      lines.push(`            ${JSON.stringify(emoji)}${comma}`);
    });
    lines.push(
      "          ]",
      `        }${si < group.subgroups.length - 1 ? "," : ""}`,
    );
  });
  lines.push("      ]", `    }${gi < groups.length - 1 ? "," : ""}`);
});
lines.push("  ]", "}", "");
writeFileSync(OUTPUT, lines.join("\n"));

console.log(
  `Emoji ${VERSION}: ${bases} emojis in ${groups.length} groups, ` +
    `${withSkins} with skin tones (${variants.length} single-tone versions), ` +
    `${mixedTones} mixed-tone versions left out -> ${path.relative(process.cwd(), OUTPUT)}`,
);
