import { PascalLexer } from './pascal-lexer.js';
import { PascalParser } from './pascal-parser.js';
import { FlowchartGenerator } from './flowchart-generator.js';
import { FlowchartRenderer } from './flowchart-renderer.js';
import * as cloud from './db.js';

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

    // --- Облако: аккаунты + проекты в Supabase ---------------------------
    const $ = (id) => document.getElementById(id);
    const cloudDot = $('cloud-dot');
    const authOut = $('auth-logged-out');
    const authIn = $('auth-logged-in');
    const userBadge = $('userBadge');
    const projTitle = $('projTitle');
    const projList = $('projList');
    const cloudStatus = $('cloudStatus');
    const btnSaveCloud = $('btnSaveCloud');
    const btnNewCloud = $('btnNewCloud');
    const btnReloadCloud = $('btnReloadCloud');
    const btnDeleteCloud = $('btnDeleteCloud');
    let cloudReady = false;

    const say = (t) => { if (cloudStatus) cloudStatus.textContent = t; };
    function toast(t, kind) {
        const box = $('toast-box');
        if (!box) return;
        const d = document.createElement('div');
        d.className = 'toast' + (kind ? ' ' + kind : '');
        d.textContent = t;
        box.appendChild(d);
        setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 300); }, 3200);
        while (box.children.length > 4) box.firstChild.remove();
    }
    const ok = (t) => { say(t); toast(t, 'ok'); };
    const fail = (t) => { say(t); toast(t, 'err'); };
    // Перевод частых английских ошибок Supabase на русский
    const ruErr = (e) => {
        const m = String((e && e.message) || e || '');
        if (/schema cache/i.test(m)) return 'Ошибка базы данных: нет такой колонки. Обратитесь к администратору.';
        if (/row-level security|RLS|42501/i.test(m)) return 'Нет доступа: недостаточно прав.';
        if (/duplicate key|23505/i.test(m)) return 'Такая запись уже существует.';
        if (/Failed to fetch|NetworkError|fetch failed/i.test(m)) return 'Нет соединения с сервером. Проверьте интернет.';
        if (/Invalid login|invalid_grant/i.test(m)) return 'Неверный логин или пароль.';
        if (/User already registered/i.test(m)) return 'Этот email уже зарегистрирован.';
        return m;
    };
    const setDot = (on) => {
        if (!cloudDot) return;
        cloudDot.className = 'dot ' + (on ? 'on' : 'off');
        cloudDot.title = on ? 'База подключена' : 'Нет соединения с базой';
    };

    function setCloudEnabled(on) {
        cloudReady = on;
        for (const el of [projTitle, projList, btnSaveCloud, btnNewCloud, btnReloadCloud, btnDeleteCloud]) {
            if (el) el.disabled = !on;
        }
        setDot(on);
    }

    async function reloadProjects(selectId) {
        if (!cloudReady) return;
        try {
            say('Загрузка схем…');
            const rows = await cloud.listProjects();
            const cur = selectId !== undefined ? selectId : projList.value;
            projList.innerHTML = '<option value="">— мои схемы —</option>';
            for (const r of rows) {
                const o = document.createElement('option');
                o.value = r.id;
                const d = r.updated_at ? new Date(r.updated_at).toLocaleString('ru-RU') : '';
                o.textContent = r.title + (d ? ' · ' + d : '');
                projList.appendChild(o);
            }
            if (cur) projList.value = String(cur);
            say(rows.length ? 'Схем в базе: ' + rows.length : 'В базе пока пусто — сохраните первую схему');
        } catch (e) {
            say('Ошибка загрузки: ' + e.message);
        }
    }

    function refreshAuthUI() {
        const u = cloud.currentUser();
        const logged = !!u;
        if (authOut) authOut.hidden = logged;
        if (authIn) authIn.hidden = !logged;
        if (logged && userBadge) userBadge.textContent = u.email || u.id.slice(0, 8);
        setCloudEnabled(logged);
        if (logged) {
            if (projTitle && !projTitle.value && fileTitle) {
                const t = fileTitle.textContent.replace(' *', '');
                if (t && t !== 'Новый файл') projTitle.value = t;
            }
            reloadProjects();
            loadRoleAndGroups();
        } else {
            if (projList) projList.innerHTML = '<option value="">— мои схемы —</option>';
            say('Войдите, чтобы сохранять схемы в базу');
            setRoleUI(null);
        }
    }

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function friendlyAuthError(msg) {
        const m = String(msg || '');
        if (/Unable to validate email address/i.test(m)) return 'Введите корректный email, например name@example.com';
        if (/User already registered/i.test(m)) return 'Такой email уже зарегистрирован — нажмите «Войти»';
        if (/Invalid login credentials/i.test(m)) return 'Неверный email или пароль. Проверьте данные или зарегистрируйтесь';
        if (/Email not confirmed/i.test(m)) return 'Email не подтверждён. Локально письма падают в Mailpit: http://127.0.0.1:54324';
        if (/at least 6|Password should/i.test(m)) return 'Пароль должен быть минимум 6 символов';
        if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(m)) return 'Нет связи с базой. Проверьте: запущены ли Docker и Supabase (http://127.0.0.1:54321)';
        return m || 'Неизвестная ошибка';
    }

    function validCreds(email, pass) {
        if (!email || !pass) { say('Введите email и пароль'); return false; }
        if (!EMAIL_RE.test(email)) { say('Введите корректный email, например name@example.com'); return false; }
        if (pass.length < 6) { say('Пароль минимум 6 символов'); return false; }
        return true;
    }

    async function doLogin(email, pass) {
        say('Вход…');
        try {
            await cloud.signIn(email, pass);
            say('Вход выполнен');
            refreshAuthUI();
            hideAuthModal();
            return true;
        } catch (e) { say('Не вошло: ' + friendlyAuthError(e.message)); return false; }
    }

    async function doRegister(email, pass) {
        say('Регистрация…');
        try {
            await cloud.signUp(email, pass);
            if (!cloud.currentUser()) {
                say('Аккаунт создан. Подтвердите email и войдите');
                switchAuthMode('login');
                return false;
            }
            say('Аккаунт создан, вы вошли как ученик');
            refreshAuthUI();
            hideAuthModal();
            return true;
        } catch (e) { say('Не зарегистрировалось: ' + friendlyAuthError(e.message)); return false; }
    }

    if ($('btnOpenAuth')) $('btnOpenAuth').addEventListener('click', () => showAuthModal());

    if ($('btnLogout')) $('btnLogout').addEventListener('click', async () => {
        await cloud.signOut();
        refreshAuthUI();
        showAuthModal();
    });

    if (btnSaveCloud) btnSaveCloud.addEventListener('click', async () => {
        if (!cloudReady) return;
        const code = editor.getValue();
        const title = (projTitle.value || '').trim() || 'Без названия';
        try {
            if (projList.value) {
                say('Обновление схемы…');
                await cloud.updateProject(projList.value, { title, code });
                ok('Обновлено в базе');
            } else {
                say('Сохранение в базу…');
                const created = await cloud.createProject(title, code);
                ok('Сохранено, id=' + created.id);
            }
            await reloadProjects(projList.value || undefined);
        } catch (e) { fail('Не сохранилось: ' + e.message); }
    });

    if (btnNewCloud) btnNewCloud.addEventListener('click', () => {
        projList.value = '';
        projTitle.value = '';
        editor.setValue('');
        say('Новая схема — введите код и нажмите «В облако»');
    });

    if (btnReloadCloud) btnReloadCloud.addEventListener('click', () => reloadProjects());

    if (projList) projList.addEventListener('change', async () => {
        if (!projList.value) return;
        try {
            say('Открытие схемы…');
            const p = await cloud.getProject(projList.value);
            editor.setValue(p.code || '');
            if (projTitle) projTitle.value = p.title || '';
            say('Открыто из базы: ' + (p.title || ''));
        } catch (e) { fail('Не открылось: ' + e.message); }
    });

    if (btnDeleteCloud) btnDeleteCloud.addEventListener('click', async () => {
        if (!projList.value) { say('Выберите схему для удаления'); return; }
        if (!confirm('Удалить схему из базы?')) return;
        try {
            say('Удаление…');
            await cloud.deleteProject(projList.value);
            projList.value = '';
            ok('Удалено');
            await reloadProjects();
        } catch (e) { fail('Не удалилось: ' + e.message); }
    });

    // --- Учитель / ученик: группы и задания ----------------------------------
    let myRole = null; // 'teacher' | 'student' | null
    let curGroupId = null;
    let curAssignId = null;
    let mySubs = {}; // assignment_id -> {grade}
    const roleBadge = $('roleBadge');
    const groupList = $('groupList');
    const memberList = $('memberList');
    const assignList = $('assignList');
    const subList = $('subList');
    const groupSelect = $('groupSelect'); // скрытый, для совместимости
    const groupName = $('groupName');
    const btnCreateGroup = $('btnCreateGroup');
    const btnJoinGroup = $('btnJoinGroup');
    const assignSelect = $('assignSelect'); // скрытый, для совместимости
    const btnNewAssign = $('btnNewAssign');
    const btnSubmitAssign = $('btnSubmitAssign');

    function setRoleUI(role) {
        myRole = role;
        if (roleBadge) {
            if (role === 'teacher') { roleBadge.textContent = 'Учитель'; roleBadge.className = 'role-badge teacher'; }
            else if (role === 'student') { roleBadge.textContent = '\U0001F393 Ученик'; roleBadge.className = 'role-badge student'; }
            else { roleBadge.textContent = 'роль: —'; roleBadge.className = 'role-badge'; }
        }
        const logged = !!cloud.currentUser();
        const isTeacher = role === 'teacher';
        const isStudent = role === 'student';
        if (groupName) groupName.disabled = !logged;
        if (btnCreateGroup) btnCreateGroup.disabled = !(logged && isTeacher);
        if (btnJoinGroup) btnJoinGroup.disabled = !(logged && (isStudent || !isTeacher));
        if (btnNewAssign) btnNewAssign.disabled = !(logged && isTeacher);
        if (btnSubmitAssign) btnSubmitAssign.disabled = !(logged && isStudent);
    }

    function el(tag, cls, text) {
        const d = document.createElement(tag);
        if (cls) d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }

    async function loadRoleAndGroups() {
        try {
            const roles = await cloud.getMyRoles();
            const role = roles.includes('teacher') ? 'teacher' : roles.includes('student') ? 'student' : roles.includes('admin') ? 'teacher' : 'student';
            setRoleUI(role);
            if (role === 'student') {
                try { mySubs = {}; (await cloud.mySubmissions()) .forEach((s) => { mySubs[String(s.assignment_id)] = s; }); } catch {}
            }
            await reloadGroups();
        } catch (e) {
            setRoleUI('student');
            say('Роль не прочиталась: ' + e.message);
        }
    }

    let teachIds = new Set();
    async function reloadGroups(keepId) {
        if (!groupList) return;
        groupList.innerHTML = '';
        if (memberList) memberList.innerHTML = '';
        if (assignList) assignList.innerHTML = '';
        if (subList) subList.innerHTML = '';
        try {
            const [teaching, memberships, all] = await Promise.all([
                cloud.myTeachingGroups().catch(() => []),
                cloud.myStudentGroups().catch(() => []),
                cloud.listGroups().catch(() => []),
            ]);
            const seen = new Map();
            for (const g of [...(teaching || []), ...((memberships || []).map((m) => m.groups).filter(Boolean))]) {
                if (g && g.id && !seen.has(String(g.id))) seen.set(String(g.id), { ...g, mine: true });
            }
            const myIds = new Set(seen.keys());
            for (const g of all || []) {
                if (!g || !g.id || myIds.has(String(g.id))) continue;
                seen.set(String(g.id), { ...g, mine: false });
            }
            if (!seen.size) {
                groupList.appendChild(el('div', 'pick-empty', myRole === 'teacher' ? 'Создайте первую группу ниже' : 'Групп пока нет — спросите название у учителя'));
            }
            const cur = keepId !== undefined ? String(keepId) : curGroupId ? String(curGroupId) : null;
            curGroupId = null;
            teachIds = new Set((teaching || []).map((g) => String(g.id)));
            for (const g of seen.values()) {
                const b = el('button', 'pick-item' + (g.mine ? ' mine' : ''), '');
                const label = el('span', '', (g.mine ? '★ ' : '') + g.name);
                b.appendChild(label);
                b.dataset.id = g.id;
                b.addEventListener('click', () => selectGroup(g.id));
                if (myRole === 'teacher' && teachIds.has(String(g.id))) {
                    const ren = el('span', 'x', '✎');
                    ren.title = 'Переименовать';
                    ren.addEventListener('click', (e) => { e.stopPropagation(); openGroupModal(g.id, g.name); });
                    const del = el('span', 'x', '×');
                    del.title = 'Удалить группу';
                    del.addEventListener('click', (e) => { e.stopPropagation(); deleteGroupFlow(g.id, g.name); });
                    b.appendChild(ren);
                    b.appendChild(del);
                }
                groupList.appendChild(b);
            }
            const pick = cur && seen.has(cur) ? cur : (seen.size === 1 ? [...seen.keys()][0] : null);
            if (pick) await selectGroup(pick);
            else say(seen.size ? 'Выберите группу' : 'Групп пока нет');
        } catch (e) { say('Группы не загрузились: ' + e.message); }
    }

    async function selectGroup(gid) {
        curGroupId = String(gid);
        curAssignId = null;
        if (groupSelect) groupSelect.value = '';
        for (const b of groupList.querySelectorAll('.pick-item')) {
            b.classList.toggle('active', b.dataset.id === curGroupId);
        }
        await Promise.all([reloadMembers(), reloadAssignments()]);
    }

    async function reloadMembers() {
        if (!memberList || !curGroupId) return;
        memberList.innerHTML = '';
        try {
            const rows = await cloud.listGroupMembers(curGroupId);
            const me = cloud.currentUser();
            if (!rows || !rows.length) {
                memberList.appendChild(el('div', 'pick-empty', 'В группе пока никого нет'));
            } else {
                for (const m of rows) {
                    const name = (m.profiles && (m.profiles.display_name || m.profiles.email)) || String(m.profile_id).slice(0, 8);
                    const item = el('div', 'member-item', '');
                    item.appendChild(el('span', '', name));
                    if (myRole === 'teacher' && teachIds.has(curGroupId)) {
                        const x = el('span', 'x', '×');
                        x.title = 'Убрать из группы';
                        x.addEventListener('click', async () => {
                            if (!confirm('Убрать ' + name + ' из группы?')) return;
                            try {
                                await cloud.removeMember(curGroupId, m.profile_id);
                                ok('Убран из группы');
                                await reloadMembers();
                            } catch (e) { fail('Не убралось: ' + e.message); }
                        });
                        item.appendChild(x);
                    }
                    memberList.appendChild(item);
                }
            }
            if (myRole === 'student' && me && (rows || []).some((m) => String(m.profile_id) === String(me.id))) {
                const leave = el('button', 'mini', 'Покинуть группу');
                leave.addEventListener('click', async () => {
                    if (!confirm('Покинуть группу?')) return;
                    try {
                        await cloud.leaveGroup(curGroupId);
                        ok('Вы покинули группу');
                        await reloadGroups();
                    } catch (e) { fail('Не вышло: ' + e.message); }
                });
                memberList.appendChild(leave);
            }
        } catch (e) { memberList.appendChild(el('div', 'pick-empty', 'Не загрузилось: ' + ruErr(e))); }
    }

    async function deleteGroupFlow(gid, name) {
        if (!confirm('Удалить группу «' + name + '» вместе с заданиями?')) return;
        try {
            await cloud.deleteGroup(gid);
            ok('Группа удалена');
            await reloadGroups();
        } catch (e) { fail('Не удалилось: ' + e.message); }
    }

    function subBadge(aid, dueAt) {
        const s = mySubs[String(aid)];
        if (!s) {
            if (dueAt && new Date(dueAt).getTime() < Date.now()) return { cls: 'b-late', text: 'просрочено' };
            return { cls: 'b-todo', text: 'не сдано' };
        }
        if (s.grade) return { cls: 'b-done', text: 'оценка: ' + s.grade };
        return { cls: 'b-sent', text: 'сдано, ждёт оценку' };
    }

    function dueText(dueAt) {
        if (!dueAt) return null;
        const d = new Date(dueAt);
        const s = d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return { text: 'сдать до ' + s, over: d.getTime() < Date.now() };
    }

    function toLocalInput(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const p = (n) => String(n).padStart(2, '0');
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }

    async function reloadAssignments(keepId) {
        if (!assignList || !curGroupId) return;
        assignList.innerHTML = '';
        if (subList) subList.innerHTML = '';
        try {
            const rows = await cloud.listAssignments(curGroupId);
            if (!rows || !rows.length) {
                assignList.appendChild(el('div', 'pick-empty', myRole === 'teacher' ? 'Заданий нет — дайте первое' : 'Заданий пока нет'));
                say('В группе пока нет заданий');
                return;
            }
            const cur = keepId !== undefined ? String(keepId) : curAssignId ? String(curAssignId) : null;
            curAssignId = null;
            for (const r of rows) {
                const card = el('div', 'assign-card');
                const head = el('div', 'assign-head');
                head.appendChild(el('span', 'assign-title', r.title));
                if (myRole === 'student') {
                    const b = subBadge(r.id, r.due_at);
                    head.appendChild(el('span', 'badge ' + b.cls, b.text));
                } else if (r.due_at) {
                    const d = dueText(r.due_at);
                    if (d) head.appendChild(el('span', 'badge ' + (d.over ? 'b-late' : 'b-todo'), d.text));
                }
                card.appendChild(head);
                if (r.due_at && myRole === 'student') {
                    const d = dueText(r.due_at);
                    if (d) card.appendChild(el('div', 'due-line' + (d.over ? ' over' : ''), d.text));
                }
                if (r.image_url) {
                    const img = document.createElement('img');
                    img.className = 'assign-photo';
                    img.src = r.image_url;
                    img.alt = 'Фото задания';
                    img.addEventListener('click', () => window.open(r.image_url, '_blank'));
                    card.appendChild(img);
                }
                if (myRole === 'student' && mySubs[String(r.id)] && mySubs[String(r.id)].feedback) {
                    card.appendChild(el('div', 'fb-line', 'Учитель: ' + mySubs[String(r.id)].feedback));
                }
                const acts = el('div', 'assign-acts');
                const openBtn = el('button', 'mini', 'Открыть');
                openBtn.addEventListener('click', () => {
                    if (r.task_text) {
                        if (!editor.getValue().trim() || confirm('Заменить код в редакторе текстом задания?')) editor.setValue(r.task_text);
                    } else say('У задания нет текста');
                });
                acts.appendChild(openBtn);
                if (myRole === 'student') {
                    const subBtn = el('button', 'mini primary', 'Сдать');
                    subBtn.addEventListener('click', () => submitCurrent(r.id));
                    acts.appendChild(subBtn);
                }
                const pickBtn = el('button', 'mini', myRole === 'teacher' ? 'Сдачи' : 'Выбрать');
                pickBtn.addEventListener('click', () => selectAssign(r.id));
                acts.appendChild(pickBtn);
                if (myRole === 'teacher') {
                    const editBtn = el('button', 'mini', '✎');
                    editBtn.title = 'Изменить задание';
                    editBtn.addEventListener('click', () => openAssignModal(r.id, r.title, r.task_text, r.due_at, r.image_url));
                    acts.appendChild(editBtn);
                    const delBtn = el('button', 'mini', '×');
                    delBtn.title = 'Удалить задание';
                    delBtn.addEventListener('click', async () => {
                        if (!confirm('Удалить задание «' + r.title + '»? Сдачи тоже удалятся.')) return;
                        try {
                            await cloud.deleteAssignment(r.id);
                            ok('Задание удалено');
                            await reloadAssignments();
                        } catch (e) { fail('Не удалилось: ' + e.message); }
                    });
                    acts.appendChild(delBtn);
                }
                card.appendChild(acts);
                card.dataset.id = r.id;
                assignList.appendChild(card);
            }
            const pick = cur && rows.some((r) => String(r.id) === cur) ? cur : null;
            if (pick) await selectAssign(pick);
            else say('Заданий в группе: ' + rows.length);
        } catch (e) { say('Задания не загрузились: ' + e.message); }
    }

    async function selectAssign(aid) {
        curAssignId = String(aid);
        if (assignSelect) assignSelect.value = '';
        for (const c of assignList.querySelectorAll('.assign-card')) {
            c.classList.toggle('active', c.dataset.id === curAssignId);
        }
        if (myRole === 'teacher') await reloadSubs();
    }

    let lastSubs = [];
    async function reloadSubs() {
        if (!subList || !curAssignId) return;
        subList.innerHTML = '';
        try {
            const rows = await cloud.listSubmissions(curAssignId);
            lastSubs = rows || [];
            if (!rows || !rows.length) {
                subList.appendChild(el('div', 'pick-empty', 'Сдач пока нет'));
                return;
            }
            for (const r of rows) {
                const row = el('div', 'sub-row');
                const who = el('div', 'sub-who', String(r.student_id).slice(0, 8));
                const code = el('div', 'sub-code sub-link', ((r.feedback ? '💬 ' : '') + (r.answer_code || '')).slice(0, 80).replace(/\n/g, ' ') || '(пусто)');
                code.title = 'Открыть полностью';
                code.addEventListener('click', () => openSubModal(r));
                const grade = document.createElement('input');
                grade.value = r.grade || '';
                grade.placeholder = 'оценка';
                grade.className = 'sub-grade';
                const btn = el('button', 'mini primary', 'OK');
                btn.addEventListener('click', async () => {
                    try {
                        await cloud.gradeSubmission(r.id, grade.value);
                        r.grade = grade.value;
                        ok('Оценка поставлена');
                    } catch (e) { fail('Не сохранилось: ' + e.message); }
                });
                row.appendChild(who);
                row.appendChild(code);
                row.appendChild(grade);
                row.appendChild(btn);
                subList.appendChild(row);
            }
            say('Сдач: ' + rows.length);
        } catch (e) { subList.appendChild(el('div', 'pick-empty', 'Не загрузилось: ' + ruErr(e))); }
    }

    // --- Просмотр сдачи целиком ---
    let curSub = null;
    const subModal = $('sub-modal');
    function openSubModal(r) {
        curSub = r;
        if ($('sTitle')) $('sTitle').textContent = 'Сдача';
        if ($('sWho')) $('sWho').textContent = 'Ученик ' + String(r.student_id).slice(0, 8) + (r.grade ? ' · оценка: ' + r.grade : ' · без оценки');
        if ($('sCode')) $('sCode').textContent = r.answer_code || '(пусто)';
        if ($('sGrade')) $('sGrade').value = r.grade || '';
        if ($('sFeedback')) $('sFeedback').value = r.feedback || '';
        if (subModal) subModal.hidden = false;
    }
    const closeSubModal = () => { if (subModal) subModal.hidden = true; };
    if (subModal) subModal.addEventListener('mousedown', (e) => { if (e.target === subModal) closeSubModal(); });
    if ($('sClose')) $('sClose').addEventListener('click', closeSubModal);
    if ($('sOpen')) $('sOpen').addEventListener('click', () => {
        if (curSub && curSub.answer_code) {
            editor.setValue(curSub.answer_code);
            closeSubModal();
            ok('Код открыт в редакторе');
        }
    });
    if ($('sSaveGrade')) $('sSaveGrade').addEventListener('click', async () => {
        if (!curSub) return;
        try {
            await cloud.gradeSubmission(curSub.id, $('sGrade').value, $('sFeedback').value);
            curSub.grade = $('sGrade').value;
            curSub.feedback = $('sFeedback').value;
            ok('Оценка поставлена');
            await reloadSubs();
            closeSubModal();
        } catch (e) { fail('Не сохранилось: ' + e.message); }
    });

    async function submitCurrent(aid) {
        const id = aid || curAssignId;
        if (!id) { say('Выберите задание'); return; }
        try {
            say('Сдача решения…');
            const code = editor.getValue();
            let projectId = projList && projList.value ? projList.value : null;
            if (!projectId) {
                const created = await cloud.createProject((projTitle.value || 'Решение').trim() || 'Решение', code);
                projectId = created.id;
                await reloadProjects(projectId);
            }
            await cloud.submitAssignment(id, code, projectId);
            try { mySubs[String(id)] = (await cloud.mySubmissions()).find((s) => String(s.assignment_id) === String(id)) || { grade: '' }; } catch {}
            ok('Решение сдано');
            await reloadAssignments(id);
        } catch (e) { fail('Не сдалось: ' + e.message); }
    }

    // --- Модалка группы ---
    const groupModal = $('group-modal');
    let editGroupId = null;
    const openGroupModal = (gid, name) => {
        editGroupId = gid || null;
        if ($('gError')) $('gError').textContent = '';
        if ($('gName')) $('gName').value = name || '';
        const h = groupModal ? groupModal.querySelector('h2') : null;
        if (h) h.textContent = editGroupId ? 'Переименовать группу' : 'Новая группа';
        if ($('gSubmit')) $('gSubmit').textContent = editGroupId ? 'Сохранить' : 'Создать группу';
        if (groupModal) groupModal.hidden = false;
        if ($('gName')) $('gName').focus();
    };
    const closeGroupModal = () => { if (groupModal) groupModal.hidden = true; };
    if (groupModal) groupModal.addEventListener('mousedown', (e) => { if (e.target === groupModal) closeGroupModal(); });

    if (btnCreateGroup) btnCreateGroup.addEventListener('click', () => openGroupModal());
    if ($('gClose')) $('gClose').addEventListener('click', closeGroupModal);
    if ($('gSubmit')) $('gSubmit').addEventListener('click', async () => {
        const name = ($('gName').value || '').trim();
        if (!name) { if ($('gError')) $('gError').textContent = 'Введите название группы'; return; }
        try {
            if (editGroupId) {
                say('Сохранение…');
                await cloud.renameGroup(editGroupId, name);
                ok('Группа переименована');
                closeGroupModal();
                await reloadGroups(editGroupId);
            } else {
                say('Создание группы…');
                const g = await cloud.createGroup(name);
                ok('Группа создана: ' + g.name);
                closeGroupModal();
                await reloadGroups(g.id);
            }
        } catch (e) { if ($('gError')) $('gError').textContent = e.message; }
    });

    if (btnJoinGroup) btnJoinGroup.addEventListener('click', async () => {
        try {
            let gid = curGroupId;
            if (!gid && groupName.value.trim()) {
                const all = await cloud.listGroups();
                const found = (all || []).find((g) => g.name.toLowerCase() === groupName.value.trim().toLowerCase());
                if (!found) { fail('Группа не найдена: ' + groupName.value.trim()); return; }
                gid = found.id;
            }
            if (!gid) { say('Выберите группу в списке или введите её название'); return; }
            say('Вход в группу…');
            await cloud.joinGroup(gid);
            ok('Вы в группе');
            await reloadGroups(gid);
        } catch (e) { fail('Не вошло в группу: ' + e.message); }
    });

    // --- Модалка задания ---
    const assignModal = $('assign-modal');
    let editAssignId = null;
    const openAssignModal = (aid, title, task, dueAt, imageUrl) => {
        if (!curGroupId) { say('Сначала выберите группу'); return; }
        editAssignId = aid || null;
        if ($('aError')) $('aError').textContent = '';
        if ($('aTitle')) $('aTitle').value = title || '';
        if ($('aTask')) $('aTask').value = task !== undefined ? task : (editor.getValue() || '');
        if ($('aDue')) $('aDue').value = toLocalInput(dueAt);
        if ($('aImage')) $('aImage').value = '';
        const pv = $('aImagePreview');
        if (pv) { if (imageUrl) { pv.src = imageUrl; pv.hidden = false; } else { pv.removeAttribute('src'); pv.hidden = true; } }
        const h = assignModal ? assignModal.querySelector('h2') : null;
        if (h) h.textContent = editAssignId ? 'Изменить задание' : 'Новое задание';
        if ($('aSubmit')) $('aSubmit').textContent = editAssignId ? 'Сохранить' : 'Опубликовать задание';
        if ($('aGroupHint')) {
            const g = groupList.querySelector('.pick-item.active');
            $('aGroupHint').textContent = 'Группа: ' + (g ? g.textContent : '—');
        }
        if (assignModal) assignModal.hidden = false;
        if ($('aTitle')) $('aTitle').focus();
    };
    const closeAssignModal = () => { if (assignModal) assignModal.hidden = true; };
    if (assignModal) assignModal.addEventListener('mousedown', (e) => { if (e.target === assignModal) closeAssignModal(); });

    const aImageInput = $('aImage');
    if (aImageInput) aImageInput.addEventListener('change', () => {
        const pv = $('aImagePreview');
        const f = aImageInput.files && aImageInput.files[0];
        if (pv) {
            if (f) { pv.src = URL.createObjectURL(f); pv.hidden = false; }
            else { pv.removeAttribute('src'); pv.hidden = true; }
        }
    });

    if (btnNewAssign) btnNewAssign.addEventListener('click', () => openAssignModal());
    if ($('aClose')) $('aClose').addEventListener('click', closeAssignModal);
    if ($('aSubmit')) $('aSubmit').addEventListener('click', async () => {
        const title = ($('aTitle').value || '').trim() || 'Задание';
        const taskText = $('aTask').value || '';
        const dueVal = $('aDue') && $('aDue').value ? new Date($('aDue').value).toISOString() : null;
        try {
            // Загрузка фото, если выбрано
            let imageUrl = null;
            let keepOldImage = true;
            const imgInput = $('aImage');
            const imgFile = imgInput && imgInput.files && imgInput.files[0];
            if (imgFile) {
                say('Загрузка фото…');
                imageUrl = await cloud.uploadAssignmentImage(imgFile);
                keepOldImage = false;
            }
            if (editAssignId) {
                say('Сохранение…');
                const patch = { title, task_text: taskText, due_at: dueVal };
                if (!keepOldImage) patch.image_url = imageUrl;
                await cloud.updateAssignment(editAssignId, patch);
                ok('Задание обновлено');
                closeAssignModal();
                await reloadAssignments(editAssignId);
            } else {
                say('Публикация задания…');
                const a = await cloud.createAssignment(curGroupId, title, taskText, dueVal, imageUrl);
                ok('Задание дано: ' + a.title);
                closeAssignModal();
                await reloadAssignments(a.id);
            }
        } catch (e) { if ($('aError')) $('aError').textContent = ruErr(e); }
    });

    if (btnSubmitAssign) btnSubmitAssign.addEventListener('click', () => submitCurrent());

    // --- Стартовое окно входа ----------------------------------------------
    const authModal = $('auth-modal');
    const tabLogin = $('tabLogin');
    const tabRegister = $('tabRegister');
    const mEmail = $('mEmail');
    const mPass = $('mPass');
    const mSubmit = $('mSubmit');
    const mError = $('mError');
    let authMode = 'login';

    function switchAuthMode(mode) {
        authMode = mode;
        if (tabLogin) tabLogin.classList.toggle('active', mode === 'login');
        if (tabRegister) tabRegister.classList.toggle('active', mode === 'register');
        if (mSubmit) mSubmit.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт ученика';
        if (mError) mError.textContent = '';
        const tRow = document.querySelector('.teacher-check');
        if (tRow) tRow.style.display = mode === 'login' ? 'flex' : 'none';

    }

    function showAuthModal() {
        switchAuthMode('login');
        if (authModal) authModal.hidden = false;
    }
    function hideAuthModal() { if (authModal) authModal.hidden = true; }

    if (tabLogin) tabLogin.addEventListener('click', () => switchAuthMode('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => switchAuthMode('register'));
    if (mSubmit) mSubmit.addEventListener('click', async () => {
        const email = mEmail.value.trim();
        const pass = mPass.value;
        if (!validCreds(email, pass)) { if (mError) mError.textContent = cloudStatus.textContent; return; }
        if (mError) mError.textContent = '';
        mSubmit.disabled = true;
        const done = authMode === 'login' ? await doLogin(email, pass) : await doRegister(email, pass);
        mSubmit.disabled = false;
        if (!done && mError) mError.textContent = cloudStatus.textContent;
    });
    for (const el of [mEmail, mPass]) {
        if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && mSubmit) mSubmit.click(); });
    }
    if ($('mSkip')) $('mSkip').addEventListener('click', () => {
        hideAuthModal();
        say('Офлайн-режим: схемы сохраняются только в файлы');
    });
    if ($('mClose')) $('mClose').addEventListener('click', () => hideAuthModal());
    if (authModal) authModal.addEventListener('mousedown', (e) => {
        if (e.target === authModal) hideAuthModal();
    });

    // --- Бургер-меню: группы и задания в отдельном окошке ----------------------
    const menuOverlay = $('menu-overlay');
    const openMenu = () => { if (menuOverlay) menuOverlay.hidden = false; };
    const closeMenu = () => { if (menuOverlay) menuOverlay.hidden = true; };
    if ($('btnMenu')) $('btnMenu').addEventListener('click', openMenu);
    if ($('menuClose')) $('menuClose').addEventListener('click', closeMenu);
    if (menuOverlay) menuOverlay.addEventListener('mousedown', (e) => {
        if (e.target === menuOverlay) closeMenu();
    });

    refreshAuthUI();
    if (!cloud.currentUser()) showAuthModal();

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
