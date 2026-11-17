/* The privacy notice — `/personuvernd`.
 *
 * Written for the person it is about: a teenager. Short sentences, "þú", and
 * the short version first. It is generated rather than typed into a file for
 * one reason: the numbers in it (how long an unused account lives, how long a
 * backup lives) are the SAME constants the server acts on, so the notice
 * cannot promise one thing while the retention sweep does another.
 *
 * Who runs this server is not something the program can know. It is told, in
 * three environment variables (docs/HOSTING.md):
 *
 *   FALLASKOLI_CONTROLLER   the person responsible, by name
 *   FALLASKOLI_CONTACT      how to reach them (an email address)
 *   FALLASKOLI_HOSTING      who hosts the machine and where it stands
 *
 * Until the first two are set the page says so in red and `/health` reports
 * `privacy: false` — a notice with nobody's name on it is not a notice.
 *
 * The page is self-contained: no script, no font, no request to anybody.
 */

import { ASSIGN } from "../src/js/core/assignment.js";
import { SAMPLE } from "../src/js/core/classifiercheck.js";
import { TEAM } from "../src/js/core/teamduel.js";
import { LIVE } from "../src/js/core/live.js";
import { CLASS_GOAL } from "../src/js/core/classgoal.js";
import { WRITING } from "../src/js/core/writing.js";

export const RETENTION = {
  pendingDays: 30,      // an unanswered request for access
  inactiveMonths: 18,   // an account nobody has logged in to
  backupDays: 30,       // the longest a deleted account can survive in a backup
  sessionDays: 30,
};

/** The age below which a parent or guardian has to consent. Icelandic law says
    13 today (Act 90/2018, Art. 10(5)) and a bill before Alþingi says 15; this
    server asks for a guardian below 16, which satisfies both and GDPR's own
    default. Change it here and the form and the notice follow. */
export const CONSENT_AGE = 16;

/** How long an assignment and its results are kept after its deadline: the
    same number core/assignment.js prunes by, so the notice cannot drift. */
const ASSIGN_KEEP_DAYS = ASSIGN.keepDays;
/* v6.13 (items 64, 67): a live round is forgotten this many minutes after
   it ends; a team duel is erased this many days after it is over. */
const LIVE_KEEP_MIN = Math.round(LIVE.keepMs / 60000);
const TEAM_KEEP_DAYS = TEAM.keepDays;

export function privacyConfig(env = process.env) {
  const controller = String(env.FALLASKOLI_CONTROLLER || "").trim();
  const contact = String(env.FALLASKOLI_CONTACT || "").trim();
  const hosting = String(env.FALLASKOLI_HOSTING || "").trim();
  const num = (v, d) => (Number(v) > 0 ? Math.round(Number(v)) : d);
  return {
    controller, contact, hosting,
    ready: !!(controller && contact),
    pendingDays: num(env.FALLASKOLI_PENDING_DAYS, RETENTION.pendingDays),
    inactiveMonths: num(env.FALLASKOLI_INACTIVE_MONTHS, RETENTION.inactiveMonths),
    backupDays: num(env.FALLASKOLI_BACKUP_DAYS, RETENTION.backupDays),
  };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* The version of the notice. v6.12 shipped "2026-11-11"; v6.13 changes it
   ONCE, to "2026-11-16", for everything v6.13 adds that a family must be told
   (docs/PRIVACY.md §3 lists it):
     - the group's teacher or guardian sees the error patterns, assignment and
       team-duel results and one pupil's skill map (items 37, 65, 67, 83; §1a,
       §1d) — never when or how long a pupil practises;
     - right and wrong answers are counted anonymously to set the difficulty,
       and a teacher may switch on an anonymous sample of wrong word forms
       (items 17, 38; §1b); a duel's answers are graded on the server and not
       stored (items 62, 63, 66);
     - a weekly class goal: one total the whole group sees (item 59; §1c);
     - a live round on the projector, which keeps nothing (item 64; §1d);
     - Icelandic as a second language, one yes/no (item 45; §1e), and Ritun
       vikunnar, the first free text a child writes that the server may
       receive and, if the teacher keeps it, store (item 46; §1f).
   While v6.13 was being built the date was moved for each of these on the
   branch; none of those versions was ever published, so they are one version.
   Change it again only for a change the families must be told of, and to the
   day of that change — never a day in the future. */
