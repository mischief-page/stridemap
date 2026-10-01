/**
 * The last two parts of a path ("folder/file"), for matching a file listed in
 * an export's index to its entry in the zip. Exports refer to files as
 * "/workout-routes/route.gpx" or "activities/123.fit.gz", while the zip may
 * nest them under a top folder.
 */
export function lastTwoParts(path: string): string {
  return path.split('/').slice(-2).join('/');
}
