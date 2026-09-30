// Image search, same sources as PinPlay: Pexels via the pinplay-api worker, Openverse as fallback.

const IMAGE_API = 'https://pinplay-api.eugenime.workers.dev';

async function searchPexels(query, count) {
  const res = await fetch(`${IMAGE_API}/api/images/search?q=${encodeURIComponent(query)}&count=${count}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Image search failed (HTTP ${res.status}).`);
  return (data.items || []).filter((it) => it && it.url).map((it) => ({ url: it.url, thumb: it.thumb || it.url }));
}

async function searchOpenverse(query, count) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', String(Math.min(count, 20)));
  url.searchParams.set('mature', 'false');
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Openverse failed (HTTP ${res.status}).`);
  const data = await res.json();
  return (data.results || []).filter((it) => it && it.url).map((it) => ({ url: it.url, thumb: it.thumbnail || it.url }));
}

async function searchImages(query, count = 12) {
  const q = String(query || '').trim();
  if (!q) return [];
  try {
    const items = await searchPexels(q, count);
    if (items.length) return items;
  } catch (err) {
    console.warn(err);
  }
  try {
    return await searchOpenverse(q, count);
  } catch (err) {
    console.warn(err);
    return [];
  }
}

// Shrink an uploaded photo so it fits comfortably in localStorage.
function fileToDataUrl(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('Could not read that image.')); };
    img.src = src;
  });
}