export const PRIVACY_VERSION = "2026-11-16";

/* The first version of the notice that describes the anonymous counting
   (§1b). With FALLASKOLI_CALIBRATION=strict only consent given to this
   version or a later one counts (server/calibrate.mjs). It is the same day as
   PRIVACY_VERSION today, but it is a separate constant on purpose: when the
   notice changes again for something else, this one must NOT move, or every
   pupil who consented to the counting would stop being counted. It may never
   be later than PRIVACY_VERSION (a test holds it). */
export const CALIBRATION_NOTICE = "2026-11-16";

export function privacyPage(cfg) {
  const missing = (what) => `<mark>[vantar: ${what}]</mark>`;
  const who = cfg.controller ? esc(cfg.controller) : missing("nafn ábyrgðaraðila");
  const how = cfg.contact
    ? (/^[^@\s]+@[^@\s]+$/.test(cfg.contact)
      ? `<a href="mailto:${esc(cfg.contact)}">${esc(cfg.contact)}</a>` : esc(cfg.contact))
    : missing("netfang eða sími");
  const host = cfg.hosting
    ? esc(cfg.hosting)
    : "Fyrirtækið sem leigir okkur netþjóninn.";

  return `<!DOCTYPE html>
<html lang="is"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Persónuvernd — Fallaskóli</title>
<style>
  body{font:17px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#121922;background:#F8FAFB;margin:0}
  main{max-width:42rem;margin:0 auto;padding:28px 20px 60px}
  h1{font-size:30px;line-height:1.2;margin:0 0 6px}
  h2{font-size:20px;margin:34px 0 6px}
  .short{background:#fff;border:1px solid #C7D1DA;border-radius:10px;padding:14px 18px;margin:18px 0}
  .short p{margin:6px 0}
  li{margin:6px 0}
  mark{background:#FADFDB;color:#8a1f17;padding:1px 4px;border-radius:4px}
  .sub{color:#55657A;font-size:15px}
  a{color:#3346C7}
  table{border-collapse:collapse;width:100%;background:#fff}
  td,th{border:1px solid #C7D1DA;padding:8px 10px;text-align:left;vertical-align:top;font-size:15.5px}
  th{background:#E7ECF0}
</style></head><body><main>
<p class="sub"><a href="/">← Til baka í Fallaskóla</a></p>
<h1>Persónuvernd í Fallaskóla</h1>
<p class="sub">Síðast breytt ${PRIVACY_VERSION}</p>

<div class="short">
  <p><b>Stutta útgáfan</b></p>
  <p>Fallaskóli geymir eins lítið um þig og hægt er: notandanafn, gælunafn,
     lykilorð (sem enginn getur lesið) og hvernig þér gengur að æfa þig.</p>
  <p>Það sem þú skrifar í svörin er <b>ekki</b> geymt — bara hvort svarið var rétt —
     nema þú sendir sjálf(ur) villutilkynningu með 🚩, eða kennari hópsins þíns hafi kveikt á
     nafnlausu sýni af röngum svörum (sjá neðar).</p>
  <p>Í einvígi eru svörin þín send á þjóninn svo hann geti metið þau. Hann geymir aðeins
     hve mörg voru rétt — ekki svörin sjálf.</p>
  <p>Fallaskóli telur nafnlaust hve oft spurningum er svarað rétt og rangt, til að stilla
     hve erfiðar þær eru. Þú getur slökkt á því fyrir þig.</p>
  <p>Enginn annar nemandi sér neitt um þig nema þú kveikir sjálf(ur) á stigatöflunni.</p>
  <p>Ef kennarinn setur hópnum sameiginlegt markmið sjá allir í hópnum eina samtölu fyrir
     vikuna, og þín svör teljast með. Enginn sér hvað þú lagðir til.</p>
  <p>Kennari eða forsjáraðili hópsins þíns sér hvernig þér gengur í villumynstrum,
     verkefnum og bekkjareinvígjum, svo hann geti hjálpað þér — en aldrei það sem þú skrifar í svörin.
     Hann getur líka skoðað færnikortið þitt.</p>
  <p>Textinn sem þú skrifar í Ritun vikunnar er aðeins sendur ef kennarinn hefur kveikt á
     yfirlestri, og aðeins geymdur ef kennarinn hefur líka kveikt á því að geyma hann.
     Það stendur á skjánum áður en þú sendir (sjá næsta kafla).</p>
  <p>Í lifandi umferð í kennslustund svarar allur hópurinn sömu spurningum á sama tíma.
     Á skjávarpanum sést gælunafnið þitt aðeins ef þú ert á stigatöflunni — annars heitir
     þú þar „Leikmaður“ og númer. Ekkert af umferðinni er geymt eftir að henni lýkur.</p>
  <p>Engar auglýsingar, engin rakning, ekkert selt. Þú getur sótt gögnin þín eða
     eytt aðganginum hvenær sem er.</p>
</div>

${WRITING_NOTICE}

<h2>Hver ber ábyrgð?</h2>
<p>${who} rekur þennan Fallaskóla og ber ábyrgð á gögnunum (er „ábyrgðaraðili“).
   Ef þú hefur spurningu eða vilt að eitthvað sé lagað eða því eytt:
   ${how}.</p>

<h2>Hvað er geymt um þig?</h2>
<table>
<tr><th>Hvað</th><th>Til hvers</th></tr>
<tr><td>Notandanafn og gælunafn sem þú velur</td>
    <td>Til að þú getir skráð þig inn. Gælunafnið er það sem aðrir sjá ef þú ert
        á stigatöflunni. Notaðu ekki fullt nafn.</td></tr>
<tr><td>Lykilorðið — aðeins sem tætigildi („hash“)</td>
    <td>Til að kanna að lykilorðið sé rétt. Lykilorðið sjálft er hvergi til og
        enginn getur lesið það, ekki heldur umsjónarmaður.</td></tr>
<tr><td>Framvindan þín: XP, stig, merki, hvaða orð og beygingar þú hefur æft,
        hve mörg svör voru rétt og röng hvern dag og hve lengi þú æfðir þig</td>
    <td>Til að forritið muni hvar þú ert stödd/staddur, velji spurningar við hæfi
        og framvindan fylgi þér milli tækja.</td></tr>
<tr><td>Stillingarnar þínar</td><td>Til að þær haldist.</td></tr>
<tr><td>Verkefni sem kennari eða forsjáraðili hópsins setur, og niðurstaðan þín í
        hverju þeirra: hve mörgum spurningum þú svaraðir, hve mörg svör voru rétt og hvort
        þú laukst verkefninu</td>
    <td>Svo sá sem setti verkefnið sjái hver hefur lokið því og hvernig gekk. Verkefni
        eyðist ${ASSIGN_KEEP_DAYS} dögum eftir skiladag, með niðurstöðunum.</td></tr>
<tr><td>Nafnlaus talning: hve oft hverri gerð spurninga, á hverri þyngd og í hverri
        beygingarmynd, er svarað rétt og rangt — lagt saman fyrir alla notendur. Þar stendur
        hvorki hver svaraði, í hvaða hópi né hvenær, og ekkert sem þú skrifaðir</td>
    <td>Til að forritið stilli sjálfkrafa hve erfiðar spurningarnar eru. Þú getur slökkt á
        þessu fyrir þig undir <i>Aðgangurinn minn</i>. Tölurnar eru ekki merktar þér og verða
        því eftir þótt aðganginum þínum sé eytt.</td></tr>
<tr><td>Í einn dag: hve mörg af svörunum þínum hafa verið talin með þann daginn</td>
    <td>Svo enginn geti skekkt talninguna með því að senda inn mjög mörg svör. Þessu er
        eytt daginn eftir.</td></tr>
<tr><td><b>Aðeins ef kennari hópsins þíns kveikir á því:</b> nafnlaust sýni af röngum
        svörum — orðið sem spurt var um, myndin sem átti að skrifa, myndin sem þú skrifaðir
        og hvernig villan var flokkuð. Aðeins stök orð sem líkjast beygingarmynd orðsins eru
        geymd, mest ${SAMPLE.keep} svör alls, og hvorki nafn, hópur né dagsetning fylgir
        (aðeins mánuðurinn)</td>
    <td>Til að prófa sjálfkrafa hvort villugreiningin flokkar villur rétt. Sjálfgefið er
        slökkt á þessu. Undir <i>Aðgangurinn minn</i> sérðu hvort kveikt er á því í hópnum
        þínum, og ef þú slekkur á talningunni þar er ekkert geymt frá þér. Svar í sýninu er
        ekki merkt þér. Þess vegna er ekki hægt að finna það aftur til að eyða því
        sérstaklega, en það eyðist sjálfkrafa eftir ${SAMPLE.months} mánuði.</td></tr>
<tr><td>Einvígi: við hvern þú kepptir, um hvaða efni og hve mörg svör voru rétt hjá hvoru
        ykkar. Svörin þín í einvígi eru send á þjóninn til að hann meti þau, en þau eru
        <b>ekki</b> geymd</td>
    <td>Svo úrslitin séu rétt hjá ykkur báðum og enginn geti sent inn stig sem hann vann
        ekki fyrir.</td></tr>
<tr><td>Bekkjareinvígi: í hvaða liði þú ert og hve mörg svör voru rétt hjá þér. Svörin
        þín eru send á þjóninn til að hann meti þau, en þau eru <b>ekki</b> geymd</td>
    <td>Svo meðaltal liðanna sé rétt. Kennari hópsins þíns sér niðurstöðuna þína. Aðrir
        nemendur — og kennari hins hópsins, ef keppt er við annan hóp — sjá aðeins meðaltal
        liðanna. Bekkjareinvígi eyðist ${TEAM_KEEP_DAYS} dögum eftir að því lýkur.</td></tr>
<tr><td>Á meðan lifandi umferð stendur yfir: hve mörg svör voru rétt hjá þér og stigin
        þín. Þetta er aðeins í minni þjónsins og er aldrei skrifað niður. Svörin þín eru
        metin á þjóninum og ekki geymd</td>
    <td>Til að sýna stöðuna eftir hverja spurningu. Allt um umferðina gleymist
        ${LIVE_KEEP_MIN} mínútum eftir að henni lýkur.</td></tr>
<tr><td>Dagurinn sem þú skráðir þig og dagurinn sem þú varst síðast inni</td>
    <td>Til að hægt sé að eyða aðgangi sem enginn notar lengur.</td></tr>
<tr><td>Villutilkynningar sem þú sendir með 🚩: það sem þú skrifar, spurningin
        sjálf, svarið þitt og rétta svarið</td>
    <td>Svo umsjónarmaður geti skoðað hvort spurningin sé röng og lagað hana.
        Aðeins umsjónarmaður sér þær. Þær eyðast með aðganginum þínum og fylgja
        með þegar þú sækir gögnin þín.</td></tr>
<tr><td>Hver samþykkti aðganginn og hvenær</td>
    <td>Þú sjálf(ur) ef þú ert ${CONSENT_AGE} ára eða eldri. Annars nafn foreldris
        eða forsjáraðila sem samþykkti. Lögin krefjast þess að hægt sé að sýna
        fram á samþykkið.</td></tr>
</table>
<p>IP-talan þín (númer nettengingarinnar) sést á meðan þú ert tengd(ur), eins og
   á öllum vefsíðum. Hún er notuð í stutta stund til að stöðva þá sem reyna að
   giska á lykilorð og er ekki skráð með aðganginum þínum.</p>
<p>Fallaskóli biður <b>ekki</b> um netfang, kennitölu, símanúmer, fæðingardag
   eða mynd.</p>

<h2>Af hverju má Fallaskóli geyma þetta?</h2>
<p>Vegna þess að það var samþykkt — af þér, eða af foreldri eða forsjáraðila ef
   þú ert yngri en ${CONSENT_AGE} ára. Það er heimildin samkvæmt
   persónuverndarlögum (lög nr. 90/2018 og evrópska persónuverndarreglugerðin, GDPR).
   Samþykkið má draga til baka hvenær sem er með því að eyða aðganginum, og
   það kostar ekkert og þarf enga skýringu.</p>

<h2>Hver sér hvað?</h2>
<ul>
  <li><b>Þú</b> sérð allt sem er geymt um þig.</li>
  <li><b>Aðrir nemendur í hópnum þínum</b> sjá ekkert um þig nema þú kveikir á
      stigatöflunni undir <i>Stillingar og námsefni → Aðgangurinn minn</i>. Þá sjá þeir
      gælunafnið, stig, XP, merkin þín og titilinn sem þú velur. Mínútur sjást
      aðeins ef þú kveikir sérstaklega á þeim. Þú getur slökkt aftur hvenær sem er.
      Notendur í öðrum hópum sjá þig aldrei. Í lifandi umferð á skjávarpanum sést
      gælunafnið þitt aðeins ef þú ert á stigatöflunni; annars heitir þú þar „Leikmaður“
      og númer.</li>
  <li><b>Allur hópurinn, ef kennarinn setur sameiginlegt markmið</b> — sér eina samtölu
      fyrir vikuna: hve mörg rétt svör hópurinn hefur gefið, eða hve margir hafa lokið
      tilteknum fjölda lota. Þín svör teljast með, líka þótt þú sért ekki á stigatöflunni,
      en enginn sér hvað þú lagðir til — hvorki tölu né nafn. Í hópi með færri en
      ${CLASS_GOAL.minPupils} nemendum er ekkert sýnt, svo að samtalan sé aldrei tala eins
      nemanda.</li>
  <li><b>Kennari eða forsjáraðili hópsins þíns</b> — sá sem umsjónarmaður hefur gert
      að forsjáraðila í hópnum — sér gælunafnið þitt, villumynstrin þín (hve oft svar
      var rangt af síðustu svörum sem prófa hvert mynstur, eins og þú sérð sjálf(ur)
      undir <i>Framvinda</i>), niðurstöður verkefna sem hann setur og hve mörg svör voru
      rétt hjá þér í bekkjareinvígi. Hann getur líka
      opnað færnikortið þitt, sama kort og þú sérð undir <i>Framvinda</i>: hvert
      efnisatriði, hve gott vald þú hefur á því, hve margt bíður upprifjunar þar og
      hvaða málfræðiatriði hafa farið úrskeiðis (til dæmis „þágufall, fleirtala“).
      Þetta er til þess að hann geti séð hvað hópurinn þarf að æfa og hjálpað þér. Hann sér
      <b>ekki</b> það sem þú skrifar í svörin, því það er aldrei geymt, ekki hvaða orð
      fóru úrskeiðis hjá þér og ekki hvenær eða hve lengi þú æfir þig. Undir <i>Aðgangurinn minn</i> stendur hver það er.
      Forsjáraðilar í öðrum hópum sjá ekkert um þig.</li>
  <li><b>Umsjónarmaður</b> sér notendalistann og getur skoðað framvinduna þína ef
      þess þarf, til dæmis til að laga villu. Hann sér aldrei lykilorðið. Hann sér líka
      nafnlausu talninguna og sýnið af röngum svörum, ef kveikt er á því — en ekki hver
      á hvaða svar.</li>
  <li><b>Hýsingaraðili</b> geymir gögnin fyrir okkur og má ekki nota þau í neitt
      annað („vinnsluaðili“). ${host}</li>
  <li><b>Enginn annar.</b> Gögnin eru ekki seld, ekki afhent og ekki notuð í
      auglýsingar. Síðan sækir ekkert frá öðrum fyrirtækjum — hvorki letur,
      greiningartól né samfélagsmiðlahnappa.</li>
</ul>

${SECOND_LANGUAGE_NOTICE}

<h2>Hve lengi?</h2>
<ul>
  <li>Á meðan aðgangurinn þinn er til.</li>
  <li>Aðgangi sem enginn hefur skráð sig inn á í <b>${cfg.inactiveMonths} mánuði</b>
      er eytt sjálfkrafa, með allri framvindu.</li>
  <li>Beiðni um aðgang sem er ekki samþykkt innan <b>${cfg.pendingDays} daga</b> er eytt.</li>
  <li>Þegar aðgangi er eytt hverfur hann strax af þjóninum. Öryggisafrit sem
      innihalda hann eyðast innan <b>${cfg.backupDays} daga</b>.</li>
  <li>Í nafnlausu talningunni vega eldri svör minna með hverri viku og hverfa að lokum.
      Svar í sýninu af röngum svörum eyðist eftir <b>${SAMPLE.months} mánuði</b>.</li>
</ul>

<h2>Réttindin þín</h2>
<p>Allt þetta er undir <i>Stillingar og námsefni → Aðgangurinn minn</i>:</p>
<ul>
  <li><b>Sjá og sækja</b> allt sem er geymt um þig, í einni skrá.</li>
  <li><b>Leiðrétta</b> gælunafnið og skipta um lykilorð.</li>
  <li><b>Ráða</b> hvort þú sést á stigatöflunni.</li>
  <li><b>Ráða</b> hvort svörin þín eru talin með í nafnlausu talningunni.</li>
  <li><b>Eyða</b> aðganginum og öllu sem honum fylgir.</li>
</ul>
<p>Foreldri eða forsjáraðili barns yngra en ${CONSENT_AGE} ára getur beðið um
   það sama fyrir barnið með því að hafa samband við ábyrgðaraðila hér að ofan.</p>
<p>Ef þér finnst ekki farið rétt með gögnin þín getur þú kvartað til
   Persónuverndar: <a href="https://www.personuvernd.is" rel="noopener">personuvernd.is</a>.</p>

<h2>Vefkökur</h2>
<p>Ein kaka, <code>fallaskoli</code>, sem man að þú ert skráð(ur) inn. Hún gildir
   í ${RETENTION.sessionDays} daga eða þar til þú skráir þig út. Hún er nauðsynleg
   til að forritið virki og þess vegna er ekki spurt um leyfi fyrir henni. Engar
   aðrar kökur eru notaðar.</p>

<h2>Ef eitthvað fer úrskeiðis</h2>
<p>Ef gögn leka eða komast í rangar hendur lætur ábyrgðaraðili Persónuvernd vita
   innan 72 klukkustunda og þig (eða forsjáraðila þinn) eins fljótt og hægt er,
   ef það gæti skipt þig máli.</p>
</main></body></html>`;
}

