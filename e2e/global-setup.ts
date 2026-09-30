import { makeSampleExport } from '../scripts/make-sample-export';
import { makeSampleStrava } from '../scripts/make-sample-strava';

/** A small fake Health export for the import tests. */
export const SAMPLE_EXPORT = 'e2e/.cache/sample-export.zip';
/** A small fake Strava download. */
export const SAMPLE_STRAVA = 'e2e/.cache/sample-strava.zip';

export default async function globalSetup() {
  await makeSampleExport(SAMPLE_EXPORT, 40);
  await makeSampleStrava(SAMPLE_STRAVA, 20);
}
