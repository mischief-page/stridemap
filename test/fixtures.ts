import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';

export const EXPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Workout)*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
]>
<HealthData locale="en_US">
 <ExportDate value="2026-09-01 10:00:00 -0700"/>
 <Me HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexNotSet"/>
 <Record type="HKQuantityTypeIdentifierStepCount" unit="count" value="120" startDate="2026-08-01 07:00:00 -0700" endDate="2026-08-01 07:01:00 -0700"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30" durationUnit="min" startDate="2026-08-01 07:00:00 -0700" endDate="2026-08-01 07:30:00 -0700">
  <MetadataEntry key="HKIndoorWorkout" value="0"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="300" unit="Cal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="5.2" unit="km"/>
  <WorkoutRoute sourceName="Watch" startDate="2026-08-01 07:00:00 -0700" endDate="2026-08-01 07:30:00 -0700">
   <MetadataEntry key="HKMetadataKeySyncVersion" value="2"/>
   <FileReference path="/workout-routes/route_2026-08-01_7.00am.gpx"/>
  </WorkoutRoute>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="20" durationUnit="min" totalDistance="1.1" totalDistanceUnit="mi" startDate="2019-03-02 18:00:00 +0100" endDate="2019-03-02 18:20:00 +0100">
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="25" durationUnit="min" startDate="2026-08-03 07:00:00 -0700" endDate="2026-08-03 07:25:00 -0700">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" startDate="2026-08-04 07:00:00 -0700" endDate="2026-08-04 08:00:00 -0700">
 </Workout>
</HealthData>
`;

export const ROUTE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Apple Health Export" xmlns="http://www.topografix.com/GPX/1/1">
 <metadata><time>2026-09-01T17:00:00Z</time></metadata>
 <trk><name>Route 2026-08-01 7:00am</name><trkseg>
  <trkpt lon="-100.000000" lat="40.000000"><ele>100</ele><time>2026-08-01T14:00:00Z</time><extensions><speed>3.0</speed><course>0</course><hAcc>4.0</hAcc><vAcc>3.0</vAcc></extensions></trkpt>
  <trkpt lon="-100.000000" lat="40.000027"><ele>100</ele><time>2026-08-01T14:00:01Z</time><extensions><speed>3.0</speed><course>0</course><hAcc>4.0</hAcc><vAcc>3.0</vAcc></extensions></trkpt>
  <trkpt lon="-100.000000" lat="40.000054"><ele>100</ele><time>2026-08-01T14:00:02Z</time><extensions><speed>3.1</speed><course>0</course><hAcc>4.5</hAcc><vAcc>3.0</vAcc></extensions></trkpt>
 </trkseg></trk>
</gpx>
`;

/** Builds an export.zip laid out the way the Health app writes it. */
export async function buildExportZip(): Promise<Blob> {
  const writer = new ZipWriter(new BlobWriter('application/zip'), { useWebWorkers: false });
  await writer.add('apple_health_export/export.xml', new TextReader(EXPORT_XML));
  await writer.add('apple_health_export/export_cda.xml', new TextReader('<ClinicalDocument/>'));
  await writer.add(
    'apple_health_export/workout-routes/route_2026-08-01_7.00am.gpx',
    new TextReader(ROUTE_GPX),
  );
  return writer.close();
}
