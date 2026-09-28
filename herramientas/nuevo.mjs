/**
 * ARRANCA UN TRABAJO NUEVO DESDE UNA PLANTILLA.
 *
 *   node herramientas/nuevo.mjs "Panadería Sol" volante volante-a5
 *     → clientes/panaderia-sol/2026-10-volante/
 *
 * La carpeta lleva la fecha delante para que los trabajos de un mismo cliente
 * salgan en orden, y para que el volante de octubre no pise al de marzo.
 */

import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cliente, trabajo, plantilla] = process.argv.slice(2);
const plantillas = readdirSync(join(RAIZ, "plantillas"));

if (!cliente || !trabajo || !plantilla || !plantillas.includes(plantilla)) {
  console.log('Uso: node herramientas/nuevo.mjs "<cliente>" "<trabajo>" <plantilla>');
  console.log(`Plantillas: ${plantillas.join(", ")}`);
  process.exit(1);
}

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hoy = new Date();
const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
const destino = join(RAIZ, "clientes", slug(cliente), `${mes}-${slug(trabajo)}`);

if (existsSync(destino)) {
  console.log(`Ya existe ${relative(RAIZ, destino)} — no lo piso.`);
  process.exit(1);
}

cpSync(join(RAIZ, "plantillas", plantilla), destino, { recursive: true });

// Las plantillas enlazan la base con ../../herramientas; el trabajo está un
// nivel más abajo (clientes/<cliente>/<trabajo>), así que se corrige la ruta.
for (const n of readdirSync(destino).filter((n) => n.endsWith(".html"))) {
  const p = join(destino, n);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("../../herramientas/", "../../../herramientas/"));
}

const ficha = JSON.parse(readFileSync(join(destino, "trabajo.json"), "utf8"));
ficha.cliente = cliente;
ficha.trabajo = trabajo;
writeFileSync(join(destino, "trabajo.json"), JSON.stringify(ficha, null, 2) + "\n");

console.log(`Creado ${relative(RAIZ, destino)}`);
console.log("Edita el HTML y trabajo.json (material, cantidad…), y luego:");
console.log(`  node herramientas/exportar.mjs ${relative(RAIZ, destino)}`);
