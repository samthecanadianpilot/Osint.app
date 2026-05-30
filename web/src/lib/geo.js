// Great-circle helpers — mirror of the backend's geo.js so the in-browser
// simulation (Path B / Vercel) moves tracks identically to the server.
const R = 6371; // km
const toRad = d => (d * Math.PI) / 180;
const toDeg = r => (r * 180) / Math.PI;

export function movePoint(lat, lng, bearingDeg, distanceKm) {
  const ad = distanceKm / R;
  const br = toRad(bearingDeg);
  const la1 = toRad(lat);
  const lo1 = toRad(lng);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(ad) + Math.cos(la1) * Math.sin(ad) * Math.cos(br)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(ad) * Math.cos(la1),
      Math.cos(ad) - Math.sin(la1) * Math.sin(la2)
    );
  return { lat: toDeg(la2), lng: ((toDeg(lo2) + 540) % 360) - 180 };
}

export const KTS_TO_KMH = 1.852;
