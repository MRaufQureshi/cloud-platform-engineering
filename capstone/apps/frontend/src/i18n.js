// i18n.js - the app's two languages (English, German) and the small helpers around them.
// Plain JavaScript, no React and no library, so the pure functions can be tested.
//
// How it works:
//   t("key", { name: value })   looks the key up in the current language and fills in {name}.
//   A word between *stars* is highlighted (see emph() and parts() in lib.js).
//   A key missing in German falls back to English, and a missing key shows the key itself.
//
// Not translated on purpose: the error messages that come from Cognito and the API
// (they stay in English), the product name, and the technical details (topic names,
// HTTP routes).
//
// German uses the formal "Sie".

const NBSP = " "; // a space that never wraps, so "50 %" and "14:00 Uhr" stay together

export const LANGS = ["en", "de"];
export const STORAGE_KEY = "theo-lang";

const en = {
  // top bar
  "nav.aria": "Main",
  "nav.dashboard": "Dashboard",
  "nav.control": "Control",
  "brand.dashboardAria": "T.H.E.O. dashboard",
  "status.online": "Online",
  "status.offline": "Offline",
  "status.connecting": "Connecting…",
  "status.sim": "sim {time}",
  "device.label": "Device",
  "signout": "Sign out",
  "lang.aria": "Language",

  // login
  "login.in.title": "You're *in*",
  "login.in.lead": "The lights are on. Opening your dashboard…",
  "login.welcome": "Welcome *home*",
  "login.newPassword.title": "Choose a new *password*",
  "login.lead": "Sign in to see how your car powers your home.",
  "login.newPassword.lead": "First sign-in: replace the temporary password. At least 10 characters, with upper and lower case letters, a number and a symbol.",
  "login.email": "Email",
  "login.password": "Password",
  "login.newPassword.label": "New password",
  "login.password.show": "Show password",
  "login.password.hide": "Hide password",
  "login.saving": "Saving…",
  "login.signingIn": "Signing in…",
  "login.save": "Save and sign in",
  "login.signIn": "Sign in",
  "login.footnote": "No sign-up · the admin creates demo accounts",
  "login.err.email": "Enter your email address, like name@example.com.",
  "login.err.length": "Use at least 10 characters.",

  // sentences built in lib.js
  "ago.none": "no data yet",
  "ago.s": "{n} s ago",
  "ago.min": "{n} min ago",
  "g.charging": "Charging now, while power is *cheap*.",
  "g.home": "Your car is *powering your home*.",
  "g.idle": "Plugged in and waiting for a *cheaper* hour.",
  "g.unplugged": "Plug the car in to get a *plan*.",
  "g.offline": "The device is *offline* right now.",
  "g.loading": "Getting the latest from *THEO*…",
  "plan.offline": "No telemetry from the device. THEO plans again when it is back.",
  "plan.none": "No plan yet. *Plug the car in* and THEO makes one in a few seconds.",
  "plan.charging": "*Charging now* while power costs *{price}*. ",
  "plan.home": "*Powering your home now* while power costs *{price}*. ",
  "plan.wait": "*Waiting* while power costs *{price}*. ",
  "plan.next": "Next, ",
  "plan.then": "then ",
  "plan.win.charge": "*charging {from}–{to}*",
  "plan.win.discharge": "*car → home {from}–{to}*",
  "plan.target": "Target: *{n}% by {time}*.",

  // car states
  "state.charging": "Charging",
  "state.home": "Car → home",
  "state.idle": "Idle",
  "state.unplugged": "Unplugged",
  "state.offline": "Offline",

  // dashboard
  "dash.view.price": "Price",
  "dash.view.power": "Power",
  "dash.view.battery": "Battery",
  "dash.eyebrow.sim": "sim time {time}",
  "dash.saved": "Saved today",
  "dash.month": "{amount} this month",
  "dash.beforeHardware": "Before hardware costs",
  "dash.chartView": "Chart view",
  "dash.battery": "Battery",
  "dash.batteryAria": "Change the reserve and the target",
  "dash.reserve": "Reserve {n}%",
  "dash.usable": "Usable {n}%",
  "dash.target": "Target {n}%",
  "dash.ready": "Ready: *{n}% by {time}*",
  "dash.readyTarget": "Target: *{n}% by {time}*",
  "dash.plan": "THEO's plan",
  "dash.openControl": "Open Control",
  "dash.devices": "Your devices",
  "dash.batteryLevel": "Battery level",
  "dash.noData": "no data",
  "dash.pct": "{n}%",
  "dash.prices": "Prices ahead",
  "dash.priceNow": "Price now",
  "dash.cheapest": "Cheapest",
  "dash.peak": "Peak",
  "dash.theoPays": "THEO pays",
  "dash.at": "at {time}",
  "dash.average": "average {value} ct",
  "dash.aboutAverage": "about average",
  "dash.vsAverage": "{sign}{value} vs avg",
  "dash.foot": "Savings are before hardware costs · prices in ct/kWh · times are simulated",
  "dash.tank": "{id}: {level}, {state}",

  // control
  "ctl.eyebrow": "Control · {id}",
  "ctl.title": "Tell THEO what your car *needs*.",
  "ctl.connection": "Connection",
  "ctl.state.offline": "Offline",
  "ctl.state.plugged": "Plugged in",
  "ctl.state.unplugged": "Unplugged",
  "ctl.note.sending": "Command sent · waiting for the car",
  "ctl.note.offline": "No telemetry · last {ago}",
  "ctl.note.home": "{soc}% · powering your home · {kw} kW",
  "ctl.note.charging": "{soc}% · charging · {kw} kW",
  "ctl.note.idle": "{soc}% · idle, waiting for a cheaper hour",
  "ctl.note.unplugged": "THEO plans again when you plug in",
  "ctl.btn.waiting": "Waiting for the car…",
  "ctl.btn.unplug": "Unplug car",
  "ctl.btn.plug": "Plug in car",
  "ctl.cmd.before": "Sends",
  "ctl.cmd.mid": "to",
  "ctl.cmd.after": "over IoT Core",
  "ctl.rules": "Charging rules",
  "ctl.rules.help": "THEO plans around these. Saving asks the optimizer for a new plan.",
  "ctl.now": "NOW {n}%",
  "ctl.reserveLabel": "RESERVE {n}%",
  "ctl.targetLabel": "TARGET {n}%",
  "ctl.reserve": "Reserve",
  "ctl.reserve.help": "THEO never powers your home below this.",
  "ctl.target": "Target",
  "ctl.target.help": "Charged to this by the time you leave.",
  "ctl.departure": "Departure",
  "ctl.departure.help": "When you usually leave.",
  "ctl.invalid": "The target can't be lower than the reserve.",
  "ctl.saving": "Saving…",
  "ctl.save": "Save and re-plan",
  "ctl.reset": "Reset",
  "ctl.saved": "Saved. The new plan is on the dashboard.",
  "ctl.loading": "Loading the settings…",
  "ctl.flow": "What happens when you save",
  "ctl.step1": "The API saves your settings",
  "ctl.step2": "A re-plan message is queued",
  "ctl.step3": "The optimizer solves a new plan",
  "ctl.step4": "The dashboard shows it",
  "ctl.foot": "Times are simulated · the device answers with telemetry every 10 s",
  "ctl.err.noAnswer": "No answer from the car yet. Is the device online?",

  // plan chart and battery gauge
  "chart.empty": "No plan right now. THEO makes one as soon as the car is plugged in.",
  "chart.label.power": "Planned power per 15 minutes. Up is charging, down is the car powering the home.",
  "chart.label.battery": "Battery from {from}% now to {to}% at {time}.",
  "chart.label.price": "Price per 15 minutes from {from} until {to}, with {n} planned windows.",
  "chart.now": "NOW {time}",
  "chart.leaves": "LEAVES {time}",
  "chart.band.charge": "CHARGE",
  "chart.band.home": "CAR → HOME",
  "chart.tip.charge": "Charging · {kwh} kWh",
  "chart.tip.home": "Car → home · {kwh} kWh",
  "chart.legend.grid": "Charge from grid",
  "chart.legend.home": "Car → home",
  "chart.legend.price": "Price, ct/kWh",
  "chart.legend.peak": "Expensive hours",
  "chart.legend.charging": "Charging",
  "chart.legend.battery": "Battery if the plan runs",
  "chart.legend.levels": "Reserve and target",
  "gauge.aria": "Battery {soc}%. Reserve {reserve}%, target {target}%.",
};

