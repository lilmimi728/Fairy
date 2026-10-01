export const EXPORT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!-- HealthKit Export Version: 14 -->
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary|ClinicalRecord|Audiogram|VisionPrescription)*)>
<!ATTLIST Record type CDATA #REQUIRED>
]>
<HealthData locale="en_US">
 <ExportDate value="2026-09-29 08:00:00 -0700"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-09-28 09:00:00 -0700" endDate="2026-09-28 09:10:00 -0700" value="4000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-09-28 12:00:00 -0700" endDate="2026-09-28 12:10:00 -0700" value="3000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Mimi’s Apple Watch" unit="count" startDate="2026-09-28 09:00:00 -0700" endDate="2026-09-28 09:10:00 -0700" value="8200"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" sourceName="Watch" unit="kJ" startDate="2026-09-28 09:00:00 -0700" endDate="2026-09-28 09:10:00 -0700" value="2092"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-09-28 06:00:00 -0700" endDate="2026-09-28 06:00:00 -0700" value="52"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-09-28 18:00:00 -0700" endDate="2026-09-28 18:00:00 -0700" value="56"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Scale" unit="lb" startDate="2026-09-28 07:00:00 -0700" endDate="2026-09-28 07:00:00 -0700" value="172"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2026-09-28 07:00:00 -0700" endDate="2026-09-28 07:00:00 -0700" value="99">
  <MetadataEntry key="HKMetadataKeyHeartRateMotionContext" value="1"/>
 </Record>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-09-27 23:00:00 -0700" endDate="2026-09-28 03:00:00 -0700" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-09-28 03:00:00 -0700" endDate="2026-09-28 06:30:00 -0700" value="HKCategoryValueSleepAnalysisAsleepREM"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-09-27 22:30:00 -0700" endDate="2026-09-28 06:45:00 -0700" value="HKCategoryValueSleepAnalysisInBed"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2025-01-01 09:00:00 -0700" endDate="2025-01-01 09:10:00 -0700" value="99999"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="52.5" durationUnit="min" sourceName="Watch" startDate="2026-09-28 07:30:00 -0700" endDate="2026-09-28 08:22:30 -0700">
  <MetadataEntry key="HKIndoorWorkout" value="1"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="2026-09-28 07:30:00 -0700" endDate="2026-09-28 08:22:30 -0700" sum="310.4" unit="kcal"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="0.5" durationUnit="h" totalEnergyBurned="300" totalEnergyBurnedUnit="kcal" sourceName="Watch" startDate="2026-09-27 17:00:00 -0700" endDate="2026-09-27 17:30:00 -0700"/>
</HealthData>
`;
