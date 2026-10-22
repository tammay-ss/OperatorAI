const test = require('node:test');
const assert = require('node:assert');
const {
  analyzePriority,
  getCoordinates,
  extractStructuredEntities,
  getEmergencyType,
} = require('../src/utils');

test('Baseline: Priority analysis identifies high priority emergencies', () => {
  const priority = analyzePriority('Severe chest pain and breathlessness. We need an ambulance immediately!');
  assert.strictEqual(priority, 'HIGH');
});

test('Baseline: Priority analysis identifies medium priority incidents', () => {
  const priority = analyzePriority('Minor traffic collision and theft occurred near the market.');
  assert.strictEqual(priority, 'MEDIUM');
});

test('Baseline: Priority analysis identifies low priority inquiries', () => {
  const priority = analyzePriority('Calling for general inquiry about lost property.');
  assert.strictEqual(priority, 'LOW');
});

test('Baseline: Geocodes known Indian locations using local database fallback', async () => {
  const coords = await getCoordinates('chennai central');
  assert.ok(coords, 'Coordinates should be resolved');
  assert.strictEqual(coords.lat, 13.0827);
  assert.strictEqual(coords.lng, 80.2755);
  assert.strictEqual(coords.source, 'local_db');
});

test('Baseline: Extracts structured entities for victims and injuries', () => {
  const entities = extractStructuredEntities('Two people are injured in a car crash on the road.');
  assert.strictEqual(entities.victims, 2);
  assert.ok(Array.isArray(entities.injuries));
  assert.ok(entities.injuries.includes('injured'));
  assert.ok(Array.isArray(entities.vehicles));
  assert.ok(entities.vehicles.includes('car'));
});

test('Baseline: Classifies emergency type correctly', async () => {
  const result = await getEmergencyType('A commercial LPG cylinder caught fire with thick smoke.');
  assert.strictEqual(result.emergencyType, 'Fire Emergency');
  assert.ok(result.confidence > 0.5);
});