const de = {
  // top bar
  "nav.aria": "Hauptmenü",
  "nav.dashboard": "Dashboard",
  "nav.control": "Steuerung",
  "brand.dashboardAria": "T.H.E.O. Dashboard",
  "status.online": "Online",
  "status.offline": "Offline",
  "status.connecting": "Verbindung …",
  "status.sim": "Sim {time}",
  "device.label": "Gerät",
  "signout": "Abmelden",
  "lang.aria": "Sprache",

  // login
  "login.in.title": "Sie sind *drin*",
  "login.in.lead": "Die Lichter sind an. Ihr Dashboard wird geöffnet …",
  "login.welcome": "Willkommen *zuhause*",
  "login.newPassword.title": "Wählen Sie ein neues *Passwort*",
  "login.lead": "Melden Sie sich an und sehen Sie, wie Ihr Auto Ihr Zuhause mit Strom versorgt.",
  "login.newPassword.lead": "Erste Anmeldung: Ersetzen Sie das temporäre Passwort. Mindestens 10 Zeichen, mit Groß- und Kleinbuchstaben, einer Zahl und einem Sonderzeichen.",
  "login.email": "E-Mail",
  "login.password": "Passwort",
  "login.newPassword.label": "Neues Passwort",
  "login.password.show": "Passwort anzeigen",
  "login.password.hide": "Passwort verbergen",
  "login.saving": "Speichern …",
  "login.signingIn": "Anmeldung läuft …",
  "login.save": "Speichern und anmelden",
  "login.signIn": "Anmelden",
  "login.footnote": "Keine Registrierung · der Admin legt Demo-Konten an",
  "login.err.email": "Geben Sie Ihre E-Mail-Adresse ein, zum Beispiel name@example.com.",
  "login.err.length": "Verwenden Sie mindestens 10 Zeichen.",

  // sentences built in lib.js
  "ago.none": "noch keine Daten",
  "ago.s": "vor {n} s",
  "ago.min": "vor {n} Min.",
  "g.charging": "Lädt jetzt, solange Strom *günstig* ist.",
  "g.home": "Ihr Auto *versorgt Ihr Zuhause*.",
  "g.idle": "Angesteckt und wartet auf eine *günstigere* Stunde.",
  "g.unplugged": "Stecken Sie das Auto an, um einen *Plan* zu erhalten.",
  "g.offline": "Das Gerät ist gerade *offline*.",
  "g.loading": "Neueste Daten von *THEO* werden geladen …",
  "plan.offline": "Keine Telemetrie vom Gerät. THEO plant neu, sobald es wieder da ist.",
  "plan.none": "Noch kein Plan. *Stecken Sie das Auto an* und THEO erstellt in wenigen Sekunden einen.",
  "plan.charging": "*Lädt jetzt*, während Strom *{price}* kostet. ",
  "plan.home": "*Versorgt jetzt Ihr Zuhause*, während Strom *{price}* kostet. ",
  "plan.wait": "*Wartet*, während Strom *{price}* kostet. ",
  "plan.next": "Als Nächstes: ",
  "plan.then": "dann ",
  "plan.win.charge": "*Laden {from}–{to}*",
  "plan.win.discharge": "*Auto → Haus {from}–{to}*",
  "plan.target": `Ziel: *{n}${NBSP}% um {time} Uhr*.`,

  // car states
  "state.charging": "Lädt",
  "state.home": "Auto → Haus",
  "state.idle": "Wartet",
  "state.unplugged": "Nicht angesteckt",
  "state.offline": "Offline",

  // dashboard
  "dash.view.price": "Preis",
  "dash.view.power": "Leistung",
  "dash.view.battery": "Batterie",
  "dash.eyebrow.sim": "Simulationszeit {time}",
  "dash.saved": "Heute gespart",
  "dash.month": "{amount} diesen Monat",
  "dash.beforeHardware": "Vor Hardwarekosten",
  "dash.chartView": "Diagrammansicht",
  "dash.battery": "Batterie",
  "dash.batteryAria": "Reserve und Ziel ändern",
  "dash.reserve": `Reserve {n}${NBSP}%`,
  "dash.usable": `Nutzbar {n}${NBSP}%`,
  "dash.target": `Ziel {n}${NBSP}%`,
  "dash.ready": `Bereit: *{n}${NBSP}% um {time} Uhr*`,
  "dash.readyTarget": `Ziel: *{n}${NBSP}% um {time} Uhr*`,
  "dash.plan": "THEOs Plan",
  "dash.openControl": "Steuerung öffnen",
  "dash.devices": "Ihre Geräte",
  "dash.batteryLevel": "Ladestand",
  "dash.noData": "keine Daten",
  "dash.pct": `{n}${NBSP}%`,
  "dash.prices": "Kommende Preise",
  "dash.priceNow": "Preis jetzt",
  "dash.cheapest": "Günstigster",
  "dash.peak": "Spitze",
  "dash.theoPays": "THEO zahlt",
  "dash.at": "um {time}",
  "dash.average": "Ø {value} ct",
  "dash.aboutAverage": "etwa Durchschnitt",
  "dash.vsAverage": "{sign}{value} ggü. Ø",
  "dash.foot": "Einsparungen vor Hardwarekosten · Preise in ct/kWh · Zeiten sind simuliert",
  "dash.tank": "{id}: {level}, {state}",

  // control
  "ctl.eyebrow": "Steuerung · {id}",
  "ctl.title": "Sagen Sie THEO, was Ihr Auto *braucht*.",
  "ctl.connection": "Verbindung",
  "ctl.state.offline": "Offline",
  "ctl.state.plugged": "Angesteckt",
  "ctl.state.unplugged": "Nicht angesteckt",
  "ctl.note.sending": "Befehl gesendet · Warten auf das Auto",
  "ctl.note.offline": "Keine Telemetrie · zuletzt {ago}",
  "ctl.note.home": `{soc}${NBSP}% · versorgt Ihr Zuhause · {kw} kW`,
  "ctl.note.charging": `{soc}${NBSP}% · lädt · {kw} kW`,
  "ctl.note.idle": `{soc}${NBSP}% · wartet auf eine günstigere Stunde`,
  "ctl.note.unplugged": "THEO plant neu, sobald Sie das Auto anstecken",
  "ctl.btn.waiting": "Warten auf das Auto …",
  "ctl.btn.unplug": "Auto abstecken",
  "ctl.btn.plug": "Auto anstecken",
  "ctl.cmd.before": "Sendet",
  "ctl.cmd.mid": "an",
  "ctl.cmd.after": "über IoT Core",
  "ctl.rules": "Laderegeln",
  "ctl.rules.help": "THEO plant mit diesen Werten. Beim Speichern fragt der Optimizer einen neuen Plan an.",
  "ctl.now": `JETZT {n}${NBSP}%`,
  "ctl.reserveLabel": `RESERVE {n}${NBSP}%`,
  "ctl.targetLabel": `ZIEL {n}${NBSP}%`,
  "ctl.reserve": "Reserve",
  "ctl.reserve.help": "THEO versorgt Ihr Zuhause nie unter diesem Wert.",
  "ctl.target": "Ziel",
  "ctl.target.help": "Bis zur Abfahrt auf diesen Wert geladen.",
  "ctl.departure": "Abfahrt",
  "ctl.departure.help": "Wann Sie normalerweise losfahren.",
  "ctl.invalid": "Das Ziel darf nicht niedriger als die Reserve sein.",
  "ctl.saving": "Speichern …",
  "ctl.save": "Speichern und neu planen",
  "ctl.reset": "Zurücksetzen",
  "ctl.saved": "Gespeichert. Der neue Plan steht im Dashboard.",
  "ctl.loading": "Einstellungen werden geladen …",
  "ctl.flow": "Was beim Speichern passiert",
  "ctl.step1": "Die API speichert Ihre Einstellungen",
  "ctl.step2": "Eine Neuplanung wird eingereiht",
  "ctl.step3": "Der Optimizer berechnet einen neuen Plan",
  "ctl.step4": "Das Dashboard zeigt ihn an",
  "ctl.foot": "Zeiten sind simuliert · das Gerät meldet sich alle 10 s mit Telemetrie",
  "ctl.err.noAnswer": "Noch keine Antwort vom Auto. Ist das Gerät online?",

  // plan chart and battery gauge
  "chart.empty": "Gerade kein Plan. THEO erstellt einen, sobald das Auto angesteckt ist.",
  "chart.label.power": "Geplante Leistung pro 15 Minuten. Nach oben wird geladen, nach unten versorgt das Auto das Zuhause.",
  "chart.label.battery": `Batterie von {from}${NBSP}% jetzt auf {to}${NBSP}% um {time} Uhr.`,
  "chart.label.price": "Preis pro 15 Minuten von {from} bis {to}, mit {n} geplanten Zeitfenstern.",
  "chart.now": "JETZT {time}",
  "chart.leaves": "ABFAHRT {time}",
  "chart.band.charge": "LADEN",
  "chart.band.home": "AUTO → HAUS",
  "chart.tip.charge": "Lädt · {kwh} kWh",
  "chart.tip.home": "Auto → Haus · {kwh} kWh",
  "chart.legend.grid": "Aus dem Netz laden",
  "chart.legend.home": "Auto → Haus",
  "chart.legend.price": "Preis, ct/kWh",
  "chart.legend.peak": "Teure Stunden",
  "chart.legend.charging": "Laden",
  "chart.legend.battery": "Batterie, wenn der Plan läuft",
  "chart.legend.levels": "Reserve und Ziel",
  "gauge.aria": `Batterie {soc}${NBSP}%. Reserve {reserve}${NBSP}%, Ziel {target}${NBSP}%.`,
};

export const dictionaries = { en, de };

// The language to start in: the one the user picked with the switch before, else English.
// (The browser's language is deliberately not used: the default is always English.)
export function detectLang(saved) {
  return LANGS.includes(saved) ? saved : "en";
}

// Returns t() for one language: t("key", { name: value }).
export function makeT(lang) {
  const table = dictionaries[lang] || en;
  return (key, vars) => {
    const text = table[key] ?? en[key] ?? key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  };
}

const LOCALES = { en: "en-US", de: "de-DE" };

// Numbers and money in the language's own style: 4.5 or 4,5; €43.20 or 43,20 €.
export function makeFormat(lang) {
  const locale = LOCALES[lang] || LOCALES.en;
  return {
    num: (value, digits = 1) =>
      Number(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    eur: (value) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(Number(value || 0)),
  };
}
