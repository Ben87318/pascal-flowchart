// Слой связи с Supabase: Auth (email+пароль) + CRUD таблицы pascal_projects.
// Без внешних зависимостей — только fetch, поэтому работает и в браузере
// (file://), и в собранном Electron без npm-сборки.
// Сессия хранится в localStorage и переживает перезапуск.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const SESSION_KEY = 'pascalflow.session.v1';

function mem() {
  if (typeof localStorage !== 'undefined') return localStorage;
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
const store = mem();

export function getSession() {
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setSession(s) {
  if (!s) store.removeItem(SESSION_KEY);
  else store.setItem(SESSION_KEY, JSON.stringify(s));
  return s;
}

export function clearSession() {
  store.removeItem(SESSION_KEY);
}

export function currentUser() {
  const s = getSession();
  return s && s.user ? s.user : null;
}

function errMsg(res, fallback) {
  return res
    .json()
    .catch(() => ({}))
    .then((b) => {
      const m = b && (b.msg || b.message || b.error_description || b.error);
      throw new Error(m || fallback || ('HTTP ' + res.status));
    });
}

async function authCall(path, { method = 'POST', body = null, token = null } = {}) {
  const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(SUPABASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) await errMsg(res, 'Ошибка авторизации');
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

// --- Auth -----------------------------------------------------------------
async function ensureProfile() {
  // Страховка: если триггер handle_new_user не создал профиль,
  // создаём его сами (upsert по id). RLS-политика profiles_insert_own
  // разрешает вставку только собственной строки.
  const s = getSession();
  if (!s || !s.user) return;
  try {
    await rest('/profiles', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates',
      body: {
        id: s.user.id,
        email: s.user.email,
        display_name: (s.user.email || '').split('@')[0],
      },
    });
  } catch (e) {
    // Профиль уже есть или триггер его создал — не критично.
    console.warn('ensureProfile:', e.message);
  }
}

export async function signUp(email, password) {
  const data = await authCall('/auth/v1/signup', { body: { email, password } });
  // Локально confirmations выключены -> сессия приходит сразу.
  if (data && data.access_token) {
    setSession(data);
    await ensureProfile();
  }
  return data;
}

export async function signIn(email, password) {
  const data = await authCall('/auth/v1/token?grant_type=password', {
    body: { email, password },
  });
  if (data && data.access_token) {
    setSession(data);
    await ensureProfile();
  }
  return data;
}

export async function signOut() {
  const s = getSession();
  try {
    if (s && s.access_token) {
      await authCall('/auth/v1/logout', { token: s.access_token });
    }
  } catch {
    // разлогиниваем локально даже если сервер уже забыл токен
  }
  clearSession();
}

export async function refreshSession() {
  const s = getSession();
  if (!s || !s.refresh_token) throw new Error('Нет сессии — войдите заново.');
  const data = await authCall('/auth/v1/token?grant_type=refresh_token', {
    body: { refresh_token: s.refresh_token },
  });
  setSession(data);
  return data;
}

async function ensureSession() {
  let s = getSession();
  if (!s || !s.access_token) throw new Error('Войдите в аккаунт.');
  // Обновляем токен за 60 сек до истечения.
  const exp = s.expires_at ? s.expires_at * 1000 : 0;
  if (exp && Date.now() > exp - 60000) {
    try {
      s = await refreshSession();
    } catch {
      clearSession();
      throw new Error('Сессия истекла — войдите заново.');
    }
  }
  return s;
}

// --- REST ------------------------------------------------------------------
async function rest(path, { method = 'GET', body = null, prefer = null } = {}) {
  const s = await ensureSession();
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + s.access_token,
    'Content-Type': 'application/json',
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(SUPABASE_URL + '/rest/v1' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    // Один раз пробуем refresh и повторяем.
    try {
      const ns = await refreshSession();
      headers['Authorization'] = 'Bearer ' + ns.access_token;
      const retry = await fetch(SUPABASE_URL + '/rest/v1' + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) await errMsg(retry, 'Ошибка базы данных');
      if (retry.status === 204) return null;
      return retry.json();
    } catch (e) {
      throw e;
    }
  }
  if (!res.ok) await errMsg(res, 'Ошибка базы данных');
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

// --- Проекты ----------------------------------------------------------------
export function listProjects() {
  return rest('/pascal_projects?select=id,title,updated_at&order=updated_at.desc');
}

export function getProject(id) {
  return rest('/pascal_projects?id=eq.' + encodeURIComponent(id) + '&select=id,title,code,updated_at').then(
    (rows) => {
      if (!rows || rows.length === 0) throw new Error('Проект не найден.');
      return rows[0];
    }
  );
}

export async function createProject(title, code) {
  const s = await ensureSession();
  const rows = await rest('/pascal_projects', {
    method: 'POST',
    prefer: 'return=representation',
    body: { owner_id: s.user.id, title: title || 'Без названия', code: code || '' },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateProject(id, { title, code }) {
  const patch = {};
  if (typeof title !== 'undefined') patch.title = title;
  if (typeof code !== 'undefined') patch.code = code;
  const rows = await rest('/pascal_projects?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export function deleteProject(id) {
  return rest('/pascal_projects?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
}

export function getProfile() {
  return rest('/profiles?select=id,email,display_name').then((rows) =>
    rows && rows.length ? rows[0] : null
  );
}

// --- Учитель / ученик: роли, группы, задания ---------------------------------
// Роль определяем по profile_roles. Регистрация с выбором роли:
// handle_new_user дает student, chooseRole добивает teacher при нужде.
export async function getMyRoles() {
  const rows = await rest('/profile_roles?select=roles(name)');
  return (rows || []).map((r) => r.roles && r.roles.name).filter(Boolean);
}

// Роль учителя выдает только администратор через SQL.
// Ученик получает роль student автоматически триггером handle_new_user.

export function listGroups() {
  return rest('/groups?select=id,name,teacher_id&order=name');
}

export async function createGroup(name) {
  const s = await ensureSession();
  const rows = await rest('/groups', {
    method: 'POST',
    prefer: 'return=representation',
    body: { name: (name || '').trim(), teacher_id: s.user.id },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export function myTeachingGroups() {
  return ensureSession().then((s) =>
    rest('/groups?teacher_id=eq.' + encodeURIComponent(s.user.id) + '&select=id,name&order=name')
  );
}

export function myStudentGroups() {
  return ensureSession().then((s) =>
    rest(
      '/group_members?profile_id=eq.' + encodeURIComponent(s.user.id) + '&select=group_id,groups(id,name)'
    )
  );
}

export async function joinGroup(groupId) {
  const s = await ensureSession();
  return rest('/group_members', {
    method: 'POST',
    prefer: 'return=representation,resolution=merge-duplicates',
    body: { group_id: groupId, profile_id: s.user.id },
  });
}

export function listAssignments(groupId) {
  return rest(
    '/assignments?group_id=eq.' + encodeURIComponent(groupId) + '&select=id,title,task_text,due_at,image_url,created_at&order=created_at.desc'
  );
}

export async function createAssignment(groupId, title, taskText, dueAt, imageUrl) {
  const s = await ensureSession();
  const rows = await rest('/assignments', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      group_id: groupId,
      teacher_id: s.user.id,
      title: (title || 'Задание').trim(),
      task_text: taskText || '',
      due_at: dueAt || null,
      image_url: imageUrl || null,
    },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}


// Загрузка фото задания в Supabase Storage, возвращает публичную ссылку
export async function uploadAssignmentImage(file) {
  const s = await ensureSession();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  const name = 'a' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;
  const res = await fetch(SUPABASE_URL + '/storage/v1/object/assignment-images/' + encodeURIComponent(name), {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + s.access_token,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const b = await res.json(); msg = b.message || b.error || msg; } catch {}
    throw new Error(msg);
  }
  return SUPABASE_URL + '/storage/v1/object/public/assignment-images/' + encodeURIComponent(name);
}

export function listSubmissions(assignmentId) {
  return rest(
    '/submissions?assignment_id=eq.' +
      encodeURIComponent(assignmentId) +
      '&select=id,student_id,answer_code,grade,feedback,created_at&order=created_at.desc'
  );
}

export async function submitAssignment(assignmentId, answerCode, projectId) {
  const s = await ensureSession();
  const rows = await rest('/submissions', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      assignment_id: assignmentId,
      student_id: s.user.id,
      answer_code: answerCode || '',
      project_id: projectId || null,
    },
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

export function gradeSubmission(submissionId, grade, feedback) {
  const body = { grade: grade || '' };
  if (typeof feedback !== 'undefined') body.feedback = feedback || '';
  return rest('/submissions?id=eq.' + encodeURIComponent(submissionId), {
    method: 'PATCH',
    prefer: 'return=representation',
    body,
  });
}

// --- Списки для панелей --------------------------------------------------------
export function listGroupMembers(groupId) {
  return rest(
    '/group_members?group_id=eq.' +
      encodeURIComponent(groupId) +
      '&select=profile_id,joined_at,profiles(display_name,email)'
  );
}

export function mySubmissions() {
  return ensureSession().then((s) =>
    rest(
      '/submissions?student_id=eq.' +
        encodeURIComponent(s.user.id) +
        '&select=assignment_id,grade,feedback,created_at'
    )
  );
}

// --- Управление (учитель) --------------------------------------------------------
export function removeMember(groupId, profileId) {
  return rest(
    '/group_members?group_id=eq.' +
      encodeURIComponent(groupId) +
      '&profile_id=eq.' +
      encodeURIComponent(profileId),
    { method: 'DELETE' }
  );
}

export function leaveGroup(groupId) {
  return ensureSession().then((s) => removeMember(groupId, s.user.id));
}

export function renameGroup(groupId, name) {
  return rest('/groups?id=eq.' + encodeURIComponent(groupId), {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { name: (name || '').trim() },
  });
}

export function deleteGroup(groupId) {
  return rest('/groups?id=eq.' + encodeURIComponent(groupId), { method: 'DELETE' });
}

export function updateAssignment(assignmentId, { title, task_text, due_at, image_url }) {
  const patch = {};
  if (typeof title !== 'undefined') patch.title = title;
  if (typeof task_text !== 'undefined') patch.task_text = task_text;
  if (typeof due_at !== 'undefined') patch.due_at = due_at || null;
  if (typeof image_url !== 'undefined') patch.image_url = image_url || null;
  return rest('/assignments?id=eq.' + encodeURIComponent(assignmentId), {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch,
  });
}

export function deleteAssignment(assignmentId) {
  return rest('/assignments?id=eq.' + encodeURIComponent(assignmentId), { method: 'DELETE' });
}
