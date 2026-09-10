const { pathToFileURL } = require('url');

async function main() {
const { PascalLexer } = await import(pathToFileURL(__dirname + '/pascal-lexer.js').href);
const { PascalParser } = await import(pathToFileURL(__dirname + '/pascal-parser.js').href);
const { FlowchartGenerator } = await import(pathToFileURL(__dirname + '/flowchart-generator.js').href);

const code = `program ArrayExamples;
var
  numbers: array[1..5] of integer;
  i: integer;
  max: integer;
begin
  numbers[1] := 10;
  numbers[2] := 5;
  numbers[3] := 20;
  numbers[4] := 15;
  numbers[5] := 30;
  max := numbers[1];
  for i := 2 to 5 do
  begin
    if numbers[i] > max then
      max := numbers[i];
  end;
  writeln('Элементы массива:');
  for i := 1 to 5 do
  begin
    write(numbers[i], ' ');
  end;
  writeln;
  writeln('Максимум в массиве: ', max);
end.`;

const lexer = new PascalLexer(code);
const tokens = lexer.tokenize();
const parser = new PascalParser(tokens);
const ast = parser.parse();
const gen = new FlowchartGenerator();
const fc = gen.generate(ast);

console.log('=== NODES ===');
fc.nodes.forEach(n => console.log('  ' + n.id + ': [' + n.type + '] "' + n.label + '" col=' + n.col + ' row=' + n.row));

console.log('\n=== EDGES ===');
fc.edges.forEach(e => {
    const fNode = fc.nodes.find(x => x.id === e.from);
    const tNode = fc.nodes.find(x => x.id === e.to);
    console.log('  ' + e.from + '(' + (fNode?fNode.label:'?') + ') -> ' + e.to + '(' + (tNode?tNode.label:'?') + ') type=' + (e.type||'default'));
});

}

main().catch(err => { console.error(err); process.exit(1); });
