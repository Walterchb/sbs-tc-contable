# SBS TC Contable - Repo limpio (sin Node/npm)

Este repo scrapea el tipo de cambio contable SBS con GitHub Actions (server-side)
y publica archivos de salida en `data/` para descargar desde `index.html`.

## Archivos principales
- `.github/workflows/sbs-tc.yml` (scraper inline en Python)
- `index.html` (descarga CSV/JSON latest)
- `data/tc_contable_meta.json` (seed inicial)

## Pasos (nuevo repo)
1. Sube TODO este contenido al repo nuevo.
2. Settings -> Actions -> General -> Workflow permissions:
   - **Read and write permissions**
3. Actions -> `SBS TC Contable Update` -> **Run workflow**
4. Settings -> Pages -> Deploy from branch:
   - Branch `main`, Folder `/ (root)`
5. Abre tu GitHub Pages:
   - `https://TU_USUARIO.github.io/TU_REPO/`

## Nota
El cron usa UTC y ejecuta en minutos 7, 22, 37 y 52 de cada hora.
