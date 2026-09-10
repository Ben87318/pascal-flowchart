export class PascalLexer {
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.tokens = [];
        this.keywords = new Set([
            'program', 'var', 'begin', 'end', 'if', 'then', 'else',
            'while', 'do', 'for', 'to', 'downto', 'repeat', 'until',
            'procedure', 'function', 'const', 'type', 'array', 'of',
            'record', 'case', 'label', 'goto', 'div', 'mod', 'and',
            'or', 'not', 'true', 'false', 'nil', 'in', 'forward'
        ]);
        this.types = new Set([
            'integer', 'real', 'boolean', 'char', 'string',
            'text', 'longint', 'word', 'byte', 'shortint',
            'single', 'double', 'extended', 'comp', 'currency'
        ]);
    }

    tokenize() {
        while (this.pos < this.source.length) {
            this.skipWhitespaceAndComments();
            if (this.pos >= this.source.length) break;

            const ch = this.source[this.pos];

            if (ch === '{') {
                this.skipBraceComment();
                continue;
            }
            if (ch === '(' && this.peekNext() === '*') {
                this.skipBlockComment();
                continue;
            }
            if (this.isDigit(ch) || (ch === '.' && this.pos + 1 < this.source.length && this.isDigit(this.source[this.pos + 1]))) {
                this.readNumber();
                continue;
            }
            if (ch === "'" || ch === '#') {
                this.readString();
                continue;
            }
            if (ch === ':' && this.peekNext() === '=') {
                this.tokens.push({ type: 'ASSIGN', value: ':=' });
                this.pos += 2;
                continue;
            }
            if (ch === '=' && this.peekNext() !== '=') {
                this.tokens.push({ type: 'EQ', value: '=' });
                this.pos++;
                continue;
            }
            if (ch === '<') {
                if (this.peekNext() === '=') {
                    this.tokens.push({ type: 'LTE', value: '<=' });
                    this.pos += 2;
                } else if (this.peekNext() === '>') {
                    this.tokens.push({ type: 'NEQ', value: '<>' });
                    this.pos += 2;
                } else {
                    this.tokens.push({ type: 'LT', value: '<' });
                    this.pos++;
                }
                continue;
            }
            if (ch === '>') {
                if (this.peekNext() === '=') {
                    this.tokens.push({ type: 'GTE', value: '>=' });
                    this.pos += 2;
                } else {
                    this.tokens.push({ type: 'GT', value: '>' });
                    this.pos++;
                }
                continue;
            }
            if (ch === '+') {
                this.tokens.push({ type: 'PLUS', value: '+' });
                this.pos++;
                continue;
            }
            if (ch === '-') {
                this.tokens.push({ type: 'MINUS', value: '-' });
                this.pos++;
                continue;
            }
            if (ch === '*') {
                this.tokens.push({ type: 'STAR', value: '*' });
                this.pos++;
                continue;
            }
            if (ch === '/' && this.peekNext() !== '/') {
                this.tokens.push({ type: 'SLASH', value: '/' });
                this.pos++;
                continue;
            }
            if (ch === '/') {
                this.skipLineComment();
                continue;
            }
            if (ch === '(') {
                this.tokens.push({ type: 'LPAREN', value: '(' });
                this.pos++;
                continue;
            }
            if (ch === ')') {
                this.tokens.push({ type: 'RPAREN', value: ')' });
                this.pos++;
                continue;
            }
            if (ch === '[') {
                this.tokens.push({ type: 'LBRACKET', value: '[' });
                this.pos++;
                continue;
            }
            if (ch === ']') {
                this.tokens.push({ type: 'RBRACKET', value: ']' });
                this.pos++;
                continue;
            }
            if (ch === ';') {
                this.tokens.push({ type: 'SEMICOLON', value: ';' });
                this.pos++;
                continue;
            }
            if (ch === ',') {
                this.tokens.push({ type: 'COMMA', value: ',' });
                this.pos++;
                continue;
            }
            if (ch === ':') {
                this.tokens.push({ type: 'COLON', value: ':' });
                this.pos++;
                continue;
            }
            if (ch === '.') {
                if (this.peekNext() === '.') {
                    this.tokens.push({ type: 'DOTDOT', value: '..' });
                    this.pos += 2;
                } else {
                    this.tokens.push({ type: 'DOT', value: '.' });
                    this.pos++;
                }
                continue;
            }
            if (ch === '^') {
                this.tokens.push({ type: 'CARET', value: '^' });
                this.pos++;
                continue;
            }
            if (ch === '@') {
                this.tokens.push({ type: 'AT', value: '@' });
                this.pos++;
                continue;
            }

            if (this.isLetter(ch) || ch === '_') {
                this.readIdentifier();
                continue;
            }

            this.pos++;
        }

        this.tokens.push({ type: 'EOF', value: null });
        return this.tokens;
    }

    peekNext() {
        return this.pos + 1 < this.source.length ? this.source[this.pos + 1] : null;
    }

    isDigit(ch) {
        return ch >= '0' && ch <= '9';
    }

    isLetter(ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
    }

    isAlphaNumeric(ch) {
        return this.isLetter(ch) || this.isDigit(ch);
    }

    skipWhitespaceAndComments() {
        while (this.pos < this.source.length) {
            const ch = this.source[this.pos];
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
                this.pos++;
            } else if (ch === '{') {
                this.skipBraceComment();
            } else if (ch === '(' && this.peekNext() === '*') {
                this.skipBlockComment();
            } else if (ch === '/' && this.peekNext() === '/') {
                this.skipLineComment();
            } else {
                break;
            }
        }
    }

    skipBraceComment() {
        this.pos++;
        while (this.pos < this.source.length && this.source[this.pos] !== '}') {
            this.pos++;
        }
        if (this.pos < this.source.length) {
            this.pos++;
        } else {
            throw new Error('Незакрытый комментарий { ... }');
        }
    }

    skipBlockComment() {
        this.pos += 2;
        while (this.pos < this.source.length) {
            if (this.source[this.pos] === '*' && this.peekNext() === ')') {
                this.pos += 2;
                return;
            }
            this.pos++;
        }
        throw new Error('Незакрытый комментарий (* ... *)');
    }

    skipLineComment() {
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
            this.pos++;
        }
    }

    readNumber() {
        let start = this.pos;
        while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
            this.pos++;
        }
        if (this.pos < this.source.length && this.source[this.pos] === '.') {
            if (this.pos + 1 < this.source.length && this.source[this.pos + 1] === '.') {
                this.tokens.push({ type: 'INTEGER', value: this.source.substring(start, this.pos) });
            } else {
                this.pos++;
                while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
                    this.pos++;
                }
                this.tokens.push({ type: 'REAL', value: this.source.substring(start, this.pos) });
            }
        } else {
            this.tokens.push({ type: 'INTEGER', value: this.source.substring(start, this.pos) });
        }
    }

    readString() {
        if (this.source[this.pos] === '#') {
            let val = '';
            while (this.pos < this.source.length && this.source[this.pos] === '#') {
                this.pos++;
                let num = '';
                while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
                    num += this.source[this.pos++];
                }
                if (num.length === 0) {
                    throw new Error(`Ожидался числовой код после '#' (позиция ${this.pos})`);
                }
                const code = parseInt(num);
                if (code < 0 || code > 65535) {
                    throw new Error(`Символьный код ${code} вне допустимого диапазона (0..65535)`);
                }
                val += String.fromCharCode(code);
            }
            this.tokens.push({ type: 'STRING', value: val });
            return;
        }

        let str = '';
        this.pos++;
        while (this.pos < this.source.length) {
            if (this.source[this.pos] === "'" && this.peekNext() === "'") {
                str += "'";
                this.pos += 2;
            } else if (this.source[this.pos] === "'") {
                break;
            } else {
                str += this.source[this.pos];
                this.pos++;
            }
        }
        if (this.pos < this.source.length) {
            this.pos++;
        } else {
            throw new Error(`Незакрытая строка: '${str}'`);
        }
        this.tokens.push({ type: 'STRING', value: str });
    }

    readIdentifier() {
        let start = this.pos;
        while (this.pos < this.source.length && this.isAlphaNumeric(this.source[this.pos])) {
            this.pos++;
        }
        const word = this.source.substring(start, this.pos).toLowerCase();
        if (this.keywords.has(word)) {
            this.tokens.push({ type: word.toUpperCase(), value: word });
        } else if (this.types.has(word)) {
            this.tokens.push({ type: 'TYPE', value: word });
        } else {
            this.tokens.push({ type: 'IDENT', value: this.source.substring(start, this.pos) });
        }
    }
}
