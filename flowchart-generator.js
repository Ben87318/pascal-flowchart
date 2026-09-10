export class FlowchartGenerator {
    constructor() {
        this.id = 0;
        this.nodes = [];
        this.edges = [];
        this._pendingBreaks = [];
    }

    generate(ast) {
        this.id = 0;
        this.nodes = [];
        this.edges = [];
        this._pendingBreaks = [];

        let curRow = 0;
        const centerCol = 0;

        const declResult = this.genDecls(ast.declarations || [], curRow, centerCol);
        if (declResult.last) {
            curRow = declResult.nextRow;
        }

        const bodyStartRow = curRow;
        const start = this.add('start', 'Н', centerCol, bodyStartRow);
        curRow = bodyStartRow + 1;

        const body = this.genStmts(ast.body || [], curRow, centerCol);
        this.edge(start, body.first);
        curRow = body.nextRow;
        const end = this.add('end', 'К', centerCol, curRow++);

        this.edge(body.last, end);

        return { nodes: this.nodes, edges: this.edges, startId: start, endId: end };
    }

    genDecls(list, startRow, col) {
        let first = null;
        let last = null;
        let curRow = startRow;
        for (const d of list) {
            const r = this.genDecl(d, curRow, col);
            if (!r) continue;
            if (!first) first = r.first;
            if (last !== null) this.edge(last, r.first);
            curRow = r.nextRow;
            last = r.last;
        }
        return { first, last, nextRow: curRow };
    }

    genDecl(d, row, col) {
        if (!d) return null;
        switch (d.type) {
            case 'ConstDecl': {
                const id = this.add('process', `${d.name} = ${this.expr(d.value)}`, col, row);
                return { first: id, last: id, nextRow: row + 1 };
            }
            case 'ProcedureDecl': {
                const params = d.params.map(p => {
                    const mode = p.mode ? p.mode + ' ' : '';
                    return mode + p.name + ': ' + this.typeStr(p.paramType);
                }).join('; ');
                const header = params ? `procedure ${d.name}(${params});` : `procedure ${d.name};`;
                const headerId = this.add('sub-process', header, col, row);
                const dots1 = this.add('text', '...', col, row + 1);
                const bodyR = this.genStmts(d.body || [], row + 2, col);
                if (bodyR.first) this.edge(dots1, bodyR.first);
                const dots2 = this.add('text', '...', col, bodyR.nextRow);
                if (bodyR.last) this.edge(bodyR.last, dots2);
                return { first: headerId, last: dots2, nextRow: bodyR.nextRow + 1 };
            }
            case 'FunctionDecl': {
                const params = d.params.map(p => {
                    const mode = p.mode ? p.mode + ' ' : '';
                    return mode + p.name + ': ' + this.typeStr(p.paramType);
                }).join('; ');
                const retType = d.returnType ? ': ' + this.typeStr(d.returnType) : '';
                const header = params
                    ? `function ${d.name}(${params})${retType};`
                    : `function ${d.name}${retType};`;
                const headerId = this.add('text', header, col, row);
                const dots1 = this.add('text', '...', col, row + 1);
                const bodyR = this.genStmts(d.body || [], row + 2, col);
                if (bodyR.first) this.edge(dots1, bodyR.first);
                const dots2 = this.add('text', '...', col, bodyR.nextRow);
                if (bodyR.last) this.edge(bodyR.last, dots2);
                return { first: headerId, last: dots2, nextRow: bodyR.nextRow + 1 };
            }
            default:
                return null;
        }
    }

    typeStr(t) {
        if (!t) return '';
        if (t.type === 'Type') return t.name;
        if (t.type === 'ArrayType') {
            return `array[${this.expr(t.lo)}..${this.expr(t.hi)}] of ${this.typeStr(t.elemType)}`;
        }
        if (t.type === 'RecordType') {
            const fields = t.fields.map(f => f.name + ': ' + this.typeStr(f.fieldType)).join('; ');
            return 'record ' + fields + ' end';
        }
        return t.name || t.type || '';
    }

    add(type, label, col, row) {
        const id = ++this.id;
        this.nodes.push({ id, type, label, col, row });
        return id;
    }

    edge(from, to, props) {
        if (from == null || to == null) return;
        this.edges.push({ from, to, ...props });
    }

    genStmts(list, startRow, col, depth = 0) {
        if (!list || list.length === 0) {
            const id = this.add('process', '...', col, startRow);
            return { first: id, last: id, nextRow: startRow + 1 };
        }
        let first = null;
        let last = null;
        let curRow = startRow;
        for (const s of list) {
            const r = this.genStmt(s, curRow, col, depth);
            if (!r) continue;
            if (!first) first = r.first;
            if (last !== null && !r._noConnect) this.edge(last, r.first);
            curRow = r.nextRow;
            if (r._breaksFlow) {
                last = null;
            } else {
                last = r.last;
            }
        }
        if (first === null) {
            const id = this.add('process', '...', col, curRow);
            return { first: id, last: id, nextRow: curRow + 1 };
        }
        return { first, last, nextRow: curRow };
    }

    genStmt(s, row, col, depth = 0) {
        if (!s) return null;
        switch (s.type) {
            case 'Assign': {
                const id = this.add('process', `${s.name} := ${this.expr(s.value)}`, col, row);
                return { first: id, last: id, nextRow: row + 1 };
            }
            case 'ArrayAssign': {
                const id = this.add('process', `${s.name}[${this.expr(s.index)}] := ${this.expr(s.value)}`, col, row);
                return { first: id, last: id, nextRow: row + 1 };
            }
            case 'RecordAssign': {
                const id = this.add('process', `${s.name}.${s.field} := ${this.expr(s.value)}`, col, row);
                return { first: id, last: id, nextRow: row + 1 };
            }
            case 'Ident': {
                const isIO = ['writeln', 'write', 'readln', 'read'].includes(s.name);
                if (isIO) {
                    const id = this.add('io', s.name, col, row);
                    return { first: id, last: id, nextRow: row + 1 };
                }
                if (s.name.toLowerCase() === 'break') {
                    const id = this.add('process', 'Break', col, row);
                    this._pendingBreaks.push(id);
                    return { first: id, last: id, nextRow: row + 1, _breaksFlow: true };
                }
                return null;
            }
            case 'Call': {
                const args = s.args.map(a => this.expr(a)).join(', ');
                const isIO = ['writeln', 'write', 'readln', 'read'].includes(s.name);
                const id = this.add(isIO ? 'io' : 'sub-process', `${s.name}(${args})`, col, row);
                return { first: id, last: id, nextRow: row + 1 };
            }
            case 'If':
                return this.genIf(s, row, col, depth);
            case 'While':
                return this.genWhile(s, row, col, depth);
            case 'RepeatUntil':
                return this.genRepeat(s, row, col, depth);
            case 'For':
                return this.genFor(s, row, col, depth);
            case 'Case':
                return this.genCase(s, row, col, depth);
            case 'Compound':
                return this.genStmts(s.statements, row, col, depth);
            default:
                return null;
        }
    }

    genIf(s, row, col, depth = 0) {
        let condRow = row;
        if (s.condition && s.condition.type === 'FunctionCall') {
            const callLabel = this.expr(s.condition);
            const callId = this.add('sub-process', callLabel, col, row);
            condRow = row + 1;
            const nextRow = row + 2;
            const cond = this.add('decision', this.expr(s.condition), col, condRow);
            this.edge(callId, cond);
            return this._genIfBody(s, cond, nextRow, col, depth, callId);
        }
        const cond = this.add('decision', this.expr(s.condition), col, condRow);
        const branchRow = condRow + 1;
        return this._genIfBody(s, cond, branchRow, col, depth, null);
    }

    _isControlFlow(stmt) {
        if (!stmt) return false;
        if (['If', 'While', 'For', 'RepeatUntil', 'Case'].includes(stmt.type)) return true;
        if (stmt.type === 'Compound' && stmt.statements.length > 0) {
            return this._isControlFlow(stmt.statements[0]);
        }
        return false;
    }

    _genIfBody(s, cond, branchRow, col, depth, firstNode) {

        const cntBefore = this.nodes.length;
        const thenR = this.genStmt(s.then, branchRow, col - 1, depth);
        let thenMaxCol = col - 1;
        for (let i = cntBefore; i < this.nodes.length; i++) {
            if (this.nodes[i].col > thenMaxCol) thenMaxCol = this.nodes[i].col;
        }

        const elseStartCol = thenMaxCol + 2;
        const elseRowOffset = (s.else && this._isControlFlow(s.else)) ? 1 : 0;
        const elseR = s.else ? this.genStmt(s.else, branchRow + elseRowOffset, elseStartCol, depth) : null;

        const thenNext = thenR ? thenR.nextRow : branchRow + 1;
        const elseNext = elseR ? elseR.nextRow : thenNext;
        let maxNext = Math.max(thenNext, elseNext);

        const thenHasMerge = thenR && this.nodes.some(n => n.type === 'process' && n.label === '' && n.row >= branchRow && n.row < thenNext);
        const elseHasMerge = elseR && this.nodes.some(n => n.type === 'process' && n.label === '' && n.row >= branchRow && n.row < elseNext);
        if (thenHasMerge || elseHasMerge) {
            maxNext = maxNext + 1;
        }

        const merge = this.add('process', '', col, maxNext);

        this.edge(cond, thenR.first, { type: 'left-branch', label: '+' });
        if (thenR.last) this.edge(thenR.last, merge, { type: 'left-merge' });

        if (elseR) {
            this.edge(cond, elseR.first, { type: 'right-branch', label: '−' });
            if (elseR.last) this.edge(elseR.last, merge, { type: 'right-merge' });
        } else {
            this.edge(cond, merge, { type: 'no-else-right', label: '−' });
        }

        return { first: firstNode || cond, last: merge, nextRow: maxNext + 1 };
    }

    genWhile(s, row, col, depth = 0) {
        const cond = this.add('decision', this.expr(s.condition), col, row);
        const savedBreaks = this._pendingBreaks;
        this._pendingBreaks = [];
        const bodyR = this.genStmt(s.body, row + 1, col, depth + 1);
        const exitId = this.add('process', '', col, bodyR.nextRow);
        for (const breakId of this._pendingBreaks) {
            this.edge(breakId, exitId, { type: 'break-exit' });
        }
        this._pendingBreaks = savedBreaks;

        this.edge(cond, bodyR.first, { type: 'down', label: '+' });
        if (bodyR.last) this.edge(bodyR.last, cond, { type: 'back', backDepth: depth });
        this.edge(cond, exitId, { type: 'right-exit', label: '−', backDepth: depth });

        return { first: cond, last: exitId, nextRow: bodyR.nextRow + 1 };
    }

    genRepeat(s, row, col, depth = 0) {
        const entry = this.add('process', '', col, row);
        let curRow = row + 1;
        let firstBody = null;
        let lastBody = null;
        const savedBreaks = this._pendingBreaks;
        this._pendingBreaks = [];
        for (const x of s.body) {
            const r = this.genStmt(x, curRow, col, depth + 1);
            if (!r) continue;
            if (!firstBody) firstBody = r.first;
            if (lastBody !== null && !r._noConnect) this.edge(lastBody, r.first);
            curRow = r.nextRow;
            if (r._breaksFlow) {
                lastBody = null;
            } else {
                lastBody = r.last;
            }
        }
        if (firstBody !== null) {
            this.edge(entry, firstBody);
        }
        const condRow = curRow;
        const cond = this.add('decision', this.expr(s.condition), col, condRow);
        if (lastBody !== null) this.edge(lastBody, cond);
        else this.edge(entry, cond);

        const exitId = this.add('process', '', col, condRow + 1);
        for (const breakId of this._pendingBreaks) {
            this.edge(breakId, exitId, { type: 'break-exit' });
        }
        this._pendingBreaks = savedBreaks;

        this.edge(cond, entry, { type: 'back', backDepth: depth, label: '−' });
        this.edge(cond, exitId, { type: 'down', label: '+' });

        return { first: entry, last: exitId, nextRow: condRow + 2 };
    }

    genFor(s, row, col, depth = 0) {
        const hex = this.add('for-loop', `${s.varName} := ${this.expr(s.from)}; ${s.varName} <= ${this.expr(s.to)}`, col, row);
        const savedBreaks = this._pendingBreaks;
        this._pendingBreaks = [];
        const bodyR = this.genStmt(s.body, row + 1, col, depth + 1);
        const exitId = this.add('process', '', col, bodyR.nextRow);
        for (const breakId of this._pendingBreaks) {
            this.edge(breakId, exitId, { type: 'break-exit' });
        }
        this._pendingBreaks = savedBreaks;

        this.edge(hex, bodyR.first, { type: 'down', label: '+' });
        if (bodyR.last) this.edge(bodyR.last, hex, { type: 'back', backDepth: depth });
        this.edge(hex, exitId, { type: 'right-exit', label: '−', backDepth: depth });

        return { first: hex, last: exitId, nextRow: bodyR.nextRow + 1 };
    }

    genCase(s, row, col, depth = 0) {
        const allCases = s.cases.slice();
        if (allCases.length === 0 && !s.else) {
            const id = this.add('process', '...', col, row);
            return { first: id, last: id, nextRow: row + 1 };
        }

        const varNode = this.add('io', this.expr(s.expr), col, row);

        const COL_STEP = 2;
        const decisions = [];
        for (let i = 0; i < allCases.length; i++) {
            const c = allCases[i];
            const val = c.values.join(', ');
            const dCol = col + i * COL_STEP;
            const dLabel = '= ' + val;
            const d = this.add('decision', dLabel, dCol, row + 1);
            decisions.push({ id: d, case: c, val, col: dCol });
        }

        if (decisions.length > 0) {
            this.edge(varNode, decisions[0].id, { type: 'down' });
        } else if (s.else) {
            const elseR = this.genStmt(s.else, row + 2, col, depth);
            if (elseR) {
                this.edge(varNode, elseR.first, { type: 'down' });
                const exit = this.add('process', '', col, elseR.nextRow);
                if (elseR.last) this.edge(elseR.last, exit, { type: 'left-merge' });
                return { first: varNode, last: exit, nextRow: elseR.nextRow + 1 };
            }
            const exit = this.add('process', '', col, row + 3);
            this.edge(varNode, exit, { type: 'down' });
            return { first: varNode, last: exit, nextRow: row + 4 };
        }

        for (let i = 0; i < decisions.length - 1; i++) {
            this.edge(decisions[i].id, decisions[i + 1].id, { type: 'chain-right', label: '-' });
        }

        let maxNext = row + 2;
        const branchLasts = [];
        for (const d of decisions) {
            const branchR = this.genStmt(d.case.stmt, row + 2, d.col, depth);
            if (branchR) {
                if (branchR.first) this.edge(d.id, branchR.first, { type: 'down', label: '+' });
                if (branchR.nextRow > maxNext) maxNext = branchR.nextRow;
                if (branchR.last != null) branchLasts.push(branchR.last);
            }
        }

        if (s.else) {
            const elseCol = col + allCases.length * COL_STEP;
            const elseR = this.genStmt(s.else, row + 2, elseCol, depth);
            if (elseR) {
                if (decisions.length > 0 && elseR.first) this.edge(decisions[decisions.length - 1].id, elseR.first, { type: 'chain-exit', label: '-' });
                if (elseR.nextRow > maxNext) maxNext = elseR.nextRow;
                if (elseR.last != null) branchLasts.push(elseR.last);
            }
        }

        const exit = this.add('process', '', col, maxNext);
        for (const last of branchLasts) {
            this.edge(last, exit, { type: 'left-merge' });
        }
        if (!s.else && decisions.length > 0) {
            this.edge(decisions[decisions.length - 1].id, exit, { type: 'chain-exit', label: '-' });
        }
        return { first: varNode, last: exit, nextRow: maxNext + 1 };
    }

    expr(e) {
        if (!e) return '';
        switch (e.type) {
            case 'Number': return e.value;
            case 'String': return `'${e.value}'`;
            case 'Boolean': return e.value ? 'true' : 'false';
            case 'Identifier': return e.name;
            case 'BinaryOp': return `(${this.expr(e.left)} ${e.op} ${this.expr(e.right)})`;
            case 'UnaryOp': return e.op === 'not' ? `not ${this.expr(e.operand)}` : `${e.op}${this.expr(e.operand)}`;
            case 'FunctionCall': return `${e.name}(${e.args.map(a => this.expr(a)).join(', ')})`;
            case 'ArrayAccess': return `${e.name}[${this.expr(e.index)}]`;
            case 'RecordAccess': return `${e.name}.${e.field}`;
            case 'Formatted': {
                let s = this.expr(e.expr) + ':' + this.expr(e.width);
                if (e.precision) s += ':' + this.expr(e.precision);
                return s;
            }
            default: return '...';
        }
    }
}