/* ---------- item 45: Icelandic as a second language — a paragraph of its own ----
 * In force from notice version PRIVACY_VERSION (2026-11-16). docs/PRIVACY.md §1e says the same
 * for the person who runs the server. */
const SECOND_LANGUAGE_NOTICE = `<h2>Íslenska sem annað mál</h2>
<p>Ef íslenska er annað tungumálið þitt getur þú kveikt á því undir <i>Stillingar</i>, eða
   kennari hópsins þíns kveikt á því fyrir þig. Þá er geymt eitt já eða nei: með stillingunum
   þínum ef þú kveiktir á því, eða með aðganginum þínum ef kennarinn gerði það. Það er aðeins
   notað til að sýna skýringar á orðum, láta þyngdina hækka hægar og velja villuveiðar við hæfi.
   Aðrir nemendur sjá það aldrei. Kennarinn sér það aðeins fyrir nemendur í sínum hópi.
   Það fylgir með þegar þú sækir gögnin þín og eyðist með aðganginum.</p>
<p>Þegar setning er lesin upphátt gerir tækið þitt það sjálft. Setningin er ekki send neitt,
   og ef tækið á enga íslenska rödd er hnappurinn ekki sýndur.</p>`;

/* ---------- item 46: Ritun vikunnar — what a pupil writes, a paragraph of its own ----
 * In force from notice version PRIVACY_VERSION (2026-11-16). Placed straight after the short
 * version, because it is the one exception to "what you write is not kept",
 * and a pupil should meet it early. The numbers are the ones
 * server/writing.mjs acts on. docs/PRIVACY.md §1f. */
