import { makeSampleExport } from '../scripts/make-sample-export';

/** A small fake Health export for the import tests. */
export const SAMPLE_EXPORT = 'e2e/.cache/sample-export.zip';

export default async function globalSetup() {
  await makeSampleExport(SAMPLE_EXPORT, 40);
}
