const { pathToFileURL } = require('url');

async function main() {
const { PascalLexer } = await import(pathToFileURL(__dirname + '/pascal-lexer.js').href);
const { PascalParser } = await import(pathToFileURL(__dirname + '/pascal-parser.js').href);
const { FlowchartGenerator } = await import(pathToFileURL(__dirname + '/flowchart-generator.js').href);

const code = `program ArrayWhileBubbleSort;
var
  arr: array[1..5] of integer;
  i, j, temp: integer;
begin
  arr[1] := 34; arr[2] := 12; arr[3] := 5; arr[4] := 90; arr[5] := 25;
  i := 1;
  while i <= 4 do
  begin
    j := 1;
    while j <= 5 - i do
    begin
      if arr[j] > arr[j + 1] then
      begin
        temp := arr[j];
        arr[j] := arr[j + 1];
        arr[j + 1] := temp;
      end;
      j := j + 1;
    end;
    i := i + 1;
  end;
  i := 1;
  while i <= 5 do
  begin
    write(arr[i], ' ');
    i := i + 1;
  end;
end.`;

const lexer = new PascalLexer(code);
const tokens = lexer.tokenize();
const parser = new PascalParser(tokens);
const ast = parser.parse();
const gen = new FlowchartGenerator();
const fc = gen.generate(ast);

const NW = 200, NH = 40, VGAP = 50, HGAP = 100, PAD = 30;
const baseX = 400;

fc.nodes.forEach(n => {
    n.w = NW; n.h = NH;
    n.x = baseX + n.col * (NW + HGAP);
    n.y = PAD + n.row * (NH + VGAP);
});

let minX = Infinity, maxX = -Infinity, maxY = 0;
fc.nodes.forEach(n => {
    const left = n.type === 'decision' ? n.x - 14 : n.x;
    const right = n.type === 'decision' ? n.x + n.w + 14 : n.x + n.w;
    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, n.y + n.h + 14);
});

const farMinX = minX - HGAP - 60;
const farMaxX = maxX + HGAP + 60;
const contentW = farMaxX - farMinX;
const canvasW = contentW + PAD * 2;
const canvasH = maxY + PAD + 40;

const shiftX = (canvasW - contentW) / 2 - farMinX;
const _minX = minX + shiftX;
const _maxX = maxX + shiftX;
const farLeft = _minX - HGAP;
const farRight = _maxX + HGAP;

console.log('Canvas: ' + canvasW + 'x' + canvasH);
console.log('_minX=' + _minX + ' _maxX=' + _maxX);
console.log('farLeft=' + farLeft + ' farRight=' + farRight);
console.log();

fc.edges.forEach(e => {
    if (e.type === 'back') {
        const fNode = fc.nodes.find(x => x.id === e.from);
        const tNode = fc.nodes.find(x => x.id === e.to);
        const lx = farLeft + (e.backDepth||0) * 30;
        console.log('BACK: ' + fNode.label + ' -> ' + tNode.label + ' depth=' + (e.backDepth||0) + ' lx=' + lx);
    }
    if (e.type === 'right-exit') {
        const fNode = fc.nodes.find(x => x.id === e.from);
        const tNode = fc.nodes.find(x => x.id === e.to);
        const rx = farRight - (e.backDepth||0) * 30;
        console.log('EXIT: ' + fNode.label + ' -> ' + tNode.label + ' depth=' + (e.backDepth||0) + ' rx=' + rx);
    }
});

}

main().catch(err => { console.error(err); process.exit(1); });
