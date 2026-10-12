// Philippine address lists (Region → Province → City/Municipality → Barangay) from the
// public PSGC API (Philippine Standard Geographic Code). Responses are cached per session.
const PSGC_BASE = 'https://psgc.gitlab.io/api';
const cache = new Map();

async function getList(path) {
  if (cache.has(path)) return cache.get(path);
  const request = fetch(`${PSGC_BASE}${path}`)
    .then(res => {
      if (!res.ok) throw new Error(`PSGC request failed (${res.status})`);
      return res.json();
    })
    .then(rows => rows
      .map(r => ({ code: r.code, name: r.name, label: r.regionName ? `${r.regionName} – ${r.name}` : r.name }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  cache.set(path, request);
  request.catch(() => cache.delete(path));
  return request;
}

export const getRegions = async () => {
  const regions = await getList('/regions/');
  // Keep the official Region I, II, … order rather than alphabetical names.
  return [...regions].sort((a, b) => a.code.localeCompare(b.code));
};
export const getProvinces = (regionCode) => getList(`/regions/${regionCode}/provinces/`);
// Regions without provinces (e.g. NCR) list their cities directly.
export const getCitiesByRegion = (regionCode) => getList(`/regions/${regionCode}/cities-municipalities/`);
export const getCities = (provinceCode) => getList(`/provinces/${provinceCode}/cities-municipalities/`);
export const getBarangays = (cityCode) => getList(`/cities-municipalities/${cityCode}/barangays/`);
