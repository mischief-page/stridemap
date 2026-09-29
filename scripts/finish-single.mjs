// Finishes the single-file build: names the page stridemap.html, and points
// the privacy page's "Back" link at it (on the website, "./" is the page).
import { readFileSync, renameSync, writeFileSync } from 'node:fs';

renameSync('dist-single/index.html', 'dist-single/stridemap.html');
const privacy = 'dist-single/privacy.html';
writeFileSync(privacy, readFileSync(privacy, 'utf8').replace('href="./"', 'href="stridemap.html"'));
