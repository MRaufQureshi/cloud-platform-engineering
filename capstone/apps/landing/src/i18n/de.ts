// German copy for the static page. Keys match the data-i18n / data-i18n-attr attributes in index.html;
// the English text lives in index.html itself, so the page reads right before any script runs.
//
// Values for data-i18n are HTML (they may carry <em>, <sup><a href="#src-…">, <abbr data-tip="…">, the
// .brand-mark span). Values for data-i18n-attr are plain text. Keep the markup identical to the English
// element: i18n.test.ts checks that tags, citations and numbers line up.
//
// Conventions (for the German review):
//  - "Sie" throughout.
//  - T.H.E.O. and "The Holistic Energy Orchestrator" are never translated.
//  - Model numbers stay labelled "beispielhaft" (illustrative); sources stay cited.
//  - Source titles keep their original language; only the descriptive part after the dash is translated.
//  - Numbers use German formatting (7,7 ct/kWh · 1.095 € · 40 %), with a no-break space before units and %.

import { BRAND as NAME } from '../config.ts'

const BRAND = `<span class="brand-mark">${NAME}</span>`

export const DE: Record<string, string> = {
  // ── Chrome ──────────────────────────────────────────────────────────────
  skip: 'Zum Inhalt springen',
  'loader.aria': 'Wird geladen',
  'loader.caption': `${BRAND} · die Geschichte lädt`,
  'wordmark.aria': 'T.H.E.O., zurück nach oben',
  'nav.aria': 'Abschnitte',
  'nav.day': 'Ein Tag',
  'nav.savings': 'Ersparnis',
  'nav.grid': 'Das Netz',
  'nav.fleet': 'Flotten',
  'nav.brain': 'Orchestrator',
  'nav.simulator': 'Simulator',
  'nav.chapters': 'Kapitel',
  'cta.join': 'Am Pilot teilnehmen',
  'rail.aria': 'Kapitel',
  'menu.aria': 'Alle Kapitel',

  // ── Chapter labels (rail and chapter menu) ──────────────────────────────
  'ch.hero': 'Einstieg',
  'ch.parked': 'Ungenutzte Energie',
  'ch.day': 'Ein Tag',
  'ch.ready': 'Ihre Regeln',
  'ch.simulator': 'Ersparnis',
  'ch.grid': 'Das Netz',
  'ch.fleet': 'Flotten',
  'ch.factory': 'Industrie',
  'ch.brain': 'Orchestrator',
  'ch.faq': 'FAQ',
  'ch.join': 'Anmelden',

  // ── 00 · Hero ───────────────────────────────────────────────────────────
  'hero.eyebrow': `${BRAND} · <abbr data-tip="Vehicle-to-Home: Ihr Auto versorgt Ihr Haus.">V2H</abbr> · <abbr data-tip="Vehicle-to-Grid: Viele Autos stützen gemeinsam das Stromnetz.">V2G</abbr>`,
  'hero.title': 'Strom, <em>in beide Richtungen.</em>',
  'hero.lead': `Das Elektroauto in Ihrer Einfahrt ist eine Batterie auf Rädern. ${BRAND} entwickelt die Software, mit der es Ihr Zuhause, Ihre Straße und das Stromnetz versorgt.`,
  'hero.seeDay': `Einen Tag mit ${BRAND} erleben`,
  'hero.scroll': 'Scrollen zum Einschalten',

  // ── 01 · Idle power ─────────────────────────────────────────────────────
  'ghost.parked': 'Geparkt',
  'parked.eyebrow': '<span class="num">01</span> Die ungenutzte Ressource',
  'parked.title': 'Die größte Batterie, die Sie besitzen, parkt vor Ihrer Tür.',
  'parked.lead':
    'Ein durchschnittliches Auto in Deutschland wird 42 Minuten am Tag gefahren und steht rund 21 Stunden zu Hause. Ein Elektroauto trägt eine Batterie in sich, die das Haus tagelang versorgen könnte.',
  'stats.aria': 'Kennzahlen',
  'unit.min': 'Min.',
  'unit.h': 'Std.',
  'unit.kwh': 'kWh',
  'unit.days': 'Tage',
  'stat.drive': 'Fahrzeit pro Tag im Durchschnitt<sup><a href="#src-mid">1</a></sup>',
  'stat.parked': 'Standzeit zu Hause pro Tag im Durchschnitt<sup><a href="#src-mid">1</a></sup>',
  'stat.battery': 'durchschnittliche Batterie eines neuen E-Autos in Europa<sup><a href="#src-iea">2</a></sup>',
  'stat.home': 'des Strombedarfs eines typischen 3-Personen-Haushalts<sup><a href="#src-stromspiegel">3</a></sup>',
  'parked.foot':
    'Eine 70-kWh-Batterie ist fast siebenmal so groß wie ein durchschnittlicher neuer Heimspeicher (10,3 kWh)<sup><a href="#src-pvmag">4</a></sup>. In der Praxis wird immer nur ein Teil davon bereitgestellt.',

  // ── 02 · A day, orchestrated ────────────────────────────────────────────
  'day.eyebrow': '<span class="num">02</span> Ein Tag, orchestriert',
  'day.title': 'Erleben Sie einen Tag. <em>Den klugen Teil übernimmt Ihr Auto.</em>',
  'day.hud.aria': 'Live-Anzeige des simulierten Tages',
  'day.captions.aria': 'Was im Tagesverlauf passiert',
  'day.c1.smart': '<strong>Morgen.</strong> Geladen und startklar, deutlich über dem von Ihnen eingestellten Minimum.',
  'day.c1.base': '<strong>Morgen.</strong> Geladen, aber es hat einfach geladen, sobald es angesteckt wurde.',
  'day.c2.smart': '<strong>Sie fahren los.</strong> Die Sonne übernimmt das Haus.',
  'day.c2.base': '<strong>Sie fahren los.</strong> Die Sonne übernimmt das Haus.',
  'day.c3.smart':
    '<strong>Später Vormittag.</strong> Solarstrom versorgt das Haus. Der Überschuss wird eingespeist, für nur 7,7 <abbr data-tip="Eurocent pro Kilowattstunde, die Einheit, in der Strom abgerechnet wird.">ct/kWh</abbr><sup><a href="#src-eeg">12</a></sup>.',
  'day.c3.base': '<strong>Später Vormittag.</strong> Solarstrom versorgt das Haus. Der Überschuss wird eingespeist, für nur 7,7 ct/kWh<sup><a href="#src-eeg">12</a></sup>.',
  'day.c4.smart':
    '<strong>Wieder zu Hause.</strong> Das Auto nimmt die Nachmittagssonne auf, statt sie für 7,7 ct einzuspeisen<sup><a href="#src-eeg">12</a></sup>.',
  'day.c4.base': '<strong>Wieder zu Hause.</strong> Das Auto lädt sofort mit voller Leistung, egal was der Strom kostet.',
  'day.c5.smart': '<strong>Abendspitze.</strong> Wenn die Sonne schwindet und die Preise steigen, übernimmt Ihr Auto das Haus.',
  'day.c5.base': '<strong>Abendspitze.</strong> Das Haus läuft zu den höchsten Preisen des Tages am Netz.',
  'day.c6.smart': '<strong>Nacht.</strong> Im Winter lädt es nach, wenn der Strom am günstigsten ist. Im Sommer hat die Sonne das schon erledigt.',
  'day.c6.base': '<strong>Nacht.</strong> Das Auto steht voll geladen da, während das Haus weiter Strom aus dem Netz kauft.',
  'day.c7.smart': '<strong>Wieder bereit.</strong> Jeden Morgen, nach Ihrem Zeitplan.',
  'day.c7.base': '<strong>Gleiches Auto, gleicher Tag.</strong> Wechseln Sie zurück, um zu sehen, was die Planung verändert.',
  'day.note':
    'Beispielhafte Simulation: Auto mit 75 kWh, Solaranlage mit 8 <abbr data-tip="Kilowatt-Peak: die Nennleistung einer Solaranlage bei voller Sonne.">kWp</abbr> auf dem Dach, ein Sommertag, ein beispielhafter <abbr data-tip="Ein Tarif, dessen Preis im Tagesverlauf dem Börsenstrompreis folgt, in 15-Minuten- oder Stundenschritten. Seit 2025 muss jeder deutsche Versorger einen anbieten; erforderlich ist ein Smart Meter.">dynamischer Tarif</abbr>.',

  // ── 03 · Your rules ─────────────────────────────────────────────────────
  'ghost.ready': 'Bereit',
  'ready.eyebrow': '<span class="num">03</span> Ihre Regeln',
  'ready.title': 'Immer bereit, wenn Sie es sind.',
  'ready.lead': `Sie legen die Abfahrtszeit, den Mindestladestand und fest, wie viel das Auto abgeben darf. ${BRAND} soll jede Viertelstunde neu planen, damit das Auto geladen ist, wenn Sie es brauchen, und für Sie arbeitet, wenn Sie es nicht brauchen.`,
  'dial.aria': 'Beispieleinstellungen: Abfahrt um 07:30 Uhr, nie unter 40 Prozent',
  'suffix.pct': ' %',
  'dial.ready': 'bereit um 07:30 Uhr',
  'dial.never': 'nie unter 40 %',
  'rules.aria': 'Grundregeln',
  'rule.driver.h': '<span class="rule-key rule-key-charge" aria-hidden="true"></span>Fahrer zuerst',
  'rule.driver.p': 'Ihre Abfahrtszeit und Ihr Mindestladestand haben Vorrang. Müssen Sie früher los? Sie können den Plan künftig mit einem Tipp überstimmen.',
  'rule.battery.h': '<span class="rule-key rule-key-reserve" aria-hidden="true"></span>Batterieschonend',
  'rule.battery.p':
    'Intelligentes Laden kann den Verschleiß verringern; das Bereitstellen von Strom erhöht ihn etwas. Der Plan bleibt innerhalb der Vorgaben Ihres Herstellers.<sup><a href="#src-agora">5</a></sup>',
  'rule.grid.h': '<span class="rule-key rule-key-grid" aria-hidden="true"></span>Netzdienlich',
  'rule.grid.p': 'Laden, wenn Strom günstig und reichlich vorhanden ist. Zurückgeben, wenn das Netz ihn am dringendsten braucht.',

  // ── 04 · Simulator ──────────────────────────────────────────────────────
  'ghost.simulator': 'Ihr Tag',
  'sim.eyebrow': '<span class="num">04</span> Ihre Zahlen',
  'sim.title': 'Was könnte es Ihnen sparen?',

  // ── 05 · Vehicle-to-grid ────────────────────────────────────────────────
  'grid.eyebrow': '<span class="num">05</span> Vehicle-to-Grid',
  'grid.title': 'Jetzt vervielfachen wir das.',
  'grid.lead':
    'In Deutschland sind mehr als 2 Millionen reine Elektroautos zugelassen<sup><a href="#src-kba">6</a></sup>, und die meisten stehen geparkt, wenn das Netz am stärksten belastet ist. Eine Studie schätzt, dass verbreitetes bidirektionales Laden das europäische Stromsystem bis 2040 um rund 22 Milliarden Euro pro Jahr entlasten könnte (Szenario)<sup><a href="#src-fraunhofer">11</a></sup>.',
  'grid.s2.eyebrow': '18:30 · Abendspitze',
  'grid.s2.title': 'Alle kochen, heizen und laden gleichzeitig.',
  'grid.s2.lead': 'Die Nachfrage steigt, die Preise schnellen hoch und das Netz gerät unter Druck, während die Sonne untergeht.',
  'grid.s3.eyebrow': 'Ein virtuelles Kraftwerk',
  'grid.s3.title': `Gemeinsam könnten Tausende geparkte Autos ein wenig abgeben. Genau das baut ${BRAND} auf.`,
  'vpp.label': 'Anteil der E-Autos in Deutschland, die mitmachen:',
  'vpp.unit': 'flexible Leistung bei je einer 7,4-kW-Wallbox',
  'vpp.note':
    'Beispielhafte Obergrenze: 2,03 Mio. Autos × Anteil × 7,4 kW, als könnte jedes teilnehmende Auto entladen und alle wären gleichzeitig angesteckt. Eine Herstellerschätzung beziffert die heutige Flotte auf etwa 1,0–1,5 GW (The Mobility House, 2025)<sup><a href="#src-tmh">8</a></sup>.',
  'demand.aria':
    'Schema: abendlicher Strombedarf in einer Straße, mit und ohne koordiniertes Laden. Ohne Koordination liegt die Spitze gegen 19:00 Uhr; mit Koordination wird sie abgeflacht.',
  'demand.street': 'abendlicher Bedarf in einer Straße',
  'demand.note': '(Schema, keine Messdaten)',
  'policy.aria': 'Aktuelle Änderungen in Deutschland',
  'policy.1': 'Jeder Versorger muss einen dynamischen Tarif anbieten (Smart Meter erforderlich)<sup><a href="#src-enwg">7</a></sup>',
  'policy.2': 'Die „doppelten Netzentgelte“ auf zurückgespeisten Speicherstrom entfallen<sup><a href="#src-tmh">8</a></sup>',
  'policy.3':
    'Die Regulierungsbehörde behandelt bidirektionale Ladepunkte weitgehend wie Heimspeicher, schrittweise bis 2027<sup><a href="#src-bnetza">9</a></sup>',

  // ── 06 · Fleets ─────────────────────────────────────────────────────────
  'fleet.eyebrow': '<span class="num">06</span> Flotten',
  'fleet.title': 'Ein Depot voller Batterien.',
  'fleet.lead': `Transporter und Firmenwagen stehen zwischen den Schichten stundenlang am Ladepunkt. ${BRAND} soll ihren Strom nur dann abgeben, wenn das Netz unter Druck steht, nur von Fahrzeugen mit mindestens 20 Prozentpunkten Reserve, nie unter deren Minimum und nie von einem Fahrzeug, das innerhalb von drei Stunden abfährt.`,
  'fleet.rules': 'Gibt nur mit 20+&nbsp;Punkten Reserve ab · nie unter dem Minimum · nie innerhalb von 3&nbsp;Std. vor der Abfahrt',
  'fleet.note': 'Beispielhafte Simulation: sechs Depotfahrzeuge von 18:00 bis 10:00 Uhr mit 22-kW-Ladern und einem beispielhaften Tarif. Nur Energie, keine Preise.',

  // ── 07 · Vehicle-to-factory ─────────────────────────────────────────────
  'factory.eyebrow':
    '<span class="num">07</span> <abbr data-tip="Vehicle-to-Factory: Firmen- und Mitarbeiterfahrzeuge helfen, den Energieverbrauch einer Fabrik auszugleichen.">V2F</abbr> · Vehicle-to-Factory',
  'factory.title': 'Fabriken können das auch.',
  'factory.lead':
    'Eine Forschungsarbeit Dritter hat einen deutschen Hersteller mit eigener Solaranlage, fünf flexiblen Produktionslasten und 20 E-Autos auf dem Parkplatz simuliert: 10 Firmenwagen, die in beide Richtungen laden, und 10 private Autos, die nur laden.<sup><a href="#src-paper">10</a></sup>',
  'bars.aria':
    'Erwartete Energiekosten über fünf Arbeitstage: sequenzielle Planung 1.095 Euro, gemeinsame Planung 980 Euro. Emissionen: 2,95 Tonnen gegenüber 2,74 Tonnen.',
  'bar.seq.name': 'Erst Fabrik planen, dann Autos',
  'bar.seq.val': '1.095 €',
  'bar.comb.name': 'Beides gemeinsam planen',
  'bar.comb.val': '980 €',
  'kpi.cost': 'niedrigere erwartete Energiekosten',
  'kpi.emissions': 'weniger Emissionen',
  'factory.cap':
    'Simulierte Fallstudie, 5 Arbeitstage im Oktober 2022, 10 Durchläufe. Erwartete Kosten 980 € gegenüber 1.095 € und Emissionen 2,74 t gegenüber 2,95 t. Die Autoren berichten 11,69 % und 7,65 %, gemessen am kombinierten Ergebnis. Bayer, Bollenbach, Lersch, Rusche &amp; Weibelzahl, AMCIS 2023.',
  'factory.quote': '„Das volle Potenzial von V2F erfordert eine Kombination mit energieflexiblen Produktionsprozessen.“',
  'factory.cite': 'Roth et al. (2019), zitiert nach Bayer et al. (2023); eigene Übersetzung',

  // ── 08 · How it works ───────────────────────────────────────────────────
  'ghost.brain': 'Orchestrieren',
  'brain.eyebrow': '<span class="num">08</span> Der Orchestrator',
  'brain.title': 'Ein Plan, alle 15 Minuten neu erstellt.',
  'brain.lead': `${BRAND} wird so gebaut, dass es ein bis zwei Tage vorausschaut und Viertelstunde für Viertelstunde den günstigsten und saubersten Weg wählt, Ihr Auto bereit zu halten. Ändert sich etwas – Sie fahren früher los, Wolken ziehen auf –, plant es einfach neu. Der Ersparnis-Simulator oben führt eine vereinfachte Version dieses Planers in Ihrem Browser aus.`,
  'fc.in.aria': 'Eingaben',
  'fc.prices': 'Preise &amp; Prognosen',
  'fc.sun': 'Sonne &amp; Wetter',
  'fc.schedule': 'Ihr Zeitplan',
  'fc.battery': 'Batteriezustand',
  'fc.signals': 'Netzsignale',
  'fc.optimiser': 'Optimierer',
  'fc.every': 'alle 15 Min.',
  'fc.out.aria': 'Aktionen',
  'fc.charge': '<span class="dot dot-grid"></span>Laden',
  'fc.hold': '<span class="dot"></span>Halten',
  'fc.home': '<span class="dot dot-energy"></span>Haus versorgen',
  'fc.grid': '<span class="dot dot-energy"></span>Netz stützen',

  // ── 09 · FAQ ────────────────────────────────────────────────────────────
  'ghost.faq': 'Ehrlich',
  'faq.eyebrow': '<span class="num">09</span> Ehrliche Antworten',
  'faq.title': 'Gute Fragen.',
  'faq.q1': 'Nutzt es meine Batterie ab?',
  'faq.a1':
    'Es kommen einige zusätzliche Ladezyklen hinzu. Studien sehen den Effekt als gering, und intelligentes Laden allein kann den Verschleiß sogar verringern. Der Plan soll innerhalb der Vorgaben Ihres Herstellers bleiben.<sup><a href="#src-agora">5</a></sup>',
  'faq.q2': 'Ist mein Auto geladen, wenn ich es brauche?',
  'faq.a2':
    'Das ist die Entwurfsregel: Ihre Abfahrtszeit und Ihr Mindestladestand haben Vorrang, und Sie können den Plan jederzeit überstimmen. Wenn ein Ziel nicht rechtzeitig erreichbar ist, etwa nach spätem Anstecken, sagt Ihnen die App Bescheid.',
  'faq.q3': 'Welche Autos und Ladegeräte funktionieren?',
  'faq.a3':
    'Bidirektionales Laden hängt vom Auto, seiner Software und der Wallbox ab. Die Unterstützung wächst schnell. Wir prüfen Ihre Ausstattung, bevor ein Pilot startet.',
  'faq.q4': 'Was brauche ich zu Hause?',
  'faq.a4':
    'Ein Auto und eine Wallbox, die in beide Richtungen laden können, und einen Smart Meter (für dynamische Tarife nötig). Eine Solaranlage auf dem Dach hilft, ist aber keine Voraussetzung.',
  'faq.q5': 'Ist das in Deutschland erlaubt?',
  'faq.a5':
    'Ja. Seit 2025 muss jeder Versorger einen dynamischen Tarif anbieten<sup><a href="#src-enwg">7</a></sup>, die „doppelten Netzentgelte“ auf gespeicherten Strom sind entfallen<sup><a href="#src-tmh">8</a></sup>, und die Regeln der Regulierungsbehörde von 2026 behandeln bidirektionale Ladepunkte weitgehend wie Heimspeicher<sup><a href="#src-bnetza">9</a></sup>. Einige Details werden noch schrittweise eingeführt.',
  'faq.q6': 'Wie viel spare ich wirklich?',
  'faq.a6':
    'Das hängt von Tarif, Auto, Solaranlage und Gewohnheiten ab. In unserem beispielhaften Modell bringt intelligentes Laden bei Pendlern den größten Teil der Ersparnis, und Vehicle-to-Home fällt stärker ins Gewicht, wenn das Auto tagsüber zu Hause steht. Unabhängige Analysen kommen zu dem Ergebnis, dass sich Vehicle-to-Home allein selten für die zusätzliche Hardware lohnt und die größten Gewinne entstehen, wenn das Auto auch das Netz stützen kann.<sup><a href="#src-agora">5</a></sup>',

  // ── 10 · Join ───────────────────────────────────────────────────────────
  'join.title': 'Ihr Auto kann mehr als <em>fahren.</em>',
  'join.lead': 'Wir bereiten einen kleinen Pilot in Deutschland für Haushalte mit Elektroauto vor.',
  'join.notice': 'Prototyp: Das Formular sendet noch nichts. Die Anmeldung öffnet bald.',
  'join.email': 'E-Mail',
  'join.placeholder': 'name@beispiel.de',
  'join.has': 'Ich habe',
  'join.opt.evsolar': 'E-Auto + Solar',
  'join.opt.ev': 'Nur E-Auto',
  'join.opt.solar': 'Nur Solar',
  'join.opt.none': 'Noch nichts davon',
  'join.opt.fleet': 'Eine Flotte',

  // ── Footer ──────────────────────────────────────────────────────────────
  'footer.tag': 'Vehicle-to-Home und Vehicle-to-Grid, orchestriert.',
  'footer.note':
    'Ersparnisse, Tagesabläufe und Kapazitäten auf dieser Seite sind beispielhafte Simulationen, keine Angebote oder Garantien. Forschungsergebnisse stammen aus Arbeiten Dritter und sind belegt. Bidirektionales Laden erfordert ein kompatibles Auto, eine kompatible Wallbox und einen Smart Meter.',
  'footer.sources': 'Quellen',
  'src.mid': 'Mobilität in Deutschland 2023 (MiD), Ergebnisbericht, S. 89–91.',
  'src.iea': 'IEA, Global EV Outlook 2026 — E-Auto-Batterien.',
  'src.stromspiegel': 'Stromspiegel für Deutschland — Stromverbrauch privater Haushalte.',
  'src.pvmag': 'pv magazine, 8. Jan. 2026 — Zubau von Batteriespeichern in Deutschland 2025.',
  'src.kba': 'Kraftfahrt-Bundesamt, Pressemitteilung 08/2026 — Bestand an reinen Elektroautos am 1. Januar 2026.',
  'src.enwg': '§ 41a EnWG — dynamische Stromtarife.',
  'src.tmh': 'The Mobility House Newsroom, Nov. 2025 — Bundestag beseitigt doppelte Netzentgelte (§ 118 Abs. 6 EnWG).',
  'src.bnetza': 'Bundesnetzagentur, 1. Okt. 2026 — MiSpeL-Regeln für Speicher und bidirektionale Ladepunkte.',
  'src.fraunhofer': 'Fraunhofer ISE/ISI für T&amp;E (2024) — EU-Potenzial von V2G (Szenario).',
  'src.eeg': 'Bundesnetzagentur — EEG-Einspeisevergütung für PV-Anlagen mit Inbetriebnahme ab 1. Aug. 2026 (7,70 ct/kWh, bis 10 kWp, Teileinspeisung).',
  legal: `© 2026 ${BRAND} · Prototyp-Website`,

  // ── Document head ───────────────────────────────────────────────────────
  'meta.title': 'T.H.E.O. — Ihr Auto kann Ihr Zuhause mit Strom versorgen',
  'meta.description':
    'T.H.E.O. (The Holistic Energy Orchestrator) entwickelt Software, mit der das Elektroauto in Ihrer Einfahrt Ihr Zuhause mit Strom versorgt und, gemeinsam mit anderen, das Netz stützt. Vehicle-to-Home und Vehicle-to-Grid, erklärt.',
}