const WRITING_NOTICE = `<h2>Ritun vikunnar: textinn sem þú skrifar</h2>
<p>Einu sinni í viku getur þú skrifað þrjár setningar um efni vikunnar. Sjálfgefið er slökkt á
   yfirlestri. Þá er textinn ekki sendur neitt og ekki geymdur.</p>
<p>Ef kennari hópsins þíns kveikir á yfirlestri er textinn sendur á þennan netþjón þegar þú ýtir á
   <i>Lesa yfir</i>. Þar les forritið GreynirCorrect hann yfir og sendir athugasemdirnar til baka.
   Enginn annar fær textann. Hann er hvorki skrifaður í skrá né annál og gleymist um leið og
   yfirlestrinum er lokið, nema kennarinn hafi líka kveikt á því að geyma textana.</p>
<p>Ef kennarinn geymir textana stendur það á skjánum áður en þú sendir. Þá er textinn geymdur með
   aðganginum þínum, ásamt viku og efni, svo að kennarinn geti lesið hann. Aðeins kennari hópsins og
   umsjónarmaður sjá hann. Mest ${WRITING.keepPerPupil} textar frá þér eru geymdir og enginn lengur en
   ${WRITING.keepDays} daga. Textarnir fylgja með þegar þú sækir gögnin þín, þeir eyðast með aðganginum,
   og öllum textum hópsins er eytt um leið og kennarinn slekkur á því að geyma þá.
   Skrifaðu um hversdagslega hluti, ekki um neitt sem er einkamál.</p>`;
