const { pathToFileURL } = require('url');

async function main() {
const { PascalLexer } = await import(pathToFileURL(__dirname + '/pascal-lexer.js').href);
const { PascalParser } = await import(pathToFileURL(__dirname + '/pascal-parser.js').href);
const { FlowchartGenerator } = await import(pathToFileURL(__dirname + '/flowchart-generator.js').href);

const code = `program PrimeCheckProgram;
function IsPrime(n: integer): boolean;
var
  i: integer;
  prime: boolean;
begin
  if n < 2 then
    prime := false
  else
    begin
      prime := true;
      for i := 2 to Trunc(Sqrt(n)) do
        begin
          if n mod i = 0 then
            begin
              prime := false;
              Break;
            end;
        end;
    end;
  IsPrime := prime;
end;
var
  number: integer;
begin
  Write('Enter number: ');
  Readln(number);
  if IsPrime(number) then
    Writeln('Prime')
  else
    Writeln('Not prime');
end.`;

const lexer = new PascalLexer(code);
const tokens = lexer.tokenize();
const parser = new PascalParser(tokens);
const ast = parser.parse();
const gen = new FlowchartGenerator();
const fc = gen.generate(ast);

console.log('=== NODES (' + fc.nodes.length + ') ===');
fc.nodes.forEach(n => console.log(`  ${n.id}: [${n.type}] "${n.label}" col=${n.col} row=${n.row}`));

console.log('\n=== EDGES (' + fc.edges.length + ') ===');
fc.edges.forEach(e => {
    const fNode = fc.nodes.find(x => x.id === e.from);
    const tNode = fc.nodes.find(x => x.id === e.to);
    console.log(`  ${e.from}(${fNode?fNode.label:'?'}) -> ${e.to}(${tNode?tNode.label:'?'}) type=${e.type||'default'}`);
});

console.log('\n=== CHECKS ===');
const declNodes = fc.nodes.filter(n => (n.type === 'sub-process' || n.type === 'text') && (n.label.includes('procedure') || n.label.includes('function')));
console.log('Declaration nodes:', declNodes.length);
declNodes.forEach(n => console.log(`  ${n.id}: "${n.label}" row=${n.row}`));

const startNode = fc.nodes.find(n => n.label === 'Н');
const endNode = fc.nodes.find(n => n.label === 'К');
console.log('Start:', startNode ? `row=${startNode.row}` : 'NOT FOUND');
console.log('End:', endNode ? `row=${endNode.row}` : 'NOT FOUND');

const maxRow = Math.max(...fc.nodes.map(n => n.row));
console.log('Max row:', maxRow);

}

main().catch(err => { console.error(err); process.exit(1); });
