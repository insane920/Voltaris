import assert from 'node:assert/strict';
import { SAMPLE_CIRCUITS } from '../src/data/sampleCircuits';
import { exportToYamlScm, parseYamlScm } from '../src/utils/yamlScm';
import { solveCircuitTransient, formatEngValue } from '../src/math/circuitSolver';
import { COMPONENT_CATALOG } from '../src/components/ComponentPalette';
import { renderComponentSymbol } from '../src/components/ComponentSymbol';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeOrthogonalWirePoints, getComponentPins } from '../src/components/SchematicEditor';
import { buildCircuitGraph } from '../src/math/circuitSolver';

assert.equal(formatEngValue(150e-6, 'с'), '150 мкс');
assert.equal(formatEngValue(200, 'В'), '200 В');
assert.equal(formatEngValue(1.5, 'А'), '1.5 А');
for (const sample of SAMPLE_CIRCUITS) {
  const content = exportToYamlScm(sample.elements, sample.wires, sample.transient);
  const parsed = parseYamlScm(content);
  assert.equal(parsed.elements.length, sample.elements.length, `${sample.id}: element count`);
  assert.equal(parsed.wires.length, sample.wires.length, `${sample.id}: wire count`);
  assert.deepEqual(parsed.elements.map(e => e.type), sample.elements.map(e => e.type), `${sample.id}: types`);
  assert.deepEqual(parsed.elements.map(e => [e.name, e.x, e.y, e.value, e.valueStr, e.secondaryValue]), sample.elements.map(e => [e.name, e.x, e.y, e.value, e.valueStr, e.secondaryValue]), `${sample.id}: parameters`);
  const ids = new Set(parsed.elements.map(e => e.id));
  assert.ok(parsed.wires.every(w => ids.has(w.fromCompId) && ids.has(w.toCompId)), `${sample.id}: connections`);
  const results = solveCircuitTransient(parsed.elements, parsed.wires, parsed.transient);
  assert.ok(results.time.length > 0 && results.time.every(Number.isFinite), `${sample.id}: time series`);
  for (const [name, values] of Object.entries(results.signals)) {
    assert.equal(values.length, results.time.length, `${sample.id}: signal ${name} length`);
    assert.ok(values.every(Number.isFinite), `${sample.id}: signal ${name} values`);
  }
}
const connectedSample = SAMPLE_CIRCUITS[0];
const beforeGraph = buildCircuitGraph(connectedSample.elements, connectedSample.wires);
const movedElements = connectedSample.elements.map((element, index) => ({ ...element, x: element.x + index * 20, y: element.y - index * 40, rotation: (element.rotation + 90) % 360 }));
const afterGraph = buildCircuitGraph(movedElements, connectedSample.wires);
assert.deepEqual([...afterGraph.pinToNode], [...beforeGraph.pinToNode], 'Movement and rotation must preserve connectivity');
for (const wire of connectedSample.wires) {
  const from = movedElements.find(e => e.id === wire.fromCompId)!;
  const to = movedElements.find(e => e.id === wire.toCompId)!;
  const fromPin = getComponentPins(from).find(p => p.id === wire.fromPinId)!;
  const toPin = getComponentPins(to).find(p => p.id === wire.toPinId)!;
  const start = { x: from.x + fromPin.x, y: from.y + fromPin.y };
  const end = { x: to.x + toPin.x, y: to.y + toPin.y };
  const path = computeOrthogonalWirePoints(start, end, fromPin, toPin, from.type, to.type);
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), end);
  assert.ok(path.slice(1).every((point, i) => point.x === path[i].x || point.y === path[i].y), 'All wire segments must remain orthogonal');
}
const straightRoute = computeOrthogonalWirePoints({ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 30, y: 0 }, { x: -30, y: 0 });
const separatedRoute = computeOrthogonalWirePoints({ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 30, y: 0 }, { x: -30, y: 0 }, undefined, undefined, 20);
assert.notDeepEqual(separatedRoute, straightRoute, 'Parallel wires must support separate grid tracks');
assert.ok(separatedRoute.slice(1).every((point, i) => point.x === separatedRoute[i].x || point.y === separatedRoute[i].y), 'Separated wire tracks must remain orthogonal');
for (const component of COMPONENT_CATALOG) {
  const markup = renderToStaticMarkup(renderComponentSymbol({ id: 'test', type: component.type, name: 'test', x: 0, y: 0, rotation: 0, value: 0, valueStr: '', unit: '' }));
  assert.ok(markup.length > 0, `${component.type}: symbol`);
  assert.ok(!markup.includes('r="10"'), `${component.type}: fallback symbol must not be used`);
}
console.log(`PASS: ${SAMPLE_CIRCUITS.length} sample file round-trips and simulations; ${COMPONENT_CATALOG.length} component symbols.`);
