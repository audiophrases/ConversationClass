// Lessons shared through the repo's rounds/ folder on GitHub. Read-only and
// token-free: the folder is listed through GitHub's public API, and each file
// is downloaded once per version (by its blob sha) and cached in this browser,
// so a normal page load costs one API request (GitHub allows 60 an hour).

const ROUNDS_FOLDER = { owner: 'audiophrases', repo: 'ConversationClass', branch: 'main', path: 'rounds' };
const ROUNDS_CACHE_KEY = 'conversationClass.rounds';
const GITHUB_REPO_API = `https://api.github.com/repos/${ROUNDS_FOLDER.owner}/${ROUNDS_FOLDER.repo}`;

// The folder on github.com, or its "Upload files" page.
function roundsFolderLink(upload = false) {
  const { owner, repo, branch, path } = ROUNDS_FOLDER;
  return `https://github.com/${owner}/${repo}/${upload ? 'upload' : 'tree'}/${branch}/${path}`;
}

function loadRoundsCache() {
  try {
    const data = JSON.parse(localStorage.getItem(ROUNDS_CACHE_KEY));
    if (data && Array.isArray(data.files)) return data;
  } catch { /* fall through */ }
  return { files: [], checkedAt: 0 };
}

function saveRoundsCache(cache) {
  try {
    localStorage.setItem(ROUNDS_CACHE_KEY, JSON.stringify(cache));
  } catch { /* storage full: the lessons still work until the page is reloaded */ }
}

// List the folder and download new or changed .json files. `parse(text, name)`
// turns a file into a session and throws if the file isn't a valid lesson.
// Resolves to { files: [{ path, name, sha, session } or { ..., error }], checkedAt }.
async function fetchRoundsFolder(cache, parse) {
  const { branch, path } = ROUNDS_FOLDER;
  const res = await fetch(`${GITHUB_REPO_API}/contents/${path}?ref=${branch}`, { headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 404) return { files: [], checkedAt: Date.now() }; // no rounds folder yet
  if (res.status === 403 || res.status === 429) throw new Error('GitHub is busy, try again later');
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`);
  const list = (await res.json()).filter((f) => f.type === 'file' && /\.json$/i.test(f.name));
  const known = new Map(cache.files.map((f) => [f.path, f]));
  const files = await Promise.all(list.map(async ({ path: filePath, name, sha }) => {
    const old = known.get(filePath);
    if (old && old.sha === sha && !old.error) return old;
    try {
      const blob = await fetch(`${GITHUB_REPO_API}/git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
      if (!blob.ok) throw new Error(`couldn't download it (HTTP ${blob.status})`);
      return { path: filePath, name, sha, session: parse(await blob.text(), name) };
    } catch (err) {
      return { path: filePath, name, sha, error: err.message };
    }
  }));
  return { files, checkedAt: Date.now() };
}
