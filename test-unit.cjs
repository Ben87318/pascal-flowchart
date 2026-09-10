const { pathToFileURL } = require('url');

async function main() {
const { PascalLexer } = await import(pathToFileURL(__dirname + '/pascal-lexer.js').href);
const { PascalParser } = await import(pathToFileURL(__dirname + '/pascal-parser.js').href);
const { FlowchartGenerator } = await import(pathToFileURL(__dirname + '/flowchart-generator.js').href);

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (condition) {
        passed++;
    } else {
        failed++;
        console.error('  FAIL: ' + msg);
    }
}

function assertEq(actual, expected, msg) {
    if (actual === expected) {
        passed++;
    } else {
        failed++;
        console.error('  FAIL: ' + msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
    }
}

function tokenize(code) {
    return new PascalLexer(code).tokenize();
}

function parse(code) {
    const tokens = new PascalLexer(code).tokenize();
    return new PascalParser(tokens).parse();
}

function generate(code) {
    const ast = parse(code);
    return new FlowchartGenerator().generate(ast);
}

// === LEXER TESTS ===
console.log('=== LEXER ===');

(function testKeywords() {
    const tokens = tokenize('program var begin end if then else');
    const types = tokens.map(t => t.type);
    assertEq(types[0], 'PROGRAM', 'keyword program');
    assertEq(types[1], 'VAR', 'keyword var');
    assertEq(types[2], 'BEGIN', 'keyword begin');
    assertEq(types[3], 'END', 'keyword end');
    assertEq(types[4], 'IF', 'keyword if');
    assertEq(types[5], 'THEN', 'keyword then');
    assertEq(types[6], 'ELSE', 'keyword else');
})();

(function testOperators() {
    const tokens = tokenize(':= = <> < > <= >= + - * /');
    const types = tokens.map(t => t.type);
    assertEq(types[0], 'ASSIGN', 'operator :=');
    assertEq(types[1], 'EQ', 'operator =');
    assertEq(types[2], 'NEQ', 'operator <>');
    assertEq(types[3], 'LT', 'operator <');
    assertEq(types[4], 'GT', 'operator >');
    assertEq(types[5], 'LTE', 'operator <=');
    assertEq(types[6], 'GTE', 'operator >=');
    assertEq(types[7], 'PLUS', 'operator +');
    assertEq(types[8], 'MINUS', 'operator -');
    assertEq(types[9], 'STAR', 'operator *');
    assertEq(types[10], 'SLASH', 'operator /');
})();

(function testNumbers() {
    const tokens = tokenize('42 3.14');
    assertEq(tokens[0].type, 'INTEGER', 'integer token type');
    assertEq(tokens[0].value, '42', 'integer token value');
    assertEq(tokens[1].type, 'REAL', 'real token type');
    assertEq(tokens[1].value, '3.14', 'real token value');
})();

(function testStrings() {
    const tokens = tokenize("'hello' 'it''s'");
    assertEq(tokens[0].type, 'STRING', 'string token type');
    assertEq(tokens[0].value, 'hello', 'string value');
    assertEq(tokens[1].type, 'STRING', 'escaped quote string');
    assertEq(tokens[1].value, "it's", 'escaped quote value');
})();

(function testCharCodes() {
    const tokens = tokenize('#65#66');
    assertEq(tokens[0].type, 'STRING', 'char code token type');
    assertEq(tokens[0].value, 'AB', 'char code value');
})();

(function testComments() {
    const tokens = tokenize('a {comment} b (*comment2*) c //comment3');
    const ids = tokens.filter(t => t.type === 'IDENT');
    assertEq(ids.length, 3, 'three identifiers after comments');
    assertEq(ids[0].value, 'a', 'ident a');
    assertEq(ids[1].value, 'b', 'ident b');
    assertEq(ids[2].value, 'c', 'ident c');
})();

(function testDelimiters() {
    const tokens = tokenize('( ) [ ] ; , : . ..');
    const types = tokens.map(t => t.type);
    assertEq(types[0], 'LPAREN', '(');
    assertEq(types[1], 'RPAREN', ')');
    assertEq(types[2], 'LBRACKET', '[');
    assertEq(types[3], 'RBRACKET', ']');
    assertEq(types[4], 'SEMICOLON', ';');
    assertEq(types[5], 'COMMA', ',');
    assertEq(types[6], 'COLON', ':');
    assertEq(types[7], 'DOT', '.');
    assertEq(types[8], 'DOTDOT', '..');
})();

// === PARSER TESTS ===
console.log('\n=== PARSER ===');

(function testMinimalProgram() {
    const ast = parse('program Test; begin end.');
    assertEq(ast.type, 'Program', 'program type');
    assertEq(ast.name, 'Test', 'program name');
    assertEq(ast.body.length, 0, 'empty body');
})();

(function testVarDeclarations() {
    const ast = parse('program Test; var x: integer; y: boolean; begin end.');
    assertEq(ast.declarations.length, 2, 'two var decls');
    assertEq(ast.declarations[0].type, 'VarDecl', 'var decl type');
    assertEq(ast.declarations[0].name, 'x', 'first var name');
    assertEq(ast.declarations[1].name, 'y', 'second var name');
})();

(function testAssignment() {
    const ast = parse('program Test; begin x := 42; end.');
    assertEq(ast.body.length, 1, 'one statement');
    assertEq(ast.body[0].type, 'Assign', 'assign type');
    assertEq(ast.body[0].name, 'x', 'assign target');
    assertEq(ast.body[0].value.type, 'Number', 'assign value type');
    assertEq(ast.body[0].value.value, '42', 'assign value');
})();

(function testIfStatement() {
    const ast = parse('program Test; begin if x > 0 then x := 1; end.');
    const ifStmt = ast.body[0];
    assertEq(ifStmt.type, 'If', 'if type');
    assertEq(ifStmt.condition.type, 'BinaryOp', 'condition is binary op');
    assertEq(ifStmt.then.type, 'Assign', 'then branch');
    assertEq(ifStmt.else, null, 'no else');
})();

(function testIfElse() {
    const ast = parse('program Test; begin if x > 0 then x := 1 else x := -1; end.');
    const ifStmt = ast.body[0];
    assert(ifStmt.else !== null, 'has else branch');
    assertEq(ifStmt.else.type, 'Assign', 'else branch type');
})();

(function testWhileLoop() {
    const ast = parse('program Test; begin while x > 0 do x := x - 1; end.');
    const whileStmt = ast.body[0];
    assertEq(whileStmt.type, 'While', 'while type');
    assertEq(whileStmt.body.type, 'Assign', 'while body');
})();

(function testRepeatUntil() {
    const ast = parse('program Test; begin repeat x := x + 1 until x >= 10; end.');
    const repeatStmt = ast.body[0];
    assertEq(repeatStmt.type, 'RepeatUntil', 'repeat type');
    assertEq(repeatStmt.body.length, 1, 'repeat body one stmt');
    assertEq(repeatStmt.condition.type, 'BinaryOp', 'until condition');
})();

(function testForLoop() {
    const ast = parse('program Test; begin for i := 1 to 10 do x := x + i; end.');
    const forStmt = ast.body[0];
    assertEq(forStmt.type, 'For', 'for type');
    assertEq(forStmt.varName, 'i', 'for var');
    assertEq(forStmt.dir, 'to', 'for direction');
})();

(function testForDownto() {
    const ast = parse('program Test; begin for i := 10 downto 1 do x := x + i; end.');
    const forStmt = ast.body[0];
    assertEq(forStmt.dir, 'downto', 'for downto direction');
})();

(function testCaseStatement() {
    const ast = parse('program Test; begin case x of 1: y := 1; 2: y := 2; end; end.');
    const caseStmt = ast.body[0];
    assertEq(caseStmt.type, 'Case', 'case type');
    assertEq(caseStmt.cases.length, 2, 'two cases');
})();

(function testProcedure() {
    const ast = parse('program Test; procedure Foo(x: integer); begin x := 1; end; begin end.');
    assertEq(ast.declarations.length, 1, 'one declaration');
    assertEq(ast.declarations[0].type, 'ProcedureDecl', 'procedure decl type');
    assertEq(ast.declarations[0].name, 'Foo', 'procedure name');
    assertEq(ast.declarations[0].params.length, 1, 'one param');
})();

(function testFunction() {
    const ast = parse('program Test; function Add(a, b: integer): integer; begin Add := a + b; end; begin end.');
    const func = ast.declarations[0];
    assertEq(func.type, 'FunctionDecl', 'function decl type');
    assertEq(func.name, 'Add', 'function name');
    assertEq(func.params.length, 2, 'two params');
    assertEq(func.returnType.type, 'Type', 'return type');
})();

(function testArrayAccess() {
    const ast = parse('program Test; begin x := arr[1]; end.');
    const assign = ast.body[0];
    assertEq(assign.value.type, 'ArrayAccess', 'array access type');
    assertEq(assign.value.name, 'arr', 'array name');
})();

(function testRecordAccess() {
    const ast = parse('program Test; begin x := rec.field; end.');
    const assign = ast.body[0];
    assertEq(assign.value.type, 'RecordAccess', 'record access type');
    assertEq(assign.value.field, 'field', 'field name');
})();

(function testNestedIf() {
    const code = 'program Test; begin if a then if b then x := 1; end.';
    const ast = parse(code);
    const outerIf = ast.body[0];
    assertEq(outerIf.type, 'If', 'outer if');
    assertEq(outerIf.then.type, 'If', 'inner if');
})();

(function testCompoundStatement() {
    const ast = parse('program Test; begin begin x := 1; y := 2; end; end.');
    assertEq(ast.body[0].type, 'Compound', 'compound type');
    assertEq(ast.body[0].statements.length, 2, 'two statements in compound');
})();

(function testExpressionPrecedence() {
    const ast = parse('program Test; begin x := 1 + 2 * 3; end.');
    const assign = ast.body[0];
    assertEq(assign.value.type, 'BinaryOp', 'binary op');
    assertEq(assign.value.op, '+', 'top op is +');
    assertEq(assign.value.right.type, 'BinaryOp', 'right is *');
    assertEq(assign.value.right.op, '*', 'right op is *');
})();

// === GENERATOR TESTS ===
console.log('\n=== GENERATOR ===');

(function testStartEndNodes() {
    const fc = generate('program Test; begin end.');
    const start = fc.nodes.find(n => n.label === 'Н');
    const end = fc.nodes.find(n => n.label === 'К');
    assert(start !== undefined, 'start node exists');
    assert(end !== undefined, 'end node exists');
    assert(start.row < end.row, 'start before end');
})();

(function testAssignNode() {
    const fc = generate('program Test; begin x := 42; end.');
    const assignNodes = fc.nodes.filter(n => n.type === 'process' && n.label.includes(':='));
    assert(assignNodes.length >= 1, 'assign node exists');
})();

(function testIfNodes() {
    const fc = generate('program Test; begin if x > 0 then x := 1; end.');
    const decisions = fc.nodes.filter(n => n.type === 'decision');
    assert(decisions.length >= 1, 'decision node for if');
    const merges = fc.nodes.filter(n => n.type === 'process' && n.label === '');
    assert(merges.length >= 1, 'merge node exists');
})();

(function testIfElseNodes() {
    const fc = generate('program Test; begin if x > 0 then x := 1 else x := -1; end.');
    const decisions = fc.nodes.filter(n => n.type === 'decision');
    assert(decisions.length >= 1, 'decision node');
    const leftBranch = fc.edges.filter(e => e.type === 'left-branch');
    const rightBranch = fc.edges.filter(e => e.type === 'right-branch');
    assert(leftBranch.length >= 1, 'left branch edge');
    assert(rightBranch.length >= 1, 'right branch edge');
})();

(function testWhileLoop() {
    const fc = generate('program Test; begin while x > 0 do x := x - 1; end.');
    const decisions = fc.nodes.filter(n => n.type === 'decision');
    assert(decisions.length >= 1, 'decision for while');
    const backs = fc.edges.filter(e => e.type === 'back');
    assert(backs.length >= 1, 'back edge for while');
    const exits = fc.edges.filter(e => e.type === 'right-exit');
    assert(exits.length >= 1, 'exit edge for while');
})();

(function testForLoop() {
    const fc = generate('program Test; begin for i := 1 to 10 do x := x + i; end.');
    const hexNodes = fc.nodes.filter(n => n.type === 'for-loop');
    assert(hexNodes.length >= 1, 'hexagon node for for-loop');
    const backs = fc.edges.filter(e => e.type === 'back');
    assert(backs.length >= 1, 'back edge for for-loop');
})();

(function testProcedureNodes() {
    const fc = generate('program Test; procedure Foo; begin end; begin end.');
    const subProcess = fc.nodes.filter(n => n.type === 'sub-process');
    const fooNode = subProcess.find(n => n.label.includes('procedure Foo'));
    assert(fooNode !== undefined, 'procedure declaration node');
})();

(function testFunctionCall() {
    const fc = generate('program Test; begin writeln(42); end.');
    const ioNodes = fc.nodes.filter(n => n.type === 'io');
    assert(ioNodes.length >= 1, 'io node for writeln');
})();

(function testReadWriteIO() {
    const fc = generate('program Test; begin read(x); write(x); end.');
    const ioNodes = fc.nodes.filter(n => n.type === 'io');
    assert(ioNodes.length >= 2, 'two io nodes for read and write');
})();

(function testConstDecl() {
    const fc = generate('program Test; const PI = 3.14; begin end.');
    const processNodes = fc.nodes.filter(n => n.type === 'process' && n.label.includes('PI'));
    assert(processNodes.length >= 1, 'const decl node');
})();

(function testEdgeConnectivity() {
    const fc = generate('program Test; begin x := 1; y := 2; z := 3; end.');
    assert(fc.edges.length > 0, 'edges exist');
    const nodeIds = new Set(fc.nodes.map(n => n.id));
    for (const e of fc.edges) {
        assert(nodeIds.has(e.from), 'edge from exists: ' + e.from);
        assert(nodeIds.has(e.to), 'edge to exists: ' + e.to);
    }
})();

(function testComplexProgram() {
    const code = `program PrimeCheck;
function IsPrime(n: integer): boolean;
var i: integer;
begin
  if n < 2 then IsPrime := false
  else begin
    IsPrime := true;
    for i := 2 to n div 2 do
      if n mod i = 0 then IsPrime := false;
  end;
end;
var number: integer;
begin
  read(number);
  if IsPrime(number) then writeln('prime')
  else writeln('not prime');
end.`;
    const fc = generate(code);
    const start = fc.nodes.find(n => n.label === 'Н');
    const end = fc.nodes.find(n => n.label === 'К');
    assert(start !== undefined, 'complex: start exists');
    assert(end !== undefined, 'complex: end exists');
    assert(fc.nodes.length > 10, 'complex: many nodes');
    assert(fc.edges.length > 10, 'complex: many edges');
})();

// === RESULTS ===
console.log('\n=== RESULTS ===');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) {
    process.exit(1);
} else {
    console.log('\nAll tests passed!');
}

}

main().catch(err => { console.error(err); process.exit(1); });
