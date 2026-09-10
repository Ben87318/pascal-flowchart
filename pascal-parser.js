export class PascalParser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }

    peek() {
        return this.tokens[this.pos];
    }

    advance() {
        const token = this.tokens[this.pos];
        this.pos++;
        return token;
    }

    expect(type) {
        const token = this.peek();
        if (token.type !== type) {
            throw new Error(`Ожидался ${type}, получен ${token.type} "${token.value}" (позиция ${this.pos})`);
        }
        return this.advance();
    }

    match(type) {
        if (this.peek().type === type) {
            return this.advance();
        }
        return null;
    }

    isIdent() {
        return this.peek().type === 'IDENT' || this.peek().type === 'TYPE';
    }

    parse() {
        const program = this.parseProgram();
        if (this.peek().type !== 'EOF') {
            throw new Error(`Лишний код после конца программы: "${this.peek().value}"`);
        }
        return program;
    }

    parseProgram() {
        const nameToken = this.match('PROGRAM');
        const name = (nameToken && this.peek().type === 'IDENT') ? this.advance().value : (nameToken ? 'anonymous' : 'anonymous');

        if (this.peek().type === 'LPAREN') {
            this.advance();
            while (this.peek().type !== 'RPAREN') {
                this.advance();
            }
            this.advance();
        }
        this.match('SEMICOLON');

        const declarations = [];
        while (['VAR', 'CONST', 'TYPE', 'PROCEDURE', 'FUNCTION'].includes(this.peek().type)) {
            if (this.peek().type === 'VAR') {
                declarations.push(...this.parseVarBlock());
            } else if (this.peek().type === 'CONST') {
                declarations.push(...this.parseConstBlock());
            } else if (this.peek().type === 'TYPE') {
                this.parseTypeBlock();
            } else if (this.peek().type === 'PROCEDURE') {
                declarations.push(this.parseProcedure());
            } else if (this.peek().type === 'FUNCTION') {
                declarations.push(this.parseFunction());
            } else {
                break;
            }
            this.match('SEMICOLON');
        }

        this.expect('BEGIN');
        const body = this.parseStatementList();
        this.expect('END');
        this.match('DOT');

        return {
            type: 'Program',
            name,
            declarations,
            body
        };
    }

    parseVarBlock() {
        this.expect('VAR');
        const vars = [];
        while (this.isIdent()) {
            const names = [this.advance().value];
            while (this.peek().type === 'COMMA') {
                this.advance();
                names.push(this.expect('IDENT').value);
            }
            this.expect('COLON');
            const varType = this.parseType();
            const init = this.match('EQ') ? this.parseExpression() : null;
            this.match('SEMICOLON');
            for (const n of names) {
                vars.push({ type: 'VarDecl', name: n, varType, init });
            }
        }
        return vars;
    }

    parseConstBlock() {
        this.expect('CONST');
        const consts = [];
        while (this.peek().type === 'IDENT') {
            const name = this.advance().value;
            this.expect('EQ');
            const value = this.parseExpression();
            this.match('SEMICOLON');
            consts.push({ type: 'ConstDecl', name, value });
        }
        return consts;
    }

    parseTypeBlock() {
        this.expect('TYPE');
        while (this.peek().type === 'IDENT') {
            this.advance();
            this.expect('EQ');
            this.parseType();
            this.match('SEMICOLON');
        }
    }

    parseType() {
        if (this.peek().type === 'ARRAY') {
            return this.parseArrayType();
        }
        if (this.peek().type === 'RECORD') {
            return this.parseRecordType();
        }
        const t = this.peek();
        this.advance();
        return { type: 'Type', name: t.value || t.type };
    }

    parseArrayType() {
        this.expect('ARRAY');
        this.expect('LBRACKET');
        const lo = this.parseExpression();
        this.expect('DOTDOT');
        const hi = this.parseExpression();
        this.expect('RBRACKET');
        this.expect('OF');
        const elemType = this.parseType();
        return { type: 'ArrayType', lo, hi, elemType };
    }

    parseRecordType() {
        this.expect('RECORD');
        const fields = [];
        while (this.peek().type !== 'END') {
            const names = [this.expect('IDENT').value];
            while (this.peek().type === 'COMMA') {
                this.advance();
                names.push(this.expect('IDENT').value);
            }
            this.expect('COLON');
            const fieldType = this.parseType();
            this.match('SEMICOLON');
            for (const n of names) {
                fields.push({ name: n, fieldType });
            }
        }
        this.expect('END');
        return { type: 'RecordType', fields };
    }

    parseProcedure() {
        this.expect('PROCEDURE');
        const nameToken = this.peek();
        if (nameToken.type !== 'IDENT' && nameToken.type !== 'TYPE') {
            throw new Error(`Ожидался IDENT, получен ${nameToken.type} "${nameToken.value}" (позиция ${this.pos})`);
        }
        const name = this.advance().value;
        let params = [];
        if (this.peek().type === 'LPAREN') {
            params = this.parseParamList();
        }
        this.match('SEMICOLON');
        const body = this.parseBlock();
        this.match('SEMICOLON');
        return { type: 'ProcedureDecl', name, params, body };
    }

    parseFunction() {
        this.expect('FUNCTION');
        const nameToken = this.peek();
        if (nameToken.type !== 'IDENT' && nameToken.type !== 'TYPE') {
            throw new Error(`Ожидался IDENT, получен ${nameToken.type} "${nameToken.value}" (позиция ${this.pos})`);
        }
        const name = this.advance().value;
        let params = [];
        if (this.peek().type === 'LPAREN') {
            params = this.parseParamList();
        }
        this.expect('COLON');
        const returnType = this.parseType();
        this.match('SEMICOLON');
        const body = this.parseBlock();
        this.match('SEMICOLON');
        return { type: 'FunctionDecl', name, params, returnType, body };
    }

    parseParamList() {
        this.expect('LPAREN');
        const params = [];
        if (this.peek().type !== 'RPAREN') {
            const paramGroup = this.parseParamGroup();
            params.push(...paramGroup);
            while (this.peek().type === 'SEMICOLON') {
                this.advance();
                params.push(...this.parseParamGroup());
            }
        }
        this.expect('RPAREN');
        return params;
    }

    parseParamGroup() {
        let mode = null;
        if (this.peek().type === 'VAR') { mode = 'var'; this.advance(); }
        else if (this.peek().type === 'CONST') { mode = 'const'; this.advance(); }
        const names = [this.peek().type === 'IDENT' || this.peek().type === 'TYPE' ? this.advance().value : this.expect('IDENT').value];
        while (this.peek().type === 'COMMA') {
            this.advance();
            names.push(this.peek().type === 'IDENT' || this.peek().type === 'TYPE' ? this.advance().value : this.expect('IDENT').value);
        }
        this.expect('COLON');
        const paramType = this.parseType();
        return names.map(n => ({ name: n, paramType, mode }));
    }

    parseBlock() {
        const stmts = [];
        while (this.peek().type !== 'END' && this.peek().type !== 'EOF') {
            if (this.peek().type === 'VAR') {
                stmts.push(...this.parseVarBlock());
            } else if (this.peek().type === 'CONST') {
                stmts.push(...this.parseConstBlock());
            } else if (this.peek().type === 'TYPE') {
                this.parseTypeBlock();
            } else if (this.peek().type === 'BEGIN') {
                this.advance();
                stmts.push(...this.parseStatementList());
                this.expect('END');
                break;
            } else if (this.peek().type === 'FORWARD') {
                this.advance();
                this.match('SEMICOLON');
                break;
            } else if (this.peek().type === 'PROCEDURE') {
                stmts.push(this.parseProcedure());
            } else if (this.peek().type === 'FUNCTION') {
                stmts.push(this.parseFunction());
            } else {
                stmts.push(this.parseStatement());
                this.match('SEMICOLON');
            }
        }
        return stmts;
    }

    parseStatementList() {
        const stmts = [];
        while (this.peek().type !== 'END' && this.peek().type !== 'EOF') {
            stmts.push(this.parseStatement());
            this.match('SEMICOLON');
        }
        return stmts;
    }

    parseStatement() {
        const t = this.peek();

        if (t.type === 'BEGIN') {
            this.advance();
            const stmts = this.parseStatementList();
            this.expect('END');
            return { type: 'Compound', statements: stmts };
        }
        if (t.type === 'IF') return this.parseIf();
        if (t.type === 'WHILE') return this.parseWhile();
        if (t.type === 'REPEAT') return this.parseRepeat();
        if (t.type === 'FOR') return this.parseFor();
        if (t.type === 'CASE') return this.parseCase();
        if (t.type === 'GOTO') return this.parseGoto();

        if (this.isIdent()) {
            const name = this.advance().value;

            if (this.peek().type === 'LPAREN') {
                this.advance();
                const args = [];
                if (this.peek().type !== 'RPAREN') {
                    args.push(this.parseExpression());
                    while (this.peek().type === 'COMMA') {
                        this.advance();
                        args.push(this.parseExpression());
                    }
                }
                this.expect('RPAREN');
                return { type: 'Call', name, args };
            }

            if (this.peek().type === 'LBRACKET') {
                this.advance();
                const index = this.parseExpression();
                this.expect('RBRACKET');
                if (this.peek().type === 'ASSIGN') {
                    this.advance();
                    const value = this.parseExpression();
                    return { type: 'ArrayAssign', name, index, value };
                }
                return { type: 'ArrayAccess', name, index };
            }

            if (this.peek().type === 'DOT') {
                this.advance();
                const field = this.expect('IDENT').value;
                if (this.peek().type === 'ASSIGN') {
                    this.advance();
                    const value = this.parseExpression();
                    return { type: 'RecordAssign', name, field, value };
                }
                return { type: 'RecordAccess', name, field };
            }

            if (this.peek().type === 'ASSIGN') {
                this.advance();
                const value = this.parseExpression();
                return { type: 'Assign', name, value };
            }

            return { type: 'Ident', name };
        }

        if (t.type === 'SEMICOLON') {
            this.advance();
            return { type: 'Empty' };
        }

        throw new Error(`Неожиданный токен: ${t.type} "${t.value}"`);
    }

    parseIf() {
        this.expect('IF');
        const condition = this.parseExpression();
        this.expect('THEN');
        const thenStmt = this.parseStatement();
        let elseStmt = null;
        if (this.peek().type === 'ELSE') {
            this.advance();
            elseStmt = this.parseStatement();
        }
        return { type: 'If', condition, then: thenStmt, else: elseStmt };
    }

    parseWhile() {
        this.expect('WHILE');
        const condition = this.parseExpression();
        this.expect('DO');
        const body = this.parseStatement();
        return { type: 'While', condition, body };
    }

    parseRepeat() {
        this.expect('REPEAT');
        const body = [];
        while (this.peek().type !== 'UNTIL' && this.peek().type !== 'EOF') {
            body.push(this.parseStatement());
            this.match('SEMICOLON');
        }
        this.expect('UNTIL');
        const condition = this.parseExpression();
        return { type: 'RepeatUntil', body, condition };
    }

    parseFor() {
        this.expect('FOR');
        const varName = this.expect('IDENT').value;
        this.expect('ASSIGN');
        const from = this.parseExpression();
        const dir = this.peek().type === 'DOWNTO' ? 'downto' : 'to';
        this.advance();
        const to = this.parseExpression();
        this.expect('DO');
        const body = this.parseStatement();
        return { type: 'For', varName, from, to, dir, body };
    }

    parseCase() {
        this.expect('CASE');
        const expr = this.parseExpression();
        this.expect('OF');
        const cases = [];
        let elseStmt = null;
        while (this.peek().type !== 'END' && this.peek().type !== 'EOF') {
            if (this.peek().type === 'ELSE') {
                this.advance();
                elseStmt = this.parseStatement();
                this.match('SEMICOLON');
                break;
            }
            const values = [this.parseCaseLabel()];
            while (this.peek().type === 'COMMA') {
                this.advance();
                values.push(this.parseCaseLabel());
            }
            this.expect('COLON');
            const stmt = this.parseStatement();
            this.match('SEMICOLON');
            cases.push({ values, stmt });
        }
        this.expect('END');
        return { type: 'Case', expr, cases, else: elseStmt };
    }

    parseCaseLabel() {
        if (this.peek().type === 'IDENT' || this.peek().type === 'INTEGER' || this.peek().type === 'STRING') {
            return this.advance().value;
        }
        throw new Error(`Неожиданный токен в case: ${this.peek().type}`);
    }

    parseGoto() {
        this.expect('GOTO');
        const label = this.expect('INTEGER').value;
        return { type: 'Goto', label: parseInt(label) };
    }

    parseExpression() {
        return this.parseOr();
    }

    parseOr() {
        let left = this.parseAnd();
        while (this.peek().type === 'OR') {
            this.advance();
            const right = this.parseAnd();
            left = { type: 'BinaryOp', op: 'or', left, right };
        }
        return left;
    }

    parseAnd() {
        let left = this.parseNot();
        while (this.peek().type === 'AND') {
            this.advance();
            const right = this.parseNot();
            left = { type: 'BinaryOp', op: 'and', left, right };
        }
        return left;
    }

    parseNot() {
        if (this.peek().type === 'NOT') {
            this.advance();
            const operand = this.parseNot();
            return { type: 'UnaryOp', op: 'not', operand };
        }
        return this.parseComparison();
    }

    parseComparison() {
        let left = this.parseAddSub();
        const ops = ['EQ', 'NEQ', 'LT', 'GT', 'LTE', 'GTE', 'IN'];
        if (ops.includes(this.peek().type)) {
            const op = this.advance().value;
            const right = this.parseAddSub();
            return { type: 'BinaryOp', op, left, right };
        }
        return left;
    }

    parseAddSub() {
        let left = this.parseMulDiv();
        while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
            const op = this.advance().value;
            const right = this.parseMulDiv();
            left = { type: 'BinaryOp', op, left, right };
        }
        return left;
    }

    parseMulDiv() {
        let left = this.parseUnary();
        while (this.peek().type === 'STAR' || this.peek().type === 'SLASH' || this.peek().type === 'DIV' || this.peek().type === 'MOD') {
            const op = this.advance().value;
            const right = this.parseUnary();
            left = { type: 'BinaryOp', op, left, right };
        }
        return left;
    }

    parseUnary() {
        if (this.peek().type === 'MINUS') {
            this.advance();
            const operand = this.parseUnary();
            return { type: 'UnaryOp', op: '-', operand };
        }
        if (this.peek().type === 'PLUS') {
            this.advance();
            return this.parseUnary();
        }
        return this.parseFormatted();
    }

    parsePrimary() {
        const t = this.peek();

        if (t.type === 'INTEGER' || t.type === 'REAL') {
            this.advance();
            return { type: 'Number', value: t.value };
        }
        if (t.type === 'STRING') {
            this.advance();
            return { type: 'String', value: t.value };
        }
        if (t.type === 'TRUE' || t.type === 'FALSE') {
            this.advance();
            return { type: 'Boolean', value: t.value === 'true' };
        }
        if (t.type === 'NIL') {
            this.advance();
            return { type: 'Nil' };
        }

        if (this.isIdent()) {
            const name = this.advance().value;
            if (this.peek().type === 'LPAREN') {
                this.advance();
                const args = [];
                if (this.peek().type !== 'RPAREN') {
                    args.push(this.parseExpression());
                    while (this.peek().type === 'COMMA') {
                        this.advance();
                        args.push(this.parseExpression());
                    }
                }
                this.expect('RPAREN');
                return { type: 'FunctionCall', name, args };
            }
            if (this.peek().type === 'LBRACKET') {
                this.advance();
                const index = this.parseExpression();
                this.expect('RBRACKET');
                return { type: 'ArrayAccess', name, index };
            }
            if (this.peek().type === 'DOT') {
                this.advance();
                const field = this.expect('IDENT').value;
                return { type: 'RecordAccess', name, field };
            }
            return { type: 'Identifier', name };
        }

        if (t.type === 'LPAREN') {
            this.advance();
            const expr = this.parseExpression();
            this.expect('RPAREN');
            return expr;
        }

        if (t.type === 'LBRACKET') {
            return this.parseSetLiteral();
        }

        throw new Error(`Неожиданный токен в выражении: ${t.type} "${t.value}"`);
    }

    parseFormatted() {
        let expr = this.parsePrimary();
        if (this.peek().type === 'COLON') {
            this.advance();
            const width = this.parsePrimary();
            let precision = null;
            if (this.peek().type === 'COLON') {
                this.advance();
                precision = this.parsePrimary();
            }
            return { type: 'Formatted', expr, width, precision };
        }
        return expr;
    }

    parseSetLiteral() {
        this.expect('LBRACKET');
        const elements = [];
        if (this.peek().type !== 'RBRACKET') {
            elements.push(this.parseExpression());
            while (this.peek().type === 'COMMA') {
                this.advance();
                elements.push(this.parseExpression());
            }
        }
        this.expect('RBRACKET');
        return { type: 'Set', elements };
    }
}
