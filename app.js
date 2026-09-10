import { PascalLexer } from './pascal-lexer.js';
import { PascalParser } from './pascal-parser.js';
import { FlowchartGenerator } from './flowchart-generator.js';
import { FlowchartRenderer } from './flowchart-renderer.js';

document.addEventListener('DOMContentLoaded', () => {
    const editor = CodeMirror.fromTextArea(document.getElementById('code-editor'), {
        mode: 'text/x-pascal',
        theme: 'default',
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        matchBrackets: true,
        extraKeys: {
            'Ctrl-Enter': generateFlowchart,
            'Cmd-Enter': generateFlowchart
        }
    });

    const canvas = document.getElementById('flowchart-canvas');
    const renderer = new FlowchartRenderer(canvas);
    const zoomLabel = document.getElementById('zoomLabel');
    const updateZoomLabel = () => { if(zoomLabel) zoomLabel.textContent = Math.round(renderer.zoom*100) + '%'; };
    renderer.onZoomChange = updateZoomLabel;
    updateZoomLabel();

    const fileTitle = document.getElementById('file-title');
    const hasElectron = typeof window.electronAPI !== 'undefined';

    if (hasElectron) {
        window.electronAPI.onFileOpened((data) => {
            editor.setValue(data.content);
            if (fileTitle) fileTitle.textContent = data.filePath.split(/[/\\]/).pop();
        });

        window.electronAPI.requestSaveContent(() => {
            window.electronAPI.saveContent(editor.getValue());
        });

        window.electronAPI.onFileSaved(() => {
            if (fileTitle) fileTitle.textContent = fileTitle.textContent.replace(' *', '');
        });

        window.electronAPI.onExportPNG(() => {
            renderer.downloadPNG();
        });

        window.electronAPI.getLastFile().then((data) => {
            if (data) {
                editor.setValue(data.content);
                if (fileTitle) fileTitle.textContent = data.filePath.split(/[/\\]/).pop();
            }
        });
    }

    editor.on('change', () => {
        generateFlowchart();
        if (hasElectron && fileTitle) {
            const title = fileTitle.textContent;
            if (!title.endsWith(' *')) fileTitle.textContent = title + ' *';
        }
    });

    document.getElementById('zoomInBtn').addEventListener('click', () => renderer.setZoom(renderer.zoom + 0.12));
    document.getElementById('zoomOutBtn').addEventListener('click', () => renderer.setZoom(renderer.zoom - 0.12));

    document.getElementById('downloadBtn').addEventListener('click', () => renderer.downloadPNG());

    // Divider drag
    const divider = document.getElementById('divider');
    const editorPanel = document.getElementById('editor-panel');
    const flowchartPanel = document.getElementById('flowchart-panel');
    let isDraggingDivider = false;

    divider.addEventListener('mousedown', (e) => {
        isDraggingDivider = true;
        divider.classList.add('active');
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDraggingDivider) return;
        const mainRect = document.querySelector('main').getBoundingClientRect();
        const offset = e.clientX - mainRect.left;
        const totalWidth = mainRect.width;
        const pct = (offset / totalWidth) * 100;
        const clamped = Math.max(15, Math.min(85, pct));
        editorPanel.style.flex = 'none';
        editorPanel.style.width = clamped + '%';
        flowchartPanel.style.flex = 'none';
        flowchartPanel.style.width = (100 - clamped) + '%';
        editor.refresh();
    });

    window.addEventListener('mouseup', () => {
        if (isDraggingDivider) {
            isDraggingDivider = false;
            divider.classList.remove('active');
            editor.refresh();
        }
    });

    function friendlyError(msg) {
        const t = msg.match(/Ожидался (\w+)/);
        if (t) {
            const expected = t[1];
            const map = {
                'ASSIGN':      'Пропущено присваивание. Используйте ":=" вместо "=".',
                'IDENT':       'Ожидалось имя переменной или ключевое слово.',
                'SEMICOLON':   'Пропущена точка с запятой ";".',
                'BEGIN':       'Пропущен блок "begin".',
                'END':         'Пропущен блок "end".',
                'THEN':        'Пропущено слово "then" после условия.',
                'ELSE':        'Пропущено слово "else".',
                'DO':          'Пропущено слово "do" в цикле.',
                'TO':          'Пропущено слово "to" в цикле for.',
                'DOWNTO':      'Пропущено слово "downto" в цикле for.',
                'OF':          'Пропущено слово "of".',
                'LPAREN':      'Несовпадение скобок — пропущена "(".',
                'RPAREN':      'Несовпадение скобок — пропущена ")".',
                'LBRACKET':    'Несовпадение скобок — пропущена "[".',
                'RBRACKET':    'Несовпадение скобок — пропущена "]".',
                'COLON':       'Пропущено двоеточие ":".',
                'COMMA':       'Пропущена запятая ",".',
                'DOT':         'Пропущена точка ".".',
                'DOTDOT':      'Пропущен оператор ".." (диапазон).',
                'EQ':          'Пропущен знак равенства "=".',
                'IF':          'Пропущено слово "if".',
                'WHILE':       'Пропущено слово "while".',
                'REPEAT':      'Пропущено слово "repeat".',
                'UNTIL':       'Пропущено слово "until".',
                'FOR':         'Пропущено слово "for".',
                'CASE':        'Пропущено слово "case".',
                'PROCEDURE':   'Пропущено слово "procedure".',
                'FUNCTION':    'Пропущено слово "function".',
                'ARRAY':       'Пропущено слово "array".',
                'RECORD':      'Пропущено слово "record".',
                'GOTO':        'Пропущено слово "goto".',
                'INTEGER':     'Ожидалось целое число.',
                'PROGRAM':     'Пропущено слово "program" в начале.',
                'VAR':         'Пропущено слово "var".',
                'CONST':       'Пропущено слово "const".',
                'LABEL':       'Пропущено слово "label".',
            };
            if (map[expected]) return map[expected];
            return 'Ожидалось: ' + expected.toLowerCase() + '.';
        }
        if (msg.includes('Неожиданный токен в выражении'))
            return 'Ошибка в выражении — проверьте синтаксис.';
        if (msg.includes('Неожиданный токен в case'))
            return 'Ошибка в конструкции "case" — проверьте записи.';
        if (msg.includes('Неожиданный токен'))
            return 'Неожиданный символ в коде. Проверьте синтаксис.';
        if (msg.includes('Лишний код после конца'))
            return 'Лишний код после "end." — удалите лишнее.';
        if (msg.includes('Незакрытая строка'))
            return 'Незакрытая строка — добавьте закрывающую кавычку \'.';
        if (msg.includes('Незакрытый комментарий {'))
            return 'Незакрытый комментарий — добавьте закрывающую скобку }.';
        if (msg.includes('Незакрытый комментарий (*'))
            return 'Незакрытый комментарий — добавьте закрывающую последовательность *).';
        if (msg.includes('Ожидался числовой код'))
            return 'Ошибка в символьном коде — после # должен идти номер.';
        return 'Проверьте код на ошибки: ' + msg;
    }

    function generateFlowchart() {
        const code = editor.getValue();
        const container = document.getElementById('flowchart-container');
        let errorOverlay = container.querySelector('.error-overlay');
        if (!errorOverlay) {
            errorOverlay = document.createElement('div');
            errorOverlay.className = 'error-overlay';
            container.appendChild(errorOverlay);
        }
        errorOverlay.classList.remove('visible');

        if (!code.trim()) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.style.display = 'none';
            return;
        }
        canvas.style.display = 'block';

        try {
            const lexer = new PascalLexer(code);
            const tokens = lexer.tokenize();
            const parser = new PascalParser(tokens);
            const ast = parser.parse();
            const generator = new FlowchartGenerator();
            const flowchart = generator.generate(ast);
            renderer.render(flowchart);
        } catch (error) {
            errorOverlay.innerHTML = '<span class="error-icon">!</span><span class="error-text">' + friendlyError(error.message) + '</span>';
            errorOverlay.classList.add('visible');
        }
    }

    generateFlowchart();
});
