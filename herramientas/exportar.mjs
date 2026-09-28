/**
 * EXPORTA UN TRABAJO PARA LA IMPRENTA.
 *
 *   node herramientas/exportar.mjs clientes/panaderia-sol/2026-10-volante
 *   node herramientas/exportar.mjs --todo          todos los trabajos
 *
 * Por cada .pieza de cada HTML del trabajo deja en `salida/`:
 *
 *   …-IMPRENTA.pdf   vectorial, a medida real CON sangría. Es lo que se entrega.
 *   …-IMPRENTA.png   la misma pieza en píxeles, a los ppp del trabajo, para el
 *                    taller que solo acepta imagen.
 *   …-REVISION.png   pequeña y con las guías de corte, para mandar al cliente.
 *                    NO se imprime.
 *   LEEME-IMPRENTA.txt   medida, material, acabado y cantidad, sacados de
 *                    trabajo.json. Sin eso, un PDF es un PDF.
 *
 * ── LO QUE COMPRUEBA, Y SE NIEGA SI FALLA ─────────────────────────────────
 * 1. Que ningún texto se salga de la zona segura. Lo decide el navegador
 *    midiendo, no una fórmula por número de caracteres: esa falla justo en el
 *    caso que no se probó.
 * 2. Que ningún texto quede cortado dentro de su caja (desbordado).
 * 3. Que la medida dibujada sea la de trabajo.json: un volante que alguien
 *    dejó en 14 × 21 en vez de 14.8 × 21 sale mal cortado y nadie lo nota
 *    hasta que llegan las mil copias.
 * 4. Que las fuentes hayan cargado. Si no, Chrome pone otra por detrás y la
 *    pieza sale con una letra que nadie eligió.
 *
 * Con cualquier fallo no escribe los archivos -IMPRENTA: mejor sin archivo
 * que con uno malo en la carpeta de entregar.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PX_POR_CM = 96 / 2.54;
// Chrome no hace capturas de más de ~16 000 px por lado. Un pendón de 160 cm
// a 300 ppp son 18 900: por encima se baja la resolución del PNG y se avisa.
// El PDF no tiene ese límite porque es vectorial.
const MAX_PX = 16000;

// ── Qué trabajos ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let trabajos;
if (args.includes("--todo")) {
  trabajos = buscarTrabajos(join(RAIZ, "clientes"));
} else if (args.length) {
  trabajos = args.filter((a) => !a.startsWith("--")).map((a) => resolve(a));
} else {
  console.log("Uso: node herramientas/exportar.mjs <carpeta-del-trabajo> | --todo");
  process.exit(1);
}

function buscarTrabajos(dir) {
  if (!existsSync(dir)) return [];
  const hallados = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (!statSync(p).isDirectory() || n === "salida" || n.startsWith(".")) continue;
    if (existsSync(join(p, "trabajo.json"))) hallados.push(p);
    else hallados.push(...buscarTrabajos(p));
  }
  return hallados;
}

// ── Chrome ───────────────────────────────────────────────────────────────
function buscarChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  try {
    const propio = puppeteer.executablePath();
    if (existsSync(propio)) return propio;
  } catch {}
  const cache = join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".cache", "puppeteer", "chrome");
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache)) {
      for (const exe of [
        join(cache, dir, "chrome-win64", "chrome.exe"),
        join(cache, dir, "chrome-linux64", "chrome"),
        join(cache, dir, "chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
        join(cache, dir, "chrome-mac-arm64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"),
      ]) if (existsSync(exe)) return exe;
    }
  }
  return null;
}

const chrome = buscarChrome();
if (!chrome) {
  console.error("No hay Chrome utilizable. Corre: npx puppeteer browsers install chrome");
  process.exit(1);
}

const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--hide-scrollbars", "--font-render-hinting=none", "--no-sandbox"],
});

let fallos = 0;
for (const t of trabajos) fallos += await exportarTrabajo(t);
await navegador.close();

if (fallos) {
  console.log(`\n  ✗ ${fallos} pieza(s) con problemas. No se escribieron sus archivos -IMPRENTA.\n`);
  process.exitCode = 1;
} else {
  console.log("\n  ✓ Todo listo para imprenta.\n");
}

// ─────────────────────────────────────────────────────────────────────────
async function exportarTrabajo(dir) {
  const ficha = JSON.parse(readFileSync(join(dir, "trabajo.json"), "utf8"));
  const ppp = Number(ficha.ppp ?? 300);
  const salida = join(dir, "salida");
  rmSync(salida, { recursive: true, force: true });
  mkdirSync(salida, { recursive: true });

  const htmls = ficha.archivos ?? readdirSync(dir).filter((n) => n.endsWith(".html"));
  console.log(`\n  ${relative(RAIZ, dir)} — ${ficha.cliente} · ${ficha.trabajo}`);

  const hechas = [];
  let fallosTrabajo = 0;

  for (const html of htmls) {
    const pagina = await navegador.newPage();
    await pagina.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
    await pagina.goto(pathToFileURL(join(dir, html)).href, { waitUntil: "networkidle0" });
    await pagina.evaluate(() => document.fonts.ready);

    const piezas = await pagina.evaluate(revisar, PX_POR_CM);
    if (!piezas.length) {
      console.log(`    ✗ ${html}: no tiene ningún elemento .pieza`);
      fallosTrabajo++;
      await pagina.close();
      continue;
    }

    for (const p of piezas) {
      const base = `${slug(ficha.trabajo)}-${p.nombre ? slug(p.nombre) + "-" : ""}${p.ancho}x${p.alto}cm`;
      const problemas = [...p.problemas];

      // `medidas` da la medida de piezas concretas por su data-nombre (p. ej. la
      // hoja que junta todos los stickers); las demás usan `medida`.
      const medida = ficha.medidas?.[p.nombre] ?? ficha.medida;
      if (medida) {
        const [w, h] = String(medida).toLowerCase().replace(/cm|\s/g, "").split(/[x×]/).map(Number);
        if (Math.abs(w - p.ancho) > 0.05 || Math.abs(h - p.alto) > 0.05) {
          problemas.push(`mide ${p.ancho} × ${p.alto} cm y trabajo.json dice ${medida}`);
        }
      }

      // Revisión para el cliente: pequeña, con guías. Se hace siempre, también
      // con problemas, porque sirve para verlos.
      await pagina.evaluate(() => document.documentElement.classList.add("guias"));
      await capturar(pagina, p.indice, join(salida, `${base}-REVISION.png`), Math.min(1, 1200 / p.anchoPx));
      await pagina.evaluate(() => document.documentElement.classList.remove("guias"));

      if (problemas.length) {
        console.log(`    ✗ ${base}`);
        for (const x of problemas) console.log(`        · ${x}`);
        fallosTrabajo++;
        continue;
      }

      // PNG a los ppp pedidos, o a lo máximo que Chrome deja.
      let escala = ppp / 96;
      let pppReal = ppp;
      const lado = Math.max(p.anchoPx, p.altoPx) * escala;
      if (lado > MAX_PX) {
        escala = MAX_PX / Math.max(p.anchoPx, p.altoPx);
        pppReal = Math.floor(escala * 96);
      }
      await capturar(pagina, p.indice, join(salida, `${base}-IMPRENTA.png`), escala);

      // PDF vectorial con sangría: una página del tamaño exacto de la pieza.
      await pdf(pagina, p, join(salida, `${base}-IMPRENTA.pdf`));

      hechas.push({ base, ...p, pppReal });
      console.log(`    ✓ ${base}  (${p.anchoS} × ${p.altoS} cm con sangría · PNG a ${pppReal} ppp${pppReal < ppp ? " — REBAJADO, usar el PDF" : ""})`);
    }
    await pagina.close();
  }

  writeFileSync(join(salida, "LEEME-IMPRENTA.txt"), leeme(ficha, hechas));
  return fallosTrabajo;
}

/** Corre DENTRO de la página. Mide cada .pieza y busca textos fuera de sitio. */
function revisar(PX_POR_CM) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const salida = [];
  const fuentesMal = [...document.fonts].filter((f) => f.status === "error").map((f) => f.family);

  document.querySelectorAll(".pieza").forEach((pieza, indice) => {
    const cs = getComputedStyle(pieza);
    const sangriaPx = parseFloat(cs.getPropertyValue("--sangria-px")) ||
      (() => {
        const tmp = document.createElement("div");
        tmp.style.width = cs.getPropertyValue("--sangria") || "3mm";
        pieza.appendChild(tmp);
        const w = tmp.getBoundingClientRect().width;
        tmp.remove();
        return w;
      })();
    const caja = pieza.getBoundingClientRect();
    const problemas = fuentesMal.map((f) => `la fuente «${f}» no cargó`);

    // Una fuente de Google que no llegó no da error: simplemente no existe, y
    // Chrome pone otra sin avisar. Por eso se mira que la primera familia de
    // cada texto esté CARGADA, salvo las genéricas y las que trae todo sistema.
    const cargadas = new Set([...document.fonts].filter((f) => f.status === "loaded")
      .map((f) => f.family.replace(/["']/g, "").toLowerCase()));
    const deSistema = new Set(["serif", "sans-serif", "monospace", "cursive", "system-ui",
      "arial", "helvetica", "georgia", "times new roman", "verdana", "courier new"]);
    const familiaDe = (el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim().toLowerCase();

    const seguro = pieza.querySelector(".seguro");
    if (!seguro) problemas.push("no tiene zona .seguro");
    const zs = seguro?.getBoundingClientRect();

    // Todo elemento que tenga texto propio (no solo el de sus hijos).
    const conTexto = [...pieza.querySelectorAll("*")].filter((el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
      getComputedStyle(el).visibility !== "hidden" && !el.closest("[data-fuera-de-zona]"));

    for (const el of conTexto) {
      const nombre = `«${el.textContent.trim().slice(0, 30)}»`;
      const fam = familiaDe(el);
      if (!deSistema.has(fam) && !cargadas.has(fam)) {
        // Una vez por fuente: con decir que falta basta, no hace falta la lista de textos.
        problemas.push(`la fuente «${fam}» no cargó: el texto saldría con otra letra`);
      }
      // El rectángulo del TEXTO, no de la caja: un <p> ancho con texto corto
      // no está fuera aunque su caja lo esté.
      const rango = document.createRange();
      rango.selectNodeContents(el);
      const r = rango.getBoundingClientRect();
      if (zs && (r.left < zs.left - 0.5 || r.right > zs.right + 0.5 || r.top < zs.top - 0.5 || r.bottom > zs.bottom + 0.5)) {
        problemas.push(`${nombre} se sale de la zona segura`);
      }
      const ov = getComputedStyle(el).overflow;
      if (ov !== "visible" && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
        problemas.push(`${nombre} queda cortado dentro de su caja`);
      }
    }

    const ancho = caja.width - 2 * sangriaPx, alto = caja.height - 2 * sangriaPx;
    salida.push({
      indice,
      nombre: pieza.dataset.nombre ?? "",
      ancho: r2(ancho / PX_POR_CM), alto: r2(alto / PX_POR_CM),
      anchoS: r2(caja.width / PX_POR_CM), altoS: r2(caja.height / PX_POR_CM),
      sangriaMm: r2(sangriaPx / PX_POR_CM * 10),
      anchoPx: caja.width, altoPx: caja.height,
      problemas: [...new Set(problemas)],
    });
  });
  return salida;
}

async function capturar(pagina, indice, archivo, escala) {
  await pagina.setViewport({ width: 1200, height: 900, deviceScaleFactor: escala });
  const el = (await pagina.$$(".pieza"))[indice];
  await el.screenshot({ path: archivo });
}

async function pdf(pagina, p, archivo) {
  // Deja SOLO esta pieza, pegada a la esquina, sin fondo gris ni márgenes.
  await pagina.evaluate((i) => {
    document.documentElement.classList.add("exportando");
    document.querySelectorAll(".pieza").forEach((el, j) => { el.style.display = j === i ? "" : "none"; });
  }, p.indice);
  await pagina.addStyleTag({ content: `
    @page { size: ${p.anchoS}cm ${p.altoS}cm; margin: 0; }
    html.exportando, html.exportando body { background: none !important; padding: 0 !important; margin: 0 !important;
      display: block !important; min-height: 0 !important; }
    html.exportando .pieza { margin: 0 !important; break-after: avoid; }
  ` });
  await pagina.pdf({ path: archivo, printBackground: true, preferCSSPageSize: true, pageRanges: "1" });
  await pagina.evaluate(() => {
    document.documentElement.classList.remove("exportando");
    document.querySelectorAll(".pieza").forEach((el) => { el.style.display = ""; });
  });
}

function leeme(f, hechas) {
  const l = [];
  l.push(`CLIENTE:   ${f.cliente}`);
  l.push(`TRABAJO:   ${f.trabajo}`);
  l.push("");
  l.push(`MEDIDA FINAL (corte):  ${f.medida ?? "(ver cada archivo)"}`);
  for (const [n, m] of Object.entries(f.medidas ?? {})) l.push(`   · ${n}: ${m}`);
  l.push(`MATERIAL:              ${f.material ?? "—"}`);
  l.push(`ACABADO:               ${f.acabado ?? "—"}`);
  l.push(`CANTIDAD:              ${f.cantidad ?? "—"}`);
  if (f.caras) l.push(`CARAS:                 ${f.caras}`);
  l.push("");
  l.push("ARCHIVOS");
  for (const h of hechas) {
    l.push(`  ${h.base}-IMPRENTA.pdf`);
    l.push(`     ${h.anchoS} × ${h.altoS} cm CON sangría de ${h.sangriaMm} mm por lado · corte a ${h.ancho} × ${h.alto} cm`);
    l.push(`     Hay PNG a ${h.pppReal} ppp si el taller no trabaja con PDF.`);
  }
  l.push("");
  l.push("Los archivos -REVISION.png llevan las guías de corte dibujadas. NO SE IMPRIMEN.");
  l.push("Colores en RGB. Si el taller necesita CMYK, que convierta con su perfil y mande prueba.");
  if (f.notas) { l.push(""); l.push("NOTAS"); l.push(`  ${f.notas}`); }
  return l.join("\n") + "\n";
}

function slug(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
